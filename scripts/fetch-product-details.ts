#!/usr/bin/env npx tsx
/**
 * Fetch Full Product Details from AliExpress API
 *
 * This script fetches complete product info including:
 * - Variants (SKUs) with options like quantity, color, warmth
 * - Selling points
 * - Detailed specifications
 * - Full description
 *
 * Usage:
 *   npx tsx scripts/fetch-product-details.ts --product-id 1005008281471292
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import crypto from "crypto";

const ALIEXPRESS_APP_KEY = process.env.ALIEXPRESS_APP_KEY!;
const ALIEXPRESS_APP_SECRET = process.env.ALIEXPRESS_APP_SECRET!;
const ALIEXPRESS_API_URL = process.env.ALIEXPRESS_API_URL || "https://api-sg.aliexpress.com/sync";

function generateSignature(params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort();
  let signString = ALIEXPRESS_APP_SECRET;
  for (const key of sortedKeys) {
    signString += key + params[key];
  }
  signString += ALIEXPRESS_APP_SECRET;
  return crypto.createHash("md5").update(signString).digest("hex").toUpperCase();
}

async function fetchProductDetails(productId: string) {
  const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);

  const params: Record<string, string> = {
    app_key: ALIEXPRESS_APP_KEY,
    method: "aliexpress.ds.product.get",
    timestamp: timestamp,
    sign_method: "md5",
    v: "2.0",
    format: "json",
    product_id: productId,
    target_language: "EN",
    target_currency: "EUR",
    ship_to_country: "DE",
  };

  params.sign = generateSignature(params);

  const queryString = new URLSearchParams(params).toString();
  const response = await fetch(`${ALIEXPRESS_API_URL}?${queryString}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  const data = await response.json();
  return data;
}

async function main() {
  const args = process.argv.slice(2);
  const productIdArg = args.find((a) => a.startsWith("--product-id="));
  const productId = productIdArg?.split("=")[1] || "1005008281471292"; // Default to solar lights

  console.log("=".repeat(60));
  console.log("Fetch AliExpress Product Details");
  console.log("=".repeat(60));
  console.log(`Product ID: ${productId}\n`);

  const data = await fetchProductDetails(productId);

  // Pretty print the full response
  console.log("FULL API RESPONSE:");
  console.log(JSON.stringify(data, null, 2));

  // Extract key info
  const result = data.aliexpress_ds_product_get_response?.result;
  if (!result) {
    console.error("\nError: No result in response");
    console.log("Response code:", data.aliexpress_ds_product_get_response?.rsp_code);
    console.log("Response message:", data.aliexpress_ds_product_get_response?.rsp_msg);
    return;
  }

  console.log("\n" + "=".repeat(60));
  console.log("PARSED PRODUCT INFO");
  console.log("=".repeat(60));

  // Basic info
  const baseInfo = result.ae_item_base_info_dto;
  if (baseInfo) {
    console.log("\n📦 BASIC INFO:");
    console.log(`  Title: ${baseInfo.subject}`);
    console.log(`  Product ID: ${baseInfo.product_id}`);
    console.log(`  Status: ${baseInfo.product_status_type}`);
    console.log(`  Description length: ${baseInfo.detail?.length || 0} chars`);
  }

  // SKUs/Variants
  const skus = result.ae_item_sku_info_dtos?.ae_item_sku_info_d_t_o;
  if (skus && skus.length > 0) {
    console.log("\n🎨 VARIANTS/SKUs:");
    skus.forEach((sku: any, i: number) => {
      console.log(`  ${i + 1}. SKU ID: ${sku.sku_id}`);
      console.log(`     Price: €${sku.offer_sale_price || sku.sku_price}`);
      console.log(`     Stock: ${sku.sku_available_stock}`);
      console.log(`     Attributes: ${sku.sku_attr || sku.id}`);
      console.log("");
    });
  } else {
    console.log("\n⚠️  NO VARIANTS FOUND");
  }

  // Package info
  const packageInfo = result.package_info_dto;
  if (packageInfo) {
    console.log("\n📐 PACKAGE INFO:");
    console.log(`  Dimensions: ${packageInfo.package_length}x${packageInfo.package_width}x${packageInfo.package_height} mm`);
    console.log(`  Weight: ${packageInfo.gross_weight}`);
  }

  // Store info
  const storeInfo = result.ae_store_info;
  if (storeInfo) {
    console.log("\n🏪 STORE INFO:");
    console.log(`  Name: ${storeInfo.store_name}`);
    console.log(`  URL: ${storeInfo.store_url}`);
  }

  // Images
  const mediaInfo = result.ae_multimedia_info_dto;
  if (mediaInfo?.image_urls) {
    const images = mediaInfo.image_urls.split(";");
    console.log(`\n🖼️  IMAGES: ${images.length} images`);
    images.slice(0, 3).forEach((url: string) => console.log(`  - ${url}`));
    if (images.length > 3) console.log(`  ... and ${images.length - 3} more`);
  }

  // Try to extract selling points from description
  if (baseInfo?.detail) {
    console.log("\n📝 DESCRIPTION PREVIEW (first 500 chars):");
    console.log(baseInfo.detail.substring(0, 500));
  }
}

main().catch(console.error);
