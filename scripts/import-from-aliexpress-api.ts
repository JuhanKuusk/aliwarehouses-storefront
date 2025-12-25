#!/usr/bin/env npx tsx
/**
 * Import Products from AliExpress Official API to Shopify
 *
 * Uses:
 * - AliExpress Dropshipping API (official) for product data
 * - DeepL API for translations
 * - Shopify Admin API for product upload
 *
 * Usage:
 *   npx tsx scripts/import-from-aliexpress-api.ts --product-ids 1005001234567890,1005009876543210
 *   npx tsx scripts/import-from-aliexpress-api.ts --url "https://www.aliexpress.com/item/1005001234567890.html"
 *   npx tsx scripts/import-from-aliexpress-api.ts --file products.txt
 *
 * Options:
 *   --product-ids <ids>   Comma-separated AliExpress product IDs
 *   --url <url>           Single AliExpress product URL
 *   --file <path>         File with product IDs (one per line)
 *   --country <code>      Ship-to country (default: EE)
 *   --translate <lang>    Target language for translation (default: EN)
 *   --dry-run             Show what would be imported without uploading
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });

import { AliExpressClient, AliExpressProductResponse } from '../src/lib/aliexpress/client';

// Shopify Admin API configuration
const SHOPIFY_DOMAIN = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN!;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN!;
const SHOPIFY_API_VERSION = '2024-10';

// DeepL API configuration
const DEEPL_API_KEY = process.env.DEEPL_API_KEY!;
const DEEPL_API_URL = 'https://api.deepl.com/v2/translate';

// Target languages for EU storefront
const EU_LANGUAGES = ['EN', 'DE', 'ET', 'FR', 'RU', 'PT'];

interface CommandArgs {
  productIds: string[];
  country: string;
  targetLang: string;
  dryRun: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(): CommandArgs {
  const args = process.argv.slice(2);
  const result: CommandArgs = {
    productIds: [],
    country: 'DE', // Germany as default - better EU warehouse availability
    targetLang: 'EN',
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--product-ids':
        if (nextArg) {
          result.productIds = nextArg.split(',').map(id => id.trim());
          i++;
        }
        break;
      case '--url':
        if (nextArg) {
          // Extract product ID from URL
          const match = nextArg.match(/\/item\/(\d+)/);
          if (match) {
            result.productIds.push(match[1]);
          }
          i++;
        }
        break;
      case '--file':
        if (nextArg) {
          const content = readFileSync(nextArg, 'utf-8');
          const ids = content.split('\n')
            .map(line => line.trim())
            .filter(line => line && /^\d+$/.test(line));
          result.productIds.push(...ids);
          i++;
        }
        break;
      case '--country':
        if (nextArg) {
          result.country = nextArg.toUpperCase();
          i++;
        }
        break;
      case '--translate':
        if (nextArg) {
          result.targetLang = nextArg.toUpperCase();
          i++;
        }
        break;
      case '--dry-run':
        result.dryRun = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
Import Products from AliExpress Official API to Shopify

Usage:
  npx tsx scripts/import-from-aliexpress-api.ts [options]

Options:
  --product-ids <ids>    Comma-separated AliExpress product IDs
  --url <url>            Single AliExpress product URL
  --file <path>          File with product IDs (one per line)
  --country <code>       Ship-to country (default: EE)
  --translate <lang>     Target language (default: EN)
  --dry-run              Show what would be imported without uploading
  --help, -h             Show this help message

Examples:
  # Import single product
  npx tsx scripts/import-from-aliexpress-api.ts --product-ids 1005001234567890

  # Import from URL
  npx tsx scripts/import-from-aliexpress-api.ts --url "https://www.aliexpress.com/item/1005001234567890.html"

  # Import multiple products
  npx tsx scripts/import-from-aliexpress-api.ts --product-ids 1005001234567890,1005009876543210

  # Dry run
  npx tsx scripts/import-from-aliexpress-api.ts --product-ids 1005001234567890 --dry-run
`);
}

/**
 * Translate text using DeepL API
 */
async function translateText(text: string, targetLang: string): Promise<string> {
  if (!text || !DEEPL_API_KEY) return text;

  try {
    const response = await fetch(DEEPL_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: [text],
        target_lang: targetLang,
      }),
    });

    if (!response.ok) {
      console.log(`   DeepL translation failed: ${response.status}`);
      return text;
    }

    const data = await response.json();
    return data.translations?.[0]?.text || text;
  } catch (error) {
    console.log(`   Translation error: ${error}`);
    return text;
  }
}

/**
 * Normalize image URL - ensure https:// prefix
 */
function normalizeImageUrl(url: string): string {
  if (url.startsWith('//')) {
    return 'https:' + url;
  }
  return url;
}

interface ShopifyProductInput {
  title: string;
  body_html: string;
  vendor: string;
  product_type: string;
  status: 'active' | 'draft' | 'archived';
  published: boolean;
  tags: string[];
  images: Array<{ src: string }>;
  variants: Array<{
    price: string;
    compare_at_price?: string;
    inventory_management: string;
    inventory_policy: string;
    inventory_quantity?: number;
  }>;
  metafields?: Array<{
    namespace: string;
    key: string;
    value: string;
    type: string;
  }>;
}

// AliWarehouses sales channel publication ID
const ALIWAREHOUSES_PUB_ID = 'gid://shopify/Publication/172384092348';

/**
 * Publish product to AliWarehouses storefront sales channel
 */
async function publishToStorefront(shopifyId: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
        },
        body: JSON.stringify({
          query: `mutation publishProduct($id: ID!, $input: [PublicationInput!]!) {
            publishablePublish(id: $id, input: $input) {
              publishable { ... on Product { id } }
              userErrors { field message }
            }
          }`,
          variables: {
            id: `gid://shopify/Product/${shopifyId}`,
            input: [{ publicationId: ALIWAREHOUSES_PUB_ID }]
          }
        }),
      }
    );

    const data = await response.json();
    return data.data?.publishablePublish?.userErrors?.length === 0;
  } catch {
    return false;
  }
}

/**
 * Upload product to Shopify Admin API
 */
async function uploadToShopify(productInput: ShopifyProductInput): Promise<{ success: boolean; shopifyId?: string; error?: string }> {
  try {
    const response = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/products.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
        },
        body: JSON.stringify({ product: productInput }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Shopify API error: ${response.status} - ${errorText}` };
    }

    const data = await response.json();
    const shopifyId = data.product?.id?.toString();

    // Auto-publish to storefront
    if (shopifyId) {
      await publishToStorefront(shopifyId);
    }

    return { success: true, shopifyId };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Process a single product from AliExpress API
 */
async function processProduct(
  client: AliExpressClient,
  productId: string,
  country: string,
  targetLang: string,
  dryRun: boolean
): Promise<{ success: boolean; title?: string; shopifyId?: string; error?: string }> {
  console.log(`\n📦 Fetching product ${productId} from AliExpress API...`);

  // Fetch product data from AliExpress API
  const result = await client.getProduct(productId, country, 'EUR', targetLang);

  if (!result.success || !result.data) {
    return { success: false, error: result.error || 'Failed to fetch product' };
  }

  const productData = result.data;
  const baseInfo = productData.aliexpress_ds_product_get_response?.result?.ae_item_base_info_dto;

  if (!baseInfo) {
    return { success: false, error: 'No product data returned' };
  }

  // Extract product information
  const title = baseInfo.subject || 'Untitled Product';
  const description = baseInfo.detail || baseInfo.mobile_detail || '';
  const images = client.getImagesFromProductData(productData);
  const { price, salePrice } = client.getPriceFromProductData(productData);
  const stock = client.getStockFromProductData(productData);

  console.log(`   Title: ${title.substring(0, 60)}...`);
  console.log(`   Price: €${price.toFixed(2)}${salePrice ? ` (Sale: €${salePrice.toFixed(2)})` : ''}`);
  console.log(`   Images: ${images.length}`);
  console.log(`   Stock: ${stock} units`);

  // Translate title if needed
  let translatedTitle = title;
  if (targetLang !== 'EN') {
    console.log(`   Translating to ${targetLang}...`);
    translatedTitle = await translateText(title, targetLang);
    console.log(`   Translated: ${translatedTitle.substring(0, 60)}...`);
  }

  if (dryRun) {
    console.log(`   [DRY RUN] Would upload to Shopify`);
    return { success: true, title: translatedTitle };
  }

  // Prepare Shopify product
  const shopifyProduct: ShopifyProductInput = {
    title: translatedTitle,
    body_html: description || `<p>Product imported from AliExpress</p>`,
    vendor: 'AliExpress EU',
    product_type: 'General',
    status: 'active',
    published: true,
    tags: ['EU-Warehouse', 'AliExpress-API', `Stock-${stock}`],
    images: images.slice(0, 10).map(url => ({ src: normalizeImageUrl(url) })),
    variants: [{
      price: (salePrice || price).toFixed(2),
      compare_at_price: salePrice ? price.toFixed(2) : undefined,
      inventory_management: 'shopify',
      inventory_policy: 'continue',
      inventory_quantity: Math.min(stock, 999),
    }],
    metafields: [
      {
        namespace: 'aliexpress',
        key: 'product_id',
        value: productId,
        type: 'single_line_text_field',
      },
      {
        namespace: 'aliexpress',
        key: 'url',
        value: `https://www.aliexpress.com/item/${productId}.html`,
        type: 'url',
      },
    ],
  };

  // Upload to Shopify
  console.log(`   Uploading to Shopify...`);
  const uploadResult = await uploadToShopify(shopifyProduct);

  if (uploadResult.success) {
    console.log(`   ✅ Uploaded! Shopify ID: ${uploadResult.shopifyId}`);
    return { success: true, title: translatedTitle, shopifyId: uploadResult.shopifyId };
  } else {
    console.log(`   ❌ Upload failed: ${uploadResult.error}`);
    return { success: false, error: uploadResult.error };
  }
}

async function main(): Promise<void> {
  const args = parseArgs();

  console.log('\n🚀 Import Products from AliExpress API to Shopify\n');

  // Validate configuration
  if (!SHOPIFY_ADMIN_TOKEN) {
    console.error('❌ SHOPIFY_ADMIN_API_TOKEN is not set');
    process.exit(1);
  }

  if (args.productIds.length === 0) {
    console.error('❌ No product IDs provided. Use --product-ids, --url, or --file');
    console.log('   Run with --help for usage information');
    process.exit(1);
  }

  console.log(`📋 Configuration:`);
  console.log(`   Products: ${args.productIds.length}`);
  console.log(`   Country: ${args.country}`);
  console.log(`   Language: ${args.targetLang}`);
  console.log(`   Dry Run: ${args.dryRun}`);
  console.log(`   DeepL: ${DEEPL_API_KEY ? '✅ Available' : '❌ Not configured'}`);

  // Initialize AliExpress client
  let client: AliExpressClient;
  try {
    client = new AliExpressClient();
    const oauth = client.getOAuth();
    const status = oauth.getStatus();

    if (!status.authorized) {
      console.error('\n❌ AliExpress OAuth not authorized');
      console.log('   Authorization URL:', oauth.getAuthorizationUrl());
      process.exit(1);
    }
    console.log(`   AliExpress API: ✅ Authorized`);
  } catch (error) {
    console.error('❌ Failed to initialize AliExpress client:', error);
    process.exit(1);
  }

  // Process each product
  let success = 0;
  let failed = 0;

  for (const productId of args.productIds) {
    try {
      const result = await processProduct(client, productId, args.country, args.targetLang, args.dryRun);

      if (result.success) {
        success++;
      } else {
        failed++;
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.log(`   ❌ Error: ${error}`);
      failed++;
    }
  }

  // Summary
  console.log('\n📊 Summary:');
  console.log(`   Total: ${args.productIds.length}`);
  console.log(`   Success: ${success}`);
  console.log(`   Failed: ${failed}`);

  if (args.dryRun) {
    console.log('\n🏃 Dry run mode - no products were uploaded');
    console.log('   Remove --dry-run to upload products to Shopify');
  } else if (success > 0) {
    console.log('\n✅ Products imported successfully!');
    console.log(`   View in Shopify Admin: https://${SHOPIFY_DOMAIN}/admin/products`);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
