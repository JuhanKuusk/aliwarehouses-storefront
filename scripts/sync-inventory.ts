#!/usr/bin/env npx tsx
/**
 * Sync Inventory from AliExpress to Shopify
 *
 * This script checks product availability on AliExpress using the official
 * Dropshipping API and updates Shopify inventory accordingly.
 * Run hourly via cron for dropshipping.
 *
 * Usage:
 *   npx tsx scripts/sync-inventory.ts                    # Uses official API (default)
 *   npx tsx scripts/sync-inventory.ts --limit 50
 *   npx tsx scripts/sync-inventory.ts --dry-run
 *   npx tsx scripts/sync-inventory.ts --use-scraperapi   # Legacy: page scraping
 *
 * Options:
 *   --limit <number>   Max products to check (default: all)
 *   --dry-run          Show what would change without updating
 *   --use-api          Use official AliExpress API (default, recommended)
 *   --use-scraperapi   Use ScraperAPI page scraping (legacy, less accurate)
 *
 * Cron example (every hour):
 *   0 * * * * cd /path/to/project && npx tsx scripts/sync-inventory.ts >> /var/log/inventory-sync.log 2>&1
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { AliExpressClient } from '../src/lib/aliexpress/client';

const SHOPIFY_DOMAIN = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN!;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN!;
const SHOPIFY_API_VERSION = '2024-10';
const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Inventory levels
const MAX_STOCK_DISPLAY = 9999; // Cap display at reasonable max
const OUT_OF_STOCK_QUANTITY = 0;

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  status: string;
  variants: Array<{
    id: number;
    inventory_item_id: number;
    inventory_quantity: number;
  }>;
  metafields?: Array<{
    namespace: string;
    key: string;
    value: string;
  }>;
}

interface ProductWithAliexpress {
  shopifyProduct: ShopifyProduct;
  aliexpressId: string;
  aliexpressUrl: string;
}

// Parse command line arguments
function parseArgs(): {
  limit?: number;
  dryRun: boolean;
  useApi: boolean;  // Default: true (official API)
  useScraperApi: boolean;  // Legacy: page scraping
} {
  const args = process.argv.slice(2);
  const result = {
    limit: undefined as number | undefined,
    dryRun: false,
    useApi: true,  // Default to official API
    useScraperApi: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--limit':
      case '-l':
        result.limit = parseInt(nextArg) || undefined;
        i++;
        break;
      case '--dry-run':
        result.dryRun = true;
        break;
      case '--use-api':
      case '--api':
        result.useApi = true;
        result.useScraperApi = false;
        break;
      case '--use-scraperapi':
      case '--scraperapi':
        result.useScraperApi = true;
        result.useApi = false;  // Disable API when using scraper
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
Sync Inventory from AliExpress to Shopify

Usage:
  npx tsx scripts/sync-inventory.ts [options]

Options:
  --limit, -l <number>   Max products to check (default: all)
  --dry-run              Show what would change without updating
  --use-api              Use official AliExpress API (default, recommended)
  --use-scraperapi       Use ScraperAPI page scraping (legacy, less accurate)
  --help, -h             Show this help message

Examples:
  # Sync all products using official API (default)
  npx tsx scripts/sync-inventory.ts

  # Dry run to see what would change
  npx tsx scripts/sync-inventory.ts --dry-run --limit 10

  # Legacy: Use ScraperAPI (less accurate)
  npx tsx scripts/sync-inventory.ts --use-scraperapi

Cron setup (hourly sync):
  0 * * * * cd /path/to/project && npx tsx scripts/sync-inventory.ts >> /var/log/inventory-sync.log 2>&1
`);
}

/**
 * Get the primary location ID by checking an existing inventory level
 * (Workaround: locations API requires read_locations scope)
 */
async function getLocationId(): Promise<string> {
  // First try the locations API
  const locationsRes = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/locations.json`,
    {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
        'Content-Type': 'application/json',
      },
    }
  );

  if (locationsRes.ok) {
    const data = await locationsRes.json();
    if (data.locations?.[0]?.id) {
      return data.locations[0].id.toString();
    }
  }

  // Fallback: Get location from an existing product's inventory level
  console.log('   (Using inventory level fallback for location ID)');
  const productsRes = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=1`,
    {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!productsRes.ok) {
    throw new Error('Could not fetch products to get location ID');
  }

  const productsData = await productsRes.json();
  const inventoryItemId = productsData.products?.[0]?.variants?.[0]?.inventory_item_id;

  if (!inventoryItemId) {
    throw new Error('No products with inventory found');
  }

  const inventoryRes = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/inventory_levels.json?inventory_item_ids=${inventoryItemId}`,
    {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!inventoryRes.ok) {
    throw new Error('Could not fetch inventory levels');
  }

  const inventoryData = await inventoryRes.json();
  const locationId = inventoryData.inventory_levels?.[0]?.location_id;

  if (!locationId) {
    throw new Error('No location ID found in inventory levels');
  }

  return locationId.toString();
}

/**
 * Fetch all products with their metafields
 */
async function fetchProductsWithMetafields(): Promise<ShopifyProduct[]> {
  const allProducts: ShopifyProduct[] = [];
  let pageInfo: string | null = null;

  do {
    const url = pageInfo
      ? `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=250&page_info=${pageInfo}`
      : `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=250`;

    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status}`);
    }

    const data = await response.json();
    allProducts.push(...(data.products || []));

    // Check for pagination
    const linkHeader = response.headers.get('Link');
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const match = linkHeader.match(/page_info=([^>&]+).*rel="next"/);
      pageInfo = match ? match[1] : null;
    } else {
      pageInfo = null;
    }

    await new Promise(r => setTimeout(r, 250)); // Rate limiting
  } while (pageInfo);

  return allProducts;
}

/**
 * Get AliExpress metafields for a product
 */
async function getAliexpressMetafields(productId: number): Promise<{ id?: string; url?: string }> {
  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/products/${productId}/metafields.json`,
    {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    return {};
  }

  const data = await response.json();
  const metafields = data.metafields || [];

  const aliexpressId = metafields.find(
    (m: { namespace: string; key: string }) => m.namespace === 'aliexpress' && m.key === 'product_id'
  )?.value;

  const aliexpressUrl = metafields.find(
    (m: { namespace: string; key: string }) => m.namespace === 'aliexpress' && m.key === 'url'
  )?.value;

  return { id: aliexpressId, url: aliexpressUrl };
}

// Cached API client instance
let aliexpressClient: AliExpressClient | null = null;

/**
 * Get or create AliExpress API client
 */
function getAliExpressClient(): AliExpressClient {
  if (!aliexpressClient) {
    aliexpressClient = new AliExpressClient();
  }
  return aliexpressClient;
}

/**
 * Check AliExpress product availability using official API
 * Returns actual stock quantity for accurate inventory sync
 */
async function checkAliexpressAvailabilityViaApi(
  productId: string
): Promise<{ available: boolean; stockQuantity: number; price: number; reason: string }> {
  try {
    const client = getAliExpressClient();
    const result = await client.getProduct(productId, 'EE', 'EUR', 'EN');

    if (!result.success || !result.data) {
      return {
        available: false, // Don't assume available on API error - keep current
        stockQuantity: -1, // Signal to skip update
        price: 0,
        reason: `api_error: ${result.error || 'unknown'}`,
      };
    }

    const stock = client.getStockFromProductData(result.data);
    const { price } = client.getPriceFromProductData(result.data);
    const productStatus = result.data.aliexpress_ds_product_get_response?.result?.ae_item_base_info_dto?.product_status_type;

    // Check if product is actively selling
    if (productStatus && productStatus !== 'onSelling') {
      return {
        available: false,
        stockQuantity: 0,
        price,
        reason: `product_status: ${productStatus}`,
      };
    }

    // Check stock quantity
    if (stock <= 0) {
      return {
        available: false,
        stockQuantity: 0,
        price,
        reason: 'out_of_stock',
      };
    }

    return {
      available: true,
      stockQuantity: stock,
      price,
      reason: `in_stock (${stock} units)`,
    };
  } catch (error) {
    console.error(`   API error for ${productId}:`, error);
    return {
      available: false, // Don't assume - keep current inventory
      stockQuantity: -1, // Signal to skip update
      price: 0,
      reason: 'api_exception',
    };
  }
}

/**
 * Check if AliExpress product is available using ScraperAPI (legacy)
 */
async function checkAliexpressAvailability(
  url: string,
  useScraperApi: boolean
): Promise<{ available: boolean; reason: string }> {
  try {
    let html: string;

    if (useScraperApi && SCRAPER_API_KEY) {
      const params = new URLSearchParams({
        api_key: SCRAPER_API_KEY,
        url: url,
        render: 'true',
        country_code: 'eu',
      });

      const response = await fetch(`https://api.scraperapi.com?${params.toString()}`);

      if (!response.ok) {
        return { available: true, reason: 'scraper_error' }; // Assume available on error
      }

      html = await response.text();
    } else {
      // Direct fetch (may be blocked)
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return { available: false, reason: 'product_removed' };
        }
        return { available: true, reason: 'fetch_error' };
      }

      html = await response.text();
    }

    // Check for out of stock indicators
    const outOfStockPatterns = [
      'out of stock',
      'sold out',
      'no longer available',
      'This item is no longer available',
      'unavailable',
      'Currently unavailable',
      '"inventory":0',
      '"quantity":0',
    ];

    const htmlLower = html.toLowerCase();

    for (const pattern of outOfStockPatterns) {
      if (htmlLower.includes(pattern.toLowerCase())) {
        return { available: false, reason: 'out_of_stock' };
      }
    }

    // Check for product page validity
    if (html.includes('Page Not Found') || html.includes('404')) {
      return { available: false, reason: 'product_removed' };
    }

    // Check for add to cart button (indicates available)
    if (html.includes('Add to Cart') || html.includes('Buy Now') || html.includes('addToCart')) {
      return { available: true, reason: 'in_stock' };
    }

    // Default to available
    return { available: true, reason: 'assumed_available' };

  } catch (error) {
    console.error(`   Error checking ${url}:`, error);
    return { available: true, reason: 'check_error' }; // Assume available on error
  }
}

/**
 * Update inventory level in Shopify
 */
async function updateInventoryLevel(
  inventoryItemId: number,
  locationId: string,
  quantity: number
): Promise<boolean> {
  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/inventory_levels/set.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        location_id: parseInt(locationId),
        inventory_item_id: inventoryItemId,
        available: quantity,
      }),
    }
  );

  return response.ok;
}

/**
 * Update last sync time in Supabase
 */
async function updateLastSyncTime(aliexpressId: string): Promise<void> {
  await supabase
    .from('aliexpress_products')
    .update({ last_checked_at: new Date().toISOString() })
    .eq('aliexpress_product_id', aliexpressId);
}

async function main(): Promise<void> {
  const args = parseArgs();
  const startTime = Date.now();

  console.log('\n📦 AliExpress → Shopify Inventory Sync\n');
  console.log(`Store: ${SHOPIFY_DOMAIN}`);
  console.log(`Dry run: ${args.dryRun}`);
  console.log(`Method: ${args.useApi ? '🔌 Official API (recommended)' : '🌐 ScraperAPI (legacy)'}`);
  if (args.limit) console.log(`Limit: ${args.limit}`);
  console.log('');

  // Get location ID
  const locationId = await getLocationId();
  console.log(`📍 Location ID: ${locationId}\n`);

  // Fetch all products
  console.log('📥 Fetching products from Shopify...');
  const products = await fetchProductsWithMetafields();
  console.log(`   Found ${products.length} total products\n`);

  // Filter products with AliExpress metafields
  console.log('🔍 Finding products with AliExpress links...');
  const productsWithAliexpress: ProductWithAliexpress[] = [];

  for (const product of products) {
    const metafields = await getAliexpressMetafields(product.id);

    if (metafields.id && metafields.url) {
      productsWithAliexpress.push({
        shopifyProduct: product,
        aliexpressId: metafields.id,
        aliexpressUrl: metafields.url,
      });
    }

    await new Promise(r => setTimeout(r, 100)); // Rate limiting
  }

  console.log(`   Found ${productsWithAliexpress.length} products with AliExpress links\n`);

  if (productsWithAliexpress.length === 0) {
    console.log('No products to sync.\n');
    return;
  }

  // Apply limit
  const toSync = args.limit
    ? productsWithAliexpress.slice(0, args.limit)
    : productsWithAliexpress;

  console.log(`🔄 Syncing ${toSync.length} products...\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let nowInStock = 0;
  let nowOutOfStock = 0;

  for (let i = 0; i < toSync.length; i++) {
    const { shopifyProduct, aliexpressId, aliexpressUrl } = toSync[i];
    const variant = shopifyProduct.variants[0];
    const currentQty = variant?.inventory_quantity || 0;

    console.log(`${i + 1}/${toSync.length}. ${shopifyProduct.title.substring(0, 45)}...`);
    console.log(`   Current inventory: ${currentQty}`);

    let available: boolean;
    let reason: string;
    let newQty: number;

    // Check AliExpress availability using selected method
    if (args.useApi) {
      // Use official API (recommended)
      const apiResult = await checkAliexpressAvailabilityViaApi(aliexpressId);
      available = apiResult.available;
      reason = apiResult.reason;

      // Skip update if API error (stockQuantity = -1)
      if (apiResult.stockQuantity === -1) {
        console.log(`   AliExpress API: ⚠️ Error (${reason}) - skipping`);
        skipped++;
        continue;
      }

      // Use REAL stock quantity from AliExpress API, capped at reasonable max for display
      newQty = available ? Math.min(apiResult.stockQuantity, MAX_STOCK_DISPLAY) : OUT_OF_STOCK_QUANTITY;
      console.log(`   AliExpress API: ${available ? '✅ Available' : '❌ Out of stock'} (${reason})`);
      console.log(`   Real stock: ${apiResult.stockQuantity} units → Shopify: ${newQty}`);
      if (apiResult.price > 0) {
        console.log(`   Current price: €${apiResult.price.toFixed(2)}`);
      }
    } else {
      // Legacy: ScraperAPI page scraping (doesn't know real stock)
      const scraperResult = await checkAliexpressAvailability(aliexpressUrl, args.useScraperApi);
      available = scraperResult.available;
      reason = scraperResult.reason;
      newQty = available ? 999 : OUT_OF_STOCK_QUANTITY; // Can only do 999 or 0 with scraping
      console.log(`   AliExpress Scrape: ${available ? '✅ Available' : '❌ Out of stock'} (${reason})`);
    }

    // Determine if update is needed - update if quantity differs
    const needsUpdate = currentQty !== newQty;

    if (!needsUpdate) {
      console.log(`   → No change needed\n`);
      skipped++;
      await updateLastSyncTime(aliexpressId);
      continue;
    }

    if (args.dryRun) {
      console.log(`   → [DRY RUN] Would update: ${currentQty} → ${newQty}\n`);
      if (available) nowInStock++;
      else nowOutOfStock++;
      continue;
    }

    // Update inventory
    if (variant?.inventory_item_id) {
      const success = await updateInventoryLevel(
        variant.inventory_item_id,
        locationId,
        newQty
      );

      if (success) {
        console.log(`   → Updated: ${currentQty} → ${newQty}\n`);
        updated++;
        if (available) nowInStock++;
        else nowOutOfStock++;
      } else {
        console.log(`   → ❌ Failed to update inventory\n`);
        errors++;
      }
    } else {
      console.log(`   → ⚠️ No inventory_item_id found\n`);
      errors++;
    }

    await updateLastSyncTime(aliexpressId);

    // Rate limiting between checks (AliExpress API: 1 req/sec strict limit - use 2s to be safe)
    await new Promise(r => setTimeout(r, args.useApi ? 2000 : (args.useScraperApi ? 1000 : 500)));
  }

  // Summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n📊 Sync Summary:');
  console.log(`├─ Products checked: ${toSync.length}`);
  console.log(`├─ Updated: ${updated}`);
  console.log(`├─ Skipped (no change): ${skipped}`);
  console.log(`├─ Errors: ${errors}`);
  console.log(`├─ Now in stock: ${nowInStock}`);
  console.log(`├─ Now out of stock: ${nowOutOfStock}`);
  console.log(`└─ Duration: ${duration}s`);

  if (args.dryRun) {
    console.log('\n🏃 Dry run mode - no changes were made');
  }

  console.log('');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
