#!/usr/bin/env npx tsx
/**
 * Test AliExpress API raw response
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import crypto from 'crypto';

config({ path: resolve(process.cwd(), '.env.local') });

const APP_KEY = process.env.ALIEXPRESS_APP_KEY!;
const APP_SECRET = process.env.ALIEXPRESS_APP_SECRET!;
const API_URL = 'https://api-sg.aliexpress.com/sync';

interface TokenData {
  access_token: string;
  refresh_token: string;
}

// Load tokens
let tokens: TokenData;
try {
  tokens = JSON.parse(readFileSync('.tokens.json', 'utf-8'));
} catch (e) {
  console.error('No tokens file');
  process.exit(1);
}

function generateSignature(params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort();
  let signString = APP_SECRET;
  for (const key of sortedKeys) {
    signString += key + String(params[key]);
  }
  signString += APP_SECRET;
  return crypto.createHash('md5').update(signString).digest('hex').toUpperCase();
}

async function testProduct(productId: string): Promise<void> {
  console.log(`\nTesting product: ${productId}\n`);

  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

  const params: Record<string, string> = {
    app_key: APP_KEY,
    method: 'aliexpress.ds.product.get',
    timestamp: timestamp,
    sign_method: 'md5',
    v: '2.0',
    format: 'json',
    access_token: tokens.access_token,
    product_id: productId,
    ship_to_country: 'DE',
    target_currency: 'EUR',
    target_language: 'EN',
  };

  params.sign = generateSignature(params);

  const queryString = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');

  const url = `${API_URL}?${queryString}`;

  const response = await fetch(url, { method: 'POST' });
  const data = await response.json();

  console.log('Raw API Response:');
  console.log(JSON.stringify(data, null, 2));

  // Check for product info
  const result = data.aliexpress_ds_product_get_response?.result;
  if (result) {
    console.log('\n--- Parsed Info ---');
    console.log('Title:', result.ae_item_base_info_dto?.subject);
    console.log('Status:', result.ae_item_base_info_dto?.product_status_type);
    const images = result.ae_multimedia_info_dto?.image_urls;
    if (images) {
      console.log('Images:', images.split(';').length);
      console.log('First image:', images.split(';')[0]?.substring(0, 80));
    }
  }
}

async function main() {
  // Test with product IDs from command line
  const productIds = process.argv.slice(2);
  if (productIds.length === 0) {
    console.log('Usage: npx tsx scripts/test-raw-api.ts <product_id>');
    process.exit(1);
  }

  for (const id of productIds) {
    await testProduct(id);
  }
}

main().catch(console.error);
