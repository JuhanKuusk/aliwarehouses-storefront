/**
 * Fix Product Descriptions Script
 *
 * Fixes the "Ships from Ships from {country}" duplicate bug in Shopify product descriptions.
 *
 * Usage: npx tsx scripts/fix-descriptions.ts [--dry-run]
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const SHOPIFY_DOMAIN = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN!;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN!;
const SHOPIFY_API_VERSION = "2024-01";

interface ShopifyProduct {
  id: number;
  handle: string;
  title: string;
  body_html: string;
}

// Fetch all products from Shopify Admin API
async function fetchAllProducts(): Promise<ShopifyProduct[]> {
  const allProducts: ShopifyProduct[] = [];
  let pageInfo: string | null = null;

  while (true) {
    const url = pageInfo
      ? `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=250&page_info=${pageInfo}`
      : `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=250`;

    const response = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch products: ${response.status}`);
    }

    const data = await response.json();
    allProducts.push(...data.products);

    // Check for pagination
    const linkHeader = response.headers.get("Link");
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const match = linkHeader.match(/page_info=([^>]+)>; rel="next"/);
      pageInfo = match ? match[1] : null;
    } else {
      break;
    }

    console.log(`Fetched ${allProducts.length} products...`);
  }

  return allProducts;
}

// Fix the duplicate "Ships from Ships from" text
function fixDescription(bodyHtml: string): string {
  if (!bodyHtml) return bodyHtml;

  // Pattern: "Ships from Ships from {country}" -> "Ships from {country}"
  return bodyHtml.replace(/Ships from Ships from/gi, "Ships from");
}

// Update product description in Shopify
async function updateProduct(productId: number, newBodyHtml: string): Promise<boolean> {
  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/products/${productId}.json`,
    {
      method: "PUT",
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        product: {
          id: productId,
          body_html: newBodyHtml,
        },
      }),
    }
  );

  return response.ok;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  console.log("=".repeat(60));
  console.log("Fix Product Descriptions Script");
  console.log("=".repeat(60));
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log("");

  // Validate environment
  if (!SHOPIFY_ADMIN_TOKEN) {
    console.error("ERROR: SHOPIFY_ADMIN_API_TOKEN is required");
    process.exit(1);
  }

  // Fetch all products
  console.log("Fetching products from Shopify...");
  const products = await fetchAllProducts();
  console.log(`Total products: ${products.length}`);

  // Find products with the bug
  const productsToFix = products.filter(
    (p) => p.body_html && p.body_html.includes("Ships from Ships from")
  );

  console.log(`\nProducts with "Ships from Ships from" bug: ${productsToFix.length}`);

  if (productsToFix.length === 0) {
    console.log("No products need fixing!");
    return;
  }

  // Fix each product
  let fixed = 0;
  let failed = 0;

  for (const product of productsToFix) {
    console.log(`\nFixing: ${product.handle}`);
    console.log(`  Before: ${product.body_html?.slice(0, 100)}...`);

    const newBodyHtml = fixDescription(product.body_html);
    console.log(`  After:  ${newBodyHtml?.slice(0, 100)}...`);

    if (dryRun) {
      console.log("  [DRY RUN] Would update");
      fixed++;
    } else {
      const success = await updateProduct(product.id, newBodyHtml);
      if (success) {
        console.log("  ✅ Fixed");
        fixed++;
      } else {
        console.log("  ❌ Failed");
        failed++;
      }

      // Rate limiting
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Products to fix: ${productsToFix.length}`);
  console.log(`Fixed: ${fixed}`);
  console.log(`Failed: ${failed}`);

  if (dryRun) {
    console.log("\n🏃 Dry run mode - no changes were made");
    console.log("   Remove --dry-run to fix products");
  }
}

main().catch(console.error);
