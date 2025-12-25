#!/usr/bin/env npx tsx
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import crypto from 'crypto';
import { readFileSync } from 'fs';

const APP_KEY = process.env.ALIEXPRESS_APP_KEY!;
const APP_SECRET = process.env.ALIEXPRESS_APP_SECRET!;
const API_URL = 'https://api-sg.aliexpress.com/sync';

interface TokenData {
  access_token: string;
}

const tokens: TokenData = JSON.parse(readFileSync('.tokens.json', 'utf-8'));

function generateSignature(params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort();
  let signString = APP_SECRET;
  for (const key of sortedKeys) {
    signString += key + String(params[key]);
  }
  signString += APP_SECRET;
  return crypto.createHash('md5').update(signString).digest('hex').toUpperCase();
}

async function testProduct(productId: string, country: string) {
  console.log(`\nTesting product ${productId} with country: ${country}`);

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
    ship_to_country: country,
    target_currency: 'EUR',
    target_language: 'EN',
  };

  params.sign = generateSignature(params);

  const queryString = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');

  const response = await fetch(`${API_URL}?${queryString}`, { method: 'POST' });
  const data = await response.json();

  const result = data.aliexpress_ds_product_get_response;
  console.log('Response code:', result?.rsp_code);
  console.log('Response msg:', result?.rsp_msg);

  if (result?.result?.ae_item_base_info_dto) {
    console.log('Title:', result.result.ae_item_base_info_dto.subject);
    const images = result.result.ae_multimedia_info_dto?.image_urls;
    if (images) {
      console.log('Images:', images.split(';').length);
    }
    return data;
  }
  return null;
}

async function main() {
  const productId = process.argv[2] || '1005008281471292';
  const countries = ['ES', 'FR', 'PL', 'NL', 'IT', 'BE', 'PT', 'DE', 'CZ', 'AT'];

  console.log(`Testing product ${productId} with various EU countries...\n`);

  for (const country of countries) {
    const result = await testProduct(productId, country);
    if (result) {
      console.log('\n✅ Found working country:', country);
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    }
  }

  console.log('\n❌ Product not available for any tested EU country');
}

main().catch(console.error);
