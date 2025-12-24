#!/usr/bin/env npx tsx
/**
 * Test AliExpress Dropshipping API Connection
 *
 * Usage:
 *   npx tsx scripts/test-aliexpress-api.ts
 *   npx tsx scripts/test-aliexpress-api.ts --product-id 1005001234567890
 *
 * This script tests the AliExpress Open Platform API connection
 * and optionally fetches product data to verify everything works.
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });

import { AliExpressClient } from '../src/lib/aliexpress/client';

async function main(): Promise<void> {
  console.log('\n🔌 Testing AliExpress Dropshipping API Connection\n');

  // Parse command line arguments
  const args = process.argv.slice(2);
  let productId: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--product-id' && args[i + 1]) {
      productId = args[i + 1];
      i++;
    }
  }

  // Check environment variables
  console.log('📋 Environment Check:');
  console.log(`   APP_KEY: ${process.env.ALIEXPRESS_APP_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`   APP_SECRET: ${process.env.ALIEXPRESS_APP_SECRET ? '✅ Set' : '❌ Missing'}`);
  console.log(`   API_URL: ${process.env.ALIEXPRESS_API_URL || 'Using default'}`);
  console.log('');

  try {
    const client = new AliExpressClient();

    // Check OAuth status
    const oauth = client.getOAuth();
    const status = oauth.getStatus();

    console.log('🔐 OAuth Status:');
    console.log(`   Authorized: ${status.authorized ? '✅ Yes' : '❌ No'}`);
    console.log(`   Access Token Valid: ${status.accessTokenValid ? '✅ Yes' : '❌ No'}`);
    console.log(`   Refresh Token Valid: ${status.refreshTokenValid ? '✅ Yes' : '❌ No'}`);
    if (status.expiresIn) {
      console.log(`   Token Expires In: ${status.expiresIn}`);
    }
    console.log('');

    if (!status.authorized) {
      console.log('❌ Not authorized. You need to complete OAuth flow first.');
      console.log('   Authorization URL:', oauth.getAuthorizationUrl());
      return;
    }

    // Test basic API connection
    console.log('🧪 Testing API Connection...');
    const connectionTest = await client.testConnection();
    console.log(`   Result: ${connectionTest.success ? '✅' : '❌'} ${connectionTest.message}`);
    console.log('');

    // If product ID provided, fetch product data
    if (productId) {
      console.log(`📦 Fetching Product Data for: ${productId}`);
      console.log('');

      const result = await client.getProduct(productId, 'EE', 'EUR', 'EN');

      if (result.success && result.data) {
        const productData = result.data;
        const baseInfo = productData.aliexpress_ds_product_get_response?.result?.ae_item_base_info_dto;
        const stock = client.getStockFromProductData(productData);
        const { price, salePrice } = client.getPriceFromProductData(productData);
        const images = client.getImagesFromProductData(productData);

        console.log('📋 Product Information:');
        console.log(`   Title: ${baseInfo?.subject || 'N/A'}`);
        console.log(`   Status: ${baseInfo?.product_status_type || 'N/A'}`);
        console.log(`   Price: €${price.toFixed(2)}`);
        if (salePrice) {
          console.log(`   Sale Price: €${salePrice.toFixed(2)}`);
        }
        console.log(`   Stock: ${stock} units`);
        console.log(`   Images: ${images.length} images`);
        if (images.length > 0) {
          console.log(`   First Image: ${images[0].substring(0, 60)}...`);
        }
        console.log('');
        console.log('✅ Product data fetched successfully!');
      } else {
        console.log(`❌ Failed to fetch product: ${result.error}`);
        console.log(`   Error code: ${result.code}`);
      }
    } else {
      console.log('💡 Tip: Run with --product-id to test fetching a specific product:');
      console.log('   npx tsx scripts/test-aliexpress-api.ts --product-id 1005001234567890');
    }

    console.log('');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
