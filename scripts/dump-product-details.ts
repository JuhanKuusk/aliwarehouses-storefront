#!/usr/bin/env npx tsx
/**
 * Dump Full Product Details from AliExpress API
 *
 * Uses the OAuth-authenticated client to fetch complete product data including:
 * - SKUs/Variants with attributes
 * - Full description HTML
 * - Package info
 * - Store info
 *
 * Usage:
 *   npx tsx scripts/dump-product-details.ts --product-id 1005008281471292
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

import { AliExpressClient } from "../src/lib/aliexpress/client";

async function main() {
  const args = process.argv.slice(2);
  const productIdArg = args.find((a) => a.startsWith("--product-id="));
  const productId = productIdArg?.split("=")[1] || "1005008281471292";

  console.log("=".repeat(60));
  console.log("Dump AliExpress Product Details");
  console.log("=".repeat(60));
  console.log(`Product ID: ${productId}\n`);

  try {
    const client = new AliExpressClient();
    const oauth = client.getOAuth();
    const status = oauth.getStatus();

    if (!status.authorized) {
      console.error("❌ Not authorized. Authorization URL:", oauth.getAuthorizationUrl());
      return;
    }

    console.log("✅ OAuth authorized, fetching product...\n");

    // Try multiple countries in case one is prohibited
    const countries = ["ES", "FR", "IT", "NL", "PL", "EE"];
    let result: any = null;
    let successCountry = "";

    for (const country of countries) {
      console.log(`Trying country: ${country}...`);
      result = await client.getProduct(productId, country, "EUR", "EN");

      if (result.success && result.data?.aliexpress_ds_product_get_response?.result?.ae_item_base_info_dto) {
        successCountry = country;
        console.log(`✅ Success with country: ${country}\n`);
        break;
      }

      const rspMsg = result.data?.aliexpress_ds_product_get_response?.rsp_msg;
      console.log(`  Response: ${rspMsg || result.error || "No data"}`);
    }

    if (!successCountry) {
      console.log("\n❌ Could not fetch product for any country");
    }

    if (!result.success || !result.data) {
      console.error("❌ Failed to fetch product:", result.error);
      return;
    }

    const fullResponse = result.data;
    const productResult = fullResponse.aliexpress_ds_product_get_response?.result;

    // Output full raw response
    console.log("📦 FULL RAW RESPONSE:");
    console.log(JSON.stringify(fullResponse, null, 2));

    if (!productResult) {
      console.log("\n⚠️ No product result found");
      return;
    }

    // Parse key sections
    console.log("\n" + "=".repeat(60));
    console.log("PARSED SECTIONS");
    console.log("=".repeat(60));

    // Basic info
    const baseInfo = productResult.ae_item_base_info_dto;
    if (baseInfo) {
      console.log("\n📦 BASIC INFO:");
      console.log(`  Title: ${baseInfo.subject}`);
      console.log(`  Product ID: ${baseInfo.product_id}`);
      console.log(`  Status: ${baseInfo.product_status_type}`);
      console.log(`  Description length: ${baseInfo.detail?.length || 0} chars`);

      if (baseInfo.detail) {
        console.log("\n📝 DESCRIPTION (first 1000 chars):");
        console.log(baseInfo.detail.substring(0, 1000));
      }
    }

    // SKUs/Variants - THIS IS WHAT WE NEED
    const skuInfo = productResult.ae_item_sku_info_dtos?.ae_item_sku_info_d_t_o;
    if (skuInfo && skuInfo.length > 0) {
      console.log("\n🎨 VARIANTS/SKUs (" + skuInfo.length + " total):");
      skuInfo.forEach((sku: any, i: number) => {
        console.log(`\n  ${i + 1}. SKU ID: ${sku.sku_id}`);
        console.log(`     Price: €${sku.sku_price}`);
        console.log(`     Sale Price: €${sku.offer_sale_price || "N/A"}`);
        console.log(`     Stock: ${sku.sku_available_stock}`);
        console.log(`     Attributes: ${sku.sku_attr || sku.id || "N/A"}`);
        console.log(`     Full SKU data:`, JSON.stringify(sku, null, 2));
      });
    } else {
      console.log("\n⚠️ NO VARIANTS FOUND");
    }

    // Package info
    const packageInfo = productResult.package_info_dto;
    if (packageInfo) {
      console.log("\n📐 PACKAGE INFO:");
      console.log(JSON.stringify(packageInfo, null, 2));
    }

    // Store info
    const storeInfo = productResult.ae_store_info;
    if (storeInfo) {
      console.log("\n🏪 STORE INFO:");
      console.log(JSON.stringify(storeInfo, null, 2));
    }

    // Images
    const mediaInfo = productResult.ae_multimedia_info_dto;
    if (mediaInfo) {
      console.log("\n🖼️ MEDIA INFO:");
      const images = mediaInfo.image_urls?.split(";") || [];
      console.log(`  Images: ${images.length}`);
      images.forEach((url: string, i: number) => console.log(`  ${i + 1}. ${url}`));
    }

    // Check for any other fields
    console.log("\n📋 ALL AVAILABLE FIELDS IN RESULT:");
    console.log(Object.keys(productResult));

  } catch (error) {
    console.error("Error:", error);
  }
}

main().catch(console.error);
