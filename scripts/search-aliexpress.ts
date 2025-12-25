#!/usr/bin/env npx tsx
/**
 * Search AliExpress for products and import to Shopify
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { AliExpressClient } from '../src/lib/aliexpress/client';

async function main(): Promise<void> {
  const searchQuery = process.argv[2] || 'solar panel EU warehouse';
  const limit = parseInt(process.argv[3]) || 10;

  console.log(`\n🔍 Searching AliExpress for: "${searchQuery}"\n`);

  const client = new AliExpressClient();

  // Check OAuth
  const status = client.getOAuth().getStatus();
  if (!status.authorized) {
    console.error('❌ Not authorized');
    process.exit(1);
  }

  // Search for products
  const result = await client.searchProducts(searchQuery, 1, limit);

  if (!result.success) {
    console.log('❌ Search failed:', result.error);
    console.log('   Code:', result.code);
    return;
  }

  console.log('Raw response:');
  console.log(JSON.stringify(result.data, null, 2));
}

main().catch(console.error);
