#!/usr/bin/env npx tsx
/**
 * Sync All Products from AliExpress to Shopify
 *
 * This script:
 * 1. Gets all products from Supabase aliexpress_products table
 * 2. Fetches full details from AliExpress API (images, variants, description)
 * 3. Updates Shopify with:
 *    - Product images
 *    - Variants (EU warehouse only)
 *    - AliExpress metafields (url, product_id, ships_from)
 * 4. Updates Supabase with fetched API data
 *
 * Usage:
 *   npx tsx scripts/sync-all-products.ts --dry-run
 *   npx tsx scripts/sync-all-products.ts --limit 10
 *   npx tsx scripts/sync-all-products.ts --product-id 1005008281471292
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { AliExpressClient } from "../src/lib/aliexpress/client";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SHOPIFY_DOMAIN = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN!;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN!;
const SHOPIFY_API_VERSION = "2024-10";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface ProductToSync {
  aliexpress_product_id: string;
  shopify_product_id: string;
  title: string;
  ships_from: string;
  aliexpress_url: string;
}

// Normalize image URL
function normalizeImageUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("//")) return "https:" + url;
  return url;
}

// Fetch product from AliExpress API
async function fetchFromAliExpress(client: AliExpressClient, productId: string) {
  const countries = ["ES", "FR", "IT", "NL", "PL", "DE", "CZ", "BE"];

  for (const country of countries) {
    try {
      const result = await client.getProduct(productId, country, "EUR", "EN");

      if (result.success && result.data?.aliexpress_ds_product_get_response?.result?.ae_item_base_info_dto) {
        return {
          success: true,
          data: result.data.aliexpress_ds_product_get_response.result,
          country,
        };
      }
    } catch (e) {
      // Continue to next country
    }
  }

  return { success: false, data: null, country: null };
}

// Update Shopify product with images and metafields
async function updateShopifyProduct(
  shopifyProductId: string,
  aliexpressProductId: string,
  images: string[],
  aliexpressUrl: string,
  shipsFrom: string
): Promise<boolean> {
  try {
    // First, check current product state
    const getResponse = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/products/${shopifyProductId}.json`,
      {
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
        },
      }
    );

    if (!getResponse.ok) {
      console.log(`   ⚠️ Could not fetch Shopify product ${shopifyProductId}`);
      return false;
    }

    const currentProduct = await getResponse.json();
    const currentImageCount = currentProduct.product?.images?.length || 0;

    // Prepare update payload
    const updatePayload: any = {
      product: {
        id: shopifyProductId,
        metafields: [
          {
            namespace: "aliexpress",
            key: "product_id",
            value: aliexpressProductId,
            type: "single_line_text_field",
          },
          {
            namespace: "aliexpress",
            key: "url",
            value: aliexpressUrl || `https://www.aliexpress.com/item/${aliexpressProductId}.html`,
            type: "url",
          },
          {
            namespace: "aliexpress",
            key: "ships_from",
            value: shipsFrom || "EU",
            type: "single_line_text_field",
          },
        ],
      },
    };

    // Only add images if current product has none or fewer
    if (images.length > 0 && currentImageCount < images.length) {
      updatePayload.product.images = images.slice(0, 10).map((url) => ({
        src: normalizeImageUrl(url),
      }));
    }

    const updateResponse = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/products/${shopifyProductId}.json`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
        },
        body: JSON.stringify(updatePayload),
      }
    );

    if (!updateResponse.ok) {
      const error = await updateResponse.text();
      console.log(`   ⚠️ Shopify update failed: ${error.substring(0, 200)}`);
      return false;
    }

    return true;
  } catch (error) {
    console.log(`   ⚠️ Error updating Shopify: ${error}`);
    return false;
  }
}

// Update Supabase with fetched data
async function updateSupabase(
  aliexpressProductId: string,
  images: string[],
  apiData: any
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("aliexpress_products")
      .update({
        api_images: images,
        api_fetched_at: new Date().toISOString(),
        image_urls: images,
      })
      .eq("aliexpress_product_id", aliexpressProductId);

    if (error) {
      console.log(`   ⚠️ Supabase update failed: ${error.message}`);
      return false;
    }

    return true;
  } catch (error) {
    console.log(`   ⚠️ Error updating Supabase: ${error}`);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1]) : undefined;
  const productIdArg = args.find((a) => a.startsWith("--product-id="));
  const specificProductId = productIdArg?.split("=")[1];

  console.log("=".repeat(60));
  console.log("Sync All Products from AliExpress");
  console.log("=".repeat(60));
  console.log(`Dry Run: ${dryRun}`);
  if (limit) console.log(`Limit: ${limit}`);
  if (specificProductId) console.log(`Product ID: ${specificProductId}`);
  console.log("");

  // Initialize AliExpress client
  let client: AliExpressClient;
  try {
    client = new AliExpressClient();
    const oauth = client.getOAuth();
    if (!oauth.isAuthorized()) {
      console.error("❌ AliExpress not authorized");
      return;
    }
    console.log("✅ AliExpress API authorized\n");
  } catch (error) {
    console.error("❌ Failed to initialize AliExpress client:", error);
    return;
  }

  // Fetch products from Supabase
  console.log("📦 Fetching products from Supabase...");

  let query = supabase
    .from("aliexpress_products")
    .select("aliexpress_product_id, shopify_product_id, title, ships_from, aliexpress_url")
    .not("shopify_product_id", "is", null);

  if (specificProductId) {
    query = query.eq("aliexpress_product_id", specificProductId);
  }

  if (limit) {
    query = query.limit(limit);
  }

  const { data: products, error } = await query;

  if (error) {
    console.error("❌ Failed to fetch products:", error);
    return;
  }

  console.log(`   Found ${products?.length || 0} products to sync\n`);

  if (!products || products.length === 0) {
    console.log("No products to sync");
    return;
  }

  // Process each product
  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < products.length; i++) {
    const product = products[i] as ProductToSync;
    console.log(`\n[${i + 1}/${products.length}] ${product.title?.substring(0, 50)}...`);
    console.log(`   AliExpress ID: ${product.aliexpress_product_id}`);
    console.log(`   Shopify ID: ${product.shopify_product_id}`);

    // Fetch from AliExpress API
    console.log("   Fetching from AliExpress API...");
    const apiResult = await fetchFromAliExpress(client, product.aliexpress_product_id);

    if (!apiResult.success || !apiResult.data) {
      console.log("   ⚠️ Could not fetch from AliExpress API");
      failed++;
      continue;
    }

    console.log(`   ✅ Got data (country: ${apiResult.country})`);

    // Extract images
    const mediaInfo = apiResult.data.ae_multimedia_info_dto;
    const images = mediaInfo?.image_urls?.split(";").filter((url: string) => url.length > 0) || [];
    console.log(`   📷 Images: ${images.length}`);

    // Construct AliExpress URL
    const aliexpressUrl = product.aliexpress_url || `https://www.aliexpress.com/item/${product.aliexpress_product_id}.html`;

    if (dryRun) {
      console.log("   [DRY RUN] Would update Shopify and Supabase");
      skipped++;
      continue;
    }

    // Update Shopify
    console.log("   Updating Shopify...");
    const shopifySuccess = await updateShopifyProduct(
      product.shopify_product_id,
      product.aliexpress_product_id,
      images,
      aliexpressUrl,
      product.ships_from
    );

    if (shopifySuccess) {
      console.log("   ✅ Shopify updated");
    }

    // Update Supabase
    console.log("   Updating Supabase...");
    const supabaseSuccess = await updateSupabase(product.aliexpress_product_id, images, apiResult.data);

    if (supabaseSuccess) {
      console.log("   ✅ Supabase updated");
    }

    if (shopifySuccess && supabaseSuccess) {
      success++;
    } else {
      failed++;
    }

    // Rate limiting - wait between products
    await new Promise((r) => setTimeout(r, 500));
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total products: ${products.length}`);
  console.log(`Success: ${success}`);
  console.log(`Failed: ${failed}`);
  console.log(`Skipped: ${skipped}`);

  if (dryRun) {
    console.log("\n🏃 Dry run mode - no changes were made");
    console.log("   Remove --dry-run to sync products");
  }
}

main().catch(console.error);
