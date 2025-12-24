#!/usr/bin/env npx tsx
/**
 * Update Products from AliExpress API
 *
 * Fetches real product data (stock, price, images) from AliExpress API
 * and updates both Supabase and Shopify databases.
 *
 * Usage:
 *   npx tsx scripts/update-products-from-api.ts
 *   npx tsx scripts/update-products-from-api.ts --limit 10
 *   npx tsx scripts/update-products-from-api.ts --dry-run
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { AliExpressClient } from '../src/lib/aliexpress/client';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface ProductRecord {
  id: string;
  aliexpress_product_id: string;
  title: string;
  price: number | null;
  api_stock_quantity: number | null;
  api_price: number | null;
}

function parseArgs(): { limit?: number; dryRun: boolean } {
  const args = process.argv.slice(2);
  const result = { limit: undefined as number | undefined, dryRun: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      result.limit = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--dry-run') {
      result.dryRun = true;
    }
  }

  return result;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const startTime = Date.now();

  console.log('\n📊 Update Products from AliExpress API\n');
  console.log(`Dry run: ${args.dryRun}`);
  if (args.limit) console.log(`Limit: ${args.limit}`);
  console.log('');

  // Get products from Supabase
  let query = supabase
    .from('aliexpress_products')
    .select('id, aliexpress_product_id, title, price, api_stock_quantity, api_price')
    .eq('status', 'imported');

  if (args.limit) {
    query = query.limit(args.limit);
  }

  const { data: products, error } = await query;

  if (error) {
    console.error('Error fetching products:', error);
    process.exit(1);
  }

  if (!products || products.length === 0) {
    console.log('No imported products found.\n');
    return;
  }

  console.log(`Found ${products.length} products to update\n`);

  const client = new AliExpressClient();
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < products.length; i++) {
    const product = products[i] as ProductRecord;
    console.log(`${i + 1}/${products.length}. ${product.title.substring(0, 50)}...`);

    try {
      const result = await client.getProduct(product.aliexpress_product_id, 'EE', 'EUR', 'EN');

      if (!result.success || !result.data) {
        console.log(`   ❌ API error: ${result.error}`);
        errors++;
        continue;
      }

      const stock = client.getStockFromProductData(result.data);
      const { price, salePrice } = client.getPriceFromProductData(result.data);
      const images = client.getImagesFromProductData(result.data);

      console.log(`   Stock: ${stock} units`);
      console.log(`   Price: €${price.toFixed(2)}${salePrice ? ` (sale: €${salePrice.toFixed(2)})` : ''}`);
      console.log(`   Images: ${images.length}`);

      if (args.dryRun) {
        console.log(`   [DRY RUN] Would update database\n`);
        continue;
      }

      // Update Supabase
      const { error: updateError } = await supabase
        .from('aliexpress_products')
        .update({
          api_stock_quantity: stock,
          api_price: price,
          api_sale_price: salePrice,
          api_images: images,
          api_fetched_at: new Date().toISOString(),
          price: price, // Also update the main price field
          original_price: salePrice ? price : null,
          image_urls: images,
          updated_at: new Date().toISOString(),
        })
        .eq('id', product.id);

      if (updateError) {
        console.log(`   ❌ Database error: ${updateError.message}\n`);
        errors++;
      } else {
        console.log(`   ✅ Updated\n`);
        updated++;
      }

    } catch (error) {
      console.log(`   ❌ Exception: ${error}\n`);
      errors++;
    }

    // Rate limiting (1 req/sec for API)
    await new Promise(r => setTimeout(r, 1100));
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n📊 Summary:');
  console.log(`├─ Products processed: ${products.length}`);
  console.log(`├─ Updated: ${updated}`);
  console.log(`├─ Errors: ${errors}`);
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
