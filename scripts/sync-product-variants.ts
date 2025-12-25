#!/usr/bin/env npx tsx
/**
 * Sync Product Variants and Full Details from AliExpress to Shopify
 *
 * Fetches complete product data from AliExpress API and updates/creates
 * Shopify product with:
 * - Multiple variants (quantity, color options)
 * - Selling points and detailed description
 * - Full specifications
 *
 * Only syncs EU warehouse variants (ships from Spain, Poland, etc.)
 *
 * Usage:
 *   npx tsx scripts/sync-product-variants.ts --product-id 1005008281471292 --dry-run
 *   npx tsx scripts/sync-product-variants.ts --product-id 1005008281471292
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

import { AliExpressClient } from "../src/lib/aliexpress/client";

const SHOPIFY_DOMAIN = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN!;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN!;
const SHOPIFY_API_VERSION = "2024-10";

// EU warehouse country codes that we want to include
const EU_SHIP_FROM = ["spain", "es", "poland", "pl", "germany", "de", "france", "fr", "italy", "it", "netherlands", "nl", "belgium", "be", "czech", "cz"];

interface ParsedVariant {
  skuId: string;
  emittingColor: string;
  quantity: string;
  shipsFrom: string;
  isEU: boolean;
  price: number;
  salePrice: number;
  stock: number;
  image?: string;
}

interface ParsedProduct {
  title: string;
  sellingPoints: string[];
  specifications: Record<string, string>;
  descriptionHtml: string;
  variants: ParsedVariant[];
  images: string[];
  properties: Record<string, string>;
}

function parseProductData(apiResponse: any): ParsedProduct {
  const result = apiResponse.aliexpress_ds_product_get_response?.result;
  if (!result) throw new Error("No product result in API response");

  const baseInfo = result.ae_item_base_info_dto;
  const skuInfo = result.ae_item_sku_info_dtos?.ae_item_sku_info_d_t_o || [];
  const mediaInfo = result.ae_multimedia_info_dto;
  const properties = result.ae_item_properties?.ae_item_property || [];

  // Parse selling points and specs from mobile_detail JSON
  let sellingPoints: string[] = [];
  let specifications: Record<string, string> = {};

  if (baseInfo?.mobile_detail) {
    try {
      const mobileDetail = JSON.parse(baseInfo.mobile_detail);
      const modules = mobileDetail.moduleList || [];

      for (const module of modules) {
        if (module.type === "text" && module.data?.content) {
          const content = module.data.content;

          // Check if it's selling points (starts with ·)
          if (content.includes("·")) {
            const points = content.split("\n").filter((line: string) => line.startsWith("·"));
            sellingPoints = points.map((p: string) => {
              // Extract the key benefit part
              const cleaned = p.replace("·", "").trim();
              const colonIndex = cleaned.indexOf(":");
              return colonIndex > 0 ? cleaned.substring(0, colonIndex).trim() : cleaned;
            });
          }

          // Check if it's specifications (has dimension-like data)
          if (content.includes("Dimensions") || content.includes("Battery") || content.includes("LED")) {
            const lines = content.split("\n");
            for (const line of lines) {
              const colonIndex = line.indexOf(":");
              if (colonIndex > 0) {
                const key = line.substring(0, colonIndex).trim();
                const value = line.substring(colonIndex + 1).trim();
                if (key && value) {
                  specifications[key] = value;
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.log("Could not parse mobile_detail JSON");
    }
  }

  // Parse variants
  const variants: ParsedVariant[] = skuInfo.map((sku: any) => {
    const props = sku.ae_sku_property_dtos?.ae_sku_property_d_t_o || [];

    let emittingColor = "";
    let quantity = "";
    let shipsFrom = "";
    let image = "";

    for (const prop of props) {
      if (prop.sku_property_name === "Emitting Color") {
        emittingColor = prop.property_value_definition_name || prop.sku_property_value;
        if (prop.sku_image) image = prop.sku_image;
      } else if (prop.sku_property_name === "Wattage") {
        quantity = prop.property_value_definition_name || prop.sku_property_value;
      } else if (prop.sku_property_name === "Ships From") {
        shipsFrom = prop.sku_property_value || prop.property_value_definition_name || "";
      }
    }

    // Check if ships from EU - must explicitly be Spain, Poland, etc. NOT China
    const shipsFromLower = shipsFrom.toLowerCase();
    const isEU = shipsFromLower.includes("spain") ||
                 shipsFromLower.includes("poland") ||
                 shipsFromLower.includes("germany") ||
                 shipsFromLower.includes("france") ||
                 shipsFromLower.includes("italy") ||
                 shipsFromLower.includes("netherlands") ||
                 shipsFromLower.includes("belgium") ||
                 shipsFromLower.includes("czech");

    return {
      skuId: sku.sku_id,
      emittingColor,
      quantity,
      shipsFrom,
      isEU,
      price: parseFloat(sku.sku_price || "0"),
      salePrice: parseFloat(sku.offer_sale_price || "0"),
      stock: sku.sku_available_stock || 0,
      image,
    };
  });

  // Parse properties
  const propsMap: Record<string, string> = {};
  for (const prop of properties) {
    if (prop.attr_name && prop.attr_value) {
      propsMap[prop.attr_name] = prop.attr_value;
    }
  }

  // Parse images
  const images = mediaInfo?.image_urls?.split(";") || [];

  return {
    title: baseInfo?.subject || "Unknown Product",
    sellingPoints,
    specifications,
    descriptionHtml: baseInfo?.detail || "",
    variants,
    images: images.filter((url: string) => url.length > 0),
    properties: propsMap,
  };
}

function generateEnhancedDescription(product: ParsedProduct): string {
  let html = "";

  // Selling points
  if (product.sellingPoints.length > 0) {
    html += `<div class="selling-points">\n`;
    html += `<h3>✨ Key Features</h3>\n<ul>\n`;
    for (const point of product.sellingPoints) {
      html += `<li>${point}</li>\n`;
    }
    html += `</ul>\n</div>\n\n`;
  }

  // Specifications
  if (Object.keys(product.specifications).length > 0) {
    html += `<div class="specifications">\n`;
    html += `<h3>📐 Specifications</h3>\n<table>\n`;
    for (const [key, value] of Object.entries(product.specifications)) {
      html += `<tr><td><strong>${key}</strong></td><td>${value}</td></tr>\n`;
    }
    html += `</table>\n</div>\n\n`;
  }

  // Properties
  const importantProps = ["Protection Level", "Body Material", "Power Source", "Certification"];
  const relevantProps = Object.entries(product.properties).filter(([key]) =>
    importantProps.some((p) => key.includes(p))
  );

  if (relevantProps.length > 0) {
    html += `<div class="properties">\n`;
    html += `<h3>🏷️ Product Details</h3>\n<ul>\n`;
    for (const [key, value] of relevantProps) {
      html += `<li><strong>${key}:</strong> ${value}</li>\n`;
    }
    html += `</ul>\n</div>\n\n`;
  }

  // EU Shipping notice
  html += `<div class="eu-shipping">\n`;
  html += `<p>🇪🇺 <strong>Ships from EU warehouse</strong> - Fast delivery to all EU countries, no customs fees!</p>\n`;
  html += `</div>`;

  return html;
}

async function updateShopifyProduct(
  shopifyProductId: string,
  product: ParsedProduct,
  euVariants: ParsedVariant[],
  dryRun: boolean
): Promise<void> {
  console.log(`\n📦 Updating Shopify product ${shopifyProductId}...`);

  // Generate options from EU variants
  const colorOptions = [...new Set(euVariants.map((v) => v.emittingColor).filter(Boolean))];
  const quantityOptions = [...new Set(euVariants.map((v) => v.quantity).filter(Boolean))];

  console.log(`   Color options: ${colorOptions.join(", ")}`);
  console.log(`   Quantity options: ${quantityOptions.join(", ")}`);

  // Generate enhanced description
  const enhancedDescription = generateEnhancedDescription(product);

  if (dryRun) {
    console.log("\n[DRY RUN] Would update product with:");
    console.log(`   Title: ${product.title}`);
    console.log(`   Selling Points: ${product.sellingPoints.join(", ")}`);
    console.log(`   Specifications: ${Object.keys(product.specifications).join(", ")}`);
    console.log(`   Variants: ${euVariants.length} EU variants`);

    for (const variant of euVariants) {
      console.log(`     - ${variant.emittingColor} / ${variant.quantity}: €${variant.salePrice} (stock: ${variant.stock}) [from: ${variant.shipsFrom}]`);
    }
    return;
  }

  // Step 1: Update description only first
  console.log("   Updating product description...");
  const descUpdateResponse = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/products/${shopifyProductId}.json`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
      },
      body: JSON.stringify({
        product: {
          id: shopifyProductId,
          body_html: enhancedDescription,
        },
      }),
    }
  );

  if (!descUpdateResponse.ok) {
    const error = await descUpdateResponse.text();
    console.error(`   ❌ Failed to update description: ${error}`);
    return;
  }
  console.log("   ✅ Product description updated");

  // Step 2: Build variants array for full product update with options
  const shopifyVariants = euVariants.map((v) => ({
    price: v.salePrice.toFixed(2),
    compare_at_price: v.price > v.salePrice ? v.price.toFixed(2) : null,
    inventory_management: "shopify",
    inventory_policy: "continue",
    sku: `AE-${v.skuId}`,
    option1: v.emittingColor || "Default",
    option2: v.quantity || "Default",
    inventory_quantity: Math.min(v.stock, 999),
  }));

  // Build options array
  const options = [];
  if (colorOptions.length > 0) {
    options.push({ name: "Light Color" });
  }
  if (quantityOptions.length > 0) {
    options.push({ name: "Quantity" });
  }

  // Step 3: Update product with variants and options together
  console.log("   Updating product variants...");
  const variantUpdateResponse = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/products/${shopifyProductId}.json`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
      },
      body: JSON.stringify({
        product: {
          id: shopifyProductId,
          options: options,
          variants: shopifyVariants,
        },
      }),
    }
  );

  if (!variantUpdateResponse.ok) {
    const error = await variantUpdateResponse.text();
    console.error(`   ❌ Failed to update variants: ${error}`);
    return;
  }

  const updatedProduct = await variantUpdateResponse.json();
  console.log(`   ✅ Updated ${updatedProduct.product.variants?.length || 0} variants`);

  console.log("\n✅ Product sync complete!");
}

async function main() {
  const args = process.argv.slice(2);
  const productIdArg = args.find((a) => a.startsWith("--product-id="));
  const productId = productIdArg?.split("=")[1] || "1005008281471292";
  const dryRun = args.includes("--dry-run");

  console.log("=".repeat(60));
  console.log("Sync Product Variants from AliExpress to Shopify");
  console.log("=".repeat(60));
  console.log(`Product ID: ${productId}`);
  console.log(`Dry Run: ${dryRun}\n`);

  // Initialize AliExpress client
  const client = new AliExpressClient();
  const oauth = client.getOAuth();

  if (!oauth.isAuthorized()) {
    console.error("❌ AliExpress not authorized. Run authorization flow first.");
    return;
  }

  // Fetch product from AliExpress
  console.log("📦 Fetching product from AliExpress API...");

  // Try multiple countries
  const countries = ["ES", "FR", "IT", "NL", "PL"];
  let apiResponse: any = null;

  for (const country of countries) {
    const result = await client.getProduct(productId, country, "EUR", "EN");
    if (result.success && result.data?.aliexpress_ds_product_get_response?.result?.ae_item_base_info_dto) {
      apiResponse = result.data;
      console.log(`✅ Got product data (ship to: ${country})`);
      break;
    }
  }

  if (!apiResponse) {
    console.error("❌ Could not fetch product from AliExpress");
    return;
  }

  // Parse the product data
  const product = parseProductData(apiResponse);

  console.log(`\n📋 Product: ${product.title}`);
  console.log(`   Total variants: ${product.variants.length}`);

  // Filter to EU-only variants
  const euVariants = product.variants.filter((v) => v.isEU);
  console.log(`   EU warehouse variants: ${euVariants.length}`);

  if (euVariants.length === 0) {
    console.log("⚠️ No EU warehouse variants found!");
    return;
  }

  // Look up Shopify product ID from Supabase
  console.log("\n🔍 Looking up Shopify product...");

  // For now, hardcode the lookup (we can integrate Supabase later)
  // The product we're testing has Shopify ID: 9103587541180
  const shopifyProductId = "9103587541180";
  console.log(`   Found Shopify product ID: ${shopifyProductId}`);

  // Update Shopify product
  await updateShopifyProduct(shopifyProductId, product, euVariants, dryRun);
}

main().catch(console.error);
