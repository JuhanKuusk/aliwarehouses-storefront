#!/usr/bin/env npx tsx
/**
 * Sync AliExpress URLs to Shopify Metafields
 *
 * This script ensures all Shopify products have the correct AliExpress
 * metafields for dropshipping fulfillment automation.
 *
 * Usage:
 *   npx tsx scripts/sync-aliexpress-metafields.ts
 *   npx tsx scripts/sync-aliexpress-metafields.ts --dry-run
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Shopify Admin API
const SHOPIFY_DOMAIN = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN!;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN!;
const SHOPIFY_API_VERSION = "2024-10";

interface AliExpressProduct {
  aliexpress_product_id: string;
  aliexpress_url: string;
  ships_from: string;
  shopify_product_id: string | null;
  title: string;
}

// Get all AliExpress products with Shopify IDs
async function getAliExpressProducts(): Promise<AliExpressProduct[]> {
  const { data, error } = await supabase
    .from("aliexpress_products")
    .select("aliexpress_product_id, aliexpress_url, ships_from, shopify_product_id, title")
    .not("shopify_product_id", "is", null);

  if (error) {
    console.error("Error fetching AliExpress products:", error);
    return [];
  }

  return data || [];
}

// Get current metafields for a Shopify product
async function getProductMetafields(productId: string): Promise<any[]> {
  // Extract numeric ID from gid://shopify/Product/123456
  const numericId = productId.replace("gid://shopify/Product/", "");

  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/products/${numericId}/metafields.json`,
    {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    console.error(`Failed to get metafields for product ${numericId}`);
    return [];
  }

  const data = await response.json();
  return data.metafields || [];
}

// Set metafield for a Shopify product
async function setProductMetafield(
  productId: string,
  namespace: string,
  key: string,
  value: string,
  type: string
): Promise<boolean> {
  const numericId = productId.replace("gid://shopify/Product/", "");

  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/products/${numericId}/metafields.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        metafield: {
          namespace,
          key,
          value,
          type,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Failed to set metafield: ${errorText}`);
    return false;
  }

  return true;
}

// Clean AliExpress URL (remove tracking params)
function cleanAliExpressUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Keep only the base URL with item ID
    return `https://www.aliexpress.com/item/${parsed.pathname.split("/item/")[1]?.split(".html")[0] || ""}.html`;
  } catch {
    return url;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  console.log("=".repeat(60));
  console.log("Sync AliExpress URLs to Shopify Metafields");
  console.log("=".repeat(60));
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log("");

  // Get all AliExpress products with Shopify IDs
  console.log("Fetching AliExpress products from Supabase...");
  const products = await getAliExpressProducts();
  console.log(`Found ${products.length} products with Shopify IDs`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const product of products) {
    if (!product.shopify_product_id) continue;

    console.log(`\nProcessing: ${product.title.slice(0, 50)}...`);

    // Get current metafields
    const metafields = await getProductMetafields(product.shopify_product_id);

    // Check if aliexpress.url metafield exists
    const hasUrl = metafields.some(
      (m) => m.namespace === "aliexpress" && m.key === "url"
    );
    const hasProductId = metafields.some(
      (m) => m.namespace === "aliexpress" && m.key === "product_id"
    );
    const hasShipsFrom = metafields.some(
      (m) => m.namespace === "aliexpress" && m.key === "ships_from"
    );

    if (hasUrl && hasProductId && hasShipsFrom) {
      console.log("  Already has all metafields - skipping");
      skipped++;
      continue;
    }

    const cleanUrl = cleanAliExpressUrl(product.aliexpress_url);

    if (dryRun) {
      console.log(`  [DRY RUN] Would set metafields:`);
      if (!hasUrl) console.log(`    - aliexpress.url = ${cleanUrl}`);
      if (!hasProductId) console.log(`    - aliexpress.product_id = ${product.aliexpress_product_id}`);
      if (!hasShipsFrom) console.log(`    - aliexpress.ships_from = ${product.ships_from}`);
      updated++;
    } else {
      let success = true;

      if (!hasUrl) {
        success = success && await setProductMetafield(
          product.shopify_product_id,
          "aliexpress",
          "url",
          cleanUrl,
          "url"
        );
      }

      if (!hasProductId) {
        success = success && await setProductMetafield(
          product.shopify_product_id,
          "aliexpress",
          "product_id",
          product.aliexpress_product_id,
          "single_line_text_field"
        );
      }

      if (!hasShipsFrom && product.ships_from) {
        success = success && await setProductMetafield(
          product.shopify_product_id,
          "aliexpress",
          "ships_from",
          product.ships_from,
          "single_line_text_field"
        );
      }

      if (success) {
        console.log("  Metafields updated");
        updated++;
      } else {
        console.log("  Error updating metafields");
        errors++;
      }
    }

    // Rate limit
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  console.log("\n" + "=".repeat(60));
  console.log("COMPLETE");
  console.log("=".repeat(60));
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);
}

main().catch(console.error);
