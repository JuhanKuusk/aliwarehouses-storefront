#!/usr/bin/env npx tsx
/**
 * Import AliExpress Products to Shopify
 *
 * Usage:
 *   npx tsx scripts/import-to-shopify.ts --limit 10
 *   npx tsx scripts/import-to-shopify.ts --category garden --limit 50
 *   npx tsx scripts/import-to-shopify.ts --country DE --limit 20
 *
 * Options:
 *   --limit <number>      Max products to import (default: 10)
 *   --category <string>   Filter by category
 *   --country <string>    Filter by warehouse country
 *   --dry-run             Show what would be imported without actually importing
 *
 * Requirements:
 *   - SHOPIFY_ADMIN_API_TOKEN in .env.local
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });

import { createAdminClient, getProductsByStatus, updateProductStatus } from '../src/lib/supabase/aliexpress';
import type { AliexpressProductRecord } from '../src/lib/aliexpress/types';

// Shopify Admin API configuration
const SHOPIFY_DOMAIN = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN!;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN;
const SHOPIFY_API_VERSION = '2024-10';

interface ShopifyProductInput {
  title: string;
  body_html: string;
  vendor: string;
  product_type: string;
  tags: string[];
  images: Array<{ src: string }>;
  variants: Array<{
    price: string;
    compare_at_price?: string;
    inventory_management: string;
    inventory_policy: string;
  }>;
  metafields?: Array<{
    namespace: string;
    key: string;
    value: string;
    type: string;
  }>;
}

// Parse command line arguments
function parseArgs(): {
  limit: number;
  category?: string;
  country?: string;
  dryRun: boolean;
} {
  const args = process.argv.slice(2);
  const result = {
    limit: 10,
    category: undefined as string | undefined,
    country: undefined as string | undefined,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--limit':
      case '-l':
        result.limit = parseInt(nextArg) || 10;
        i++;
        break;
      case '--category':
      case '-c':
        result.category = nextArg;
        i++;
        break;
      case '--country':
        result.country = nextArg?.toUpperCase();
        i++;
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
Import AliExpress Products to Shopify

Usage:
  npx tsx scripts/import-to-shopify.ts [options]

Options:
  --limit, -l <number>     Max products to import (default: 10)
  --category, -c <string>  Filter by category
  --country <string>       Filter by warehouse country (e.g., DE, FR)
  --dry-run                Show what would be imported without actually importing
  --help, -h               Show this help message

Examples:
  # Import 10 pending products
  npx tsx scripts/import-to-shopify.ts --limit 10

  # Import garden category products
  npx tsx scripts/import-to-shopify.ts --category garden --limit 20

  # Dry run to see what would be imported
  npx tsx scripts/import-to-shopify.ts --limit 5 --dry-run

Requirements:
  Add SHOPIFY_ADMIN_API_TOKEN to your .env.local file
  Get it from: Shopify Admin > Settings > Apps > Develop apps
`);
}

/**
 * Create a Shopify product from AliExpress data
 */
async function createShopifyProduct(product: AliexpressProductRecord): Promise<string | null> {
  if (!SHOPIFY_ADMIN_TOKEN) {
    throw new Error('SHOPIFY_ADMIN_API_TOKEN is required');
  }

  const productInput: ShopifyProductInput = {
    title: product.title,
    body_html: product.description || `<p>Ships from ${product.ships_from_display || product.ships_from}</p>`,
    vendor: product.seller_name || 'AliExpress EU',
    product_type: product.category || 'General',
    tags: [
      'EU-Warehouse',
      `Ships-From-${product.ships_from}`,
      product.category || '',
      'AliExpress-Import',
    ].filter(Boolean),
    images: product.main_image_url ? [{ src: product.main_image_url }] : [],
    variants: [{
      price: (product.price || 0).toFixed(2),
      compare_at_price: product.original_price ? product.original_price.toFixed(2) : undefined,
      inventory_management: 'shopify',
      inventory_policy: 'continue',
    }],
    metafields: [
      {
        namespace: 'aliexpress',
        key: 'product_id',
        value: product.aliexpress_product_id,
        type: 'single_line_text_field',
      },
      {
        namespace: 'aliexpress',
        key: 'url',
        value: product.aliexpress_url,
        type: 'url',
      },
      {
        namespace: 'aliexpress',
        key: 'ships_from',
        value: product.ships_from,
        type: 'single_line_text_field',
      },
    ],
  };

  // Add additional images if available
  if (product.image_urls && Array.isArray(product.image_urls)) {
    product.image_urls.slice(0, 9).forEach((url: string) => {
      if (url && url !== product.main_image_url) {
        productInput.images.push({ src: url });
      }
    });
  }

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
    throw new Error(`Shopify API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.product?.id?.toString() || null;
}

async function main(): Promise<void> {
  const args = parseArgs();

  console.log('\n📦 Import AliExpress Products to Shopify\n');

  // Check for Admin API token
  if (!SHOPIFY_ADMIN_TOKEN) {
    console.error('❌ Error: SHOPIFY_ADMIN_API_TOKEN is not set in .env.local');
    console.log('\nTo get your Admin API token:');
    console.log('1. Go to Shopify Admin > Settings > Apps');
    console.log('2. Click "Develop apps" > Create an app');
    console.log('3. Configure Admin API scopes (write_products, read_products)');
    console.log('4. Install the app and copy the Admin API access token');
    console.log('5. Add to .env.local: SHOPIFY_ADMIN_API_TOKEN=your_token_here\n');
    process.exit(1);
  }

  console.log(`Store: ${SHOPIFY_DOMAIN}`);
  console.log(`Limit: ${args.limit}`);
  if (args.category) console.log(`Category filter: ${args.category}`);
  if (args.country) console.log(`Country filter: ${args.country}`);
  console.log(`Dry run: ${args.dryRun}`);
  console.log('');

  // Get pending products from Supabase
  const supabase = createAdminClient();
  let products = await getProductsByStatus(supabase, 'pending', args.limit * 2);

  // Apply filters
  if (args.category) {
    products = products.filter(p => p.category === args.category);
  }
  if (args.country) {
    products = products.filter(p => p.ships_from === args.country);
  }

  // Limit results
  products = products.slice(0, args.limit);

  if (products.length === 0) {
    console.log('No pending products found matching your criteria.\n');
    console.log('Try running the scraper first:');
    console.log('  npx tsx scripts/scrape-aliexpress-eu.ts --query "your search term"\n');
    return;
  }

  console.log(`Found ${products.length} products to import:\n`);

  let imported = 0;
  let errors = 0;

  for (const product of products) {
    console.log(`${imported + errors + 1}. ${product.title.substring(0, 50)}...`);
    console.log(`   Price: €${product.price} | Ships from: ${product.ships_from}`);

    if (args.dryRun) {
      console.log(`   [DRY RUN] Would import to Shopify\n`);
      continue;
    }

    try {
      const shopifyProductId = await createShopifyProduct(product);

      if (shopifyProductId) {
        await updateProductStatus(supabase, product.aliexpress_product_id, 'imported', shopifyProductId);
        console.log(`   ✅ Imported! Shopify ID: ${shopifyProductId}\n`);
        imported++;
      } else {
        throw new Error('No product ID returned');
      }

      // Rate limiting - wait between requests
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.log(`   ❌ Error: ${error}\n`);
      errors++;
    }
  }

  // Summary
  console.log('\n📊 Summary:');
  console.log(`├─ Total processed: ${products.length}`);
  console.log(`├─ Imported: ${imported}`);
  console.log(`└─ Errors: ${errors}`);

  if (args.dryRun) {
    console.log('\n🏃 Dry run mode - no products were actually imported');
    console.log('Remove --dry-run to import products to Shopify\n');
  } else if (imported > 0) {
    console.log('\n✅ Products imported successfully!');
    console.log(`View in Shopify Admin: https://${SHOPIFY_DOMAIN}/admin/products\n`);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
