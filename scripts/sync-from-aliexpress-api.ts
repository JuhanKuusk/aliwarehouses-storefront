#!/usr/bin/env npx tsx
/**
 * Sync Products from AliExpress API
 *
 * Fetches complete product data (images, variants, descriptions) from
 * AliExpress Dropshipping API and updates Supabase + Shopify.
 *
 * Uses OAuth tokens from /Users/JuhanKuusk/DEVELOPMENT/Aliwarehouses.eu/.tokens.json
 *
 * Usage:
 *   npx tsx scripts/sync-from-aliexpress-api.ts [--limit N] [--product-id ID]
 */

import { config } from "dotenv";
import { resolve } from "path";
import fs from "fs";
import crypto from "crypto";

// Load environment from storefront
config({ path: resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";

// ============ CONFIGURATION ============

const ALIEXPRESS_APP_KEY = process.env.ALIEXPRESS_APP_KEY!;
const ALIEXPRESS_APP_SECRET = process.env.ALIEXPRESS_APP_SECRET!;
const ALIEXPRESS_API_URL = process.env.ALIEXPRESS_API_URL || "https://api-sg.aliexpress.com/sync";

// EU countries to try for API requests - prioritized by likely warehouse availability
const EU_COUNTRIES_TO_TRY = ['ES', 'FR', 'IT', 'NL', 'PL', 'DE', 'CZ', 'BE', 'PT', 'AT'];

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// OAuth tokens file from Aliwarehouses.eu project
const TOKENS_FILE = "/Users/JuhanKuusk/DEVELOPMENT/Aliwarehouses.eu/.tokens.json";

// Shopify Admin API
const SHOPIFY_DOMAIN = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN!;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN!;
const SHOPIFY_API_VERSION = "2024-10";

// Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============ OAUTH TOKEN MANAGEMENT ============

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  refresh_expires_at: number;
  user_id?: string;
}

function loadTokens(): TokenData | null {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      return JSON.parse(fs.readFileSync(TOKENS_FILE, "utf-8"));
    }
  } catch (error) {
    console.error("Error loading tokens:", error);
  }
  return null;
}

function saveTokens(tokens: TokenData): void {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
}

async function refreshAccessToken(refreshToken: string): Promise<TokenData> {
  const timestamp = Date.now().toString();
  const signingPath = "/auth/token/refresh";

  const params: Record<string, string> = {
    app_key: ALIEXPRESS_APP_KEY,
    timestamp,
    sign_method: "sha256",
    refresh_token: refreshToken,
  };

  // Generate HMAC-SHA256 signature
  const sortedKeys = Object.keys(params).sort();
  let signString = signingPath;
  for (const key of sortedKeys) {
    signString += key + params[key];
  }
  params.sign = crypto.createHmac("sha256", ALIEXPRESS_APP_SECRET)
    .update(signString)
    .digest("hex")
    .toUpperCase();

  const formBody = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const response = await fetch(`https://api-sg.aliexpress.com/rest${signingPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: formBody,
  });

  const data = await response.json();

  if (data.error_response || (data.code && data.code !== "0")) {
    throw new Error(`Token refresh error: ${data.message || data.error_response?.msg}`);
  }

  const tokenData: TokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expire_time || (Date.now() + 2592000000),
    refresh_expires_at: data.refresh_token_valid_time || (Date.now() + 5184000000),
    user_id: data.user_id,
  };

  saveTokens(tokenData);
  return tokenData;
}

async function getValidAccessToken(): Promise<string> {
  const tokens = loadTokens();

  if (!tokens) {
    throw new Error("No tokens found. Run OAuth authorization first.");
  }

  // Check if access token is still valid (with 5 min buffer)
  if (tokens.expires_at > Date.now() + 300000) {
    return tokens.access_token;
  }

  // Check if refresh token is still valid
  if (tokens.refresh_expires_at > Date.now()) {
    console.log("  Refreshing access token...");
    const newTokens = await refreshAccessToken(tokens.refresh_token);
    return newTokens.access_token;
  }

  throw new Error("All tokens expired. Re-authorization required.");
}

// ============ ALIEXPRESS API ============

interface ApiParams {
  [key: string]: string | number | boolean;
}

function generateSignature(params: ApiParams): string {
  const sortedKeys = Object.keys(params).sort();
  let signString = ALIEXPRESS_APP_SECRET;
  for (const key of sortedKeys) {
    signString += key + String(params[key]);
  }
  signString += ALIEXPRESS_APP_SECRET;
  return crypto.createHash("md5").update(signString).digest("hex").toUpperCase();
}

async function aliexpressRequest<T = unknown>(
  method: string,
  params: ApiParams = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
  const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);
  const accessToken = await getValidAccessToken();

  const systemParams: ApiParams = {
    app_key: ALIEXPRESS_APP_KEY,
    method,
    timestamp,
    sign_method: "md5",
    v: "2.0",
    format: "json",
    access_token: accessToken,
    ...params,
  };

  systemParams.sign = generateSignature(systemParams);

  const queryString = Object.entries(systemParams)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");

  const url = `${ALIEXPRESS_API_URL}?${queryString}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const data = await response.json();

    if (data.error_response) {
      return { success: false, error: data.error_response.msg || "Unknown error" };
    }

    return { success: true, data: data as T };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Request failed" };
  }
}

// ============ MULTI-COUNTRY FALLBACK ============

interface FallbackResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  workingCountry?: string;
}

async function fetchProductWithFallback<T = unknown>(
  productId: string
): Promise<FallbackResult<T>> {
  for (const country of EU_COUNTRIES_TO_TRY) {
    const result = await aliexpressRequest<T>("aliexpress.ds.product.get", {
      product_id: productId,
      ship_to_country: country,
      target_currency: "EUR",
      target_language: "EN",
    });

    if (result.success) {
      return { ...result, workingCountry: country };
    }

    // Check for country-specific errors that mean we should try next country
    const errorMsg = result.error?.toLowerCase() || "";
    if (
      errorMsg.includes("prohibited") ||
      errorMsg.includes("unsaleable") ||
      errorMsg.includes("sku") ||
      errorMsg.includes("country")
    ) {
      // Try next country
      await sleep(1500); // Rate limit protection
      continue;
    }

    // Check for API rate limit - wait and retry same country
    if (errorMsg.includes("frequency") || errorMsg.includes("limit")) {
      console.log(`    Rate limit hit, waiting 2s...`);
      await sleep(2000);
      // Retry same country
      const retryResult = await aliexpressRequest<T>("aliexpress.ds.product.get", {
        product_id: productId,
        ship_to_country: country,
        target_currency: "EUR",
        target_language: "EN",
      });
      if (retryResult.success) {
        return { ...retryResult, workingCountry: country };
      }
      continue;
    }

    // Break on other errors (auth, network issues)
    return result;
  }

  return { success: false, error: "Product not available in any EU country" };
}

// ============ PRODUCT DATA EXTRACTION ============

interface AliExpressProduct {
  ae_item_base_info_dto?: {
    product_id: number;
    subject: string;
    detail: string;
    mobile_detail: string;
  };
  ae_item_sku_info_dtos?: {
    ae_item_sku_info_d_t_o: Array<{
      sku_id: number;
      sku_price: string;
      sku_available_stock: number;
      offer_sale_price: string;
      sku_attr: string;
      ae_sku_property_dtos?: {
        ae_sku_property_d_t_o: Array<{
          sku_property_id: number;
          sku_property_name: string;
          sku_property_value: string;
          property_value_id: number;
          property_value_definition_name?: string;
          sku_image?: string;
        }>;
      };
    }>;
  };
  ae_multimedia_info_dto?: {
    image_urls: string;
    ae_video_dtos?: {
      ae_video_d_t_o: Array<{
        media_url: string;
        poster_url: string;
      }>;
    };
  };
  ae_store_info?: {
    store_id: number;
    store_name: string;
  };
  package_info_dto?: {
    gross_weight: string;
    package_height: number;
    package_length: number;
    package_width: number;
  };
}

function extractProductData(apiResponse: any): {
  images: string[];
  description: string;
  price: number;
  salePrice: number | null;
  stock: number;
  weight: string;
  variants: Array<{ sku: string; price: string; stock: number; attributes: string }>;
} {
  const result = apiResponse?.aliexpress_ds_product_get_response?.result as AliExpressProduct;

  // Extract images
  const imageStr = result?.ae_multimedia_info_dto?.image_urls || "";
  const images = imageStr.split(";").filter((url: string) => url.length > 0);

  // Extract description
  const description = result?.ae_item_base_info_dto?.detail ||
                     result?.ae_item_base_info_dto?.mobile_detail || "";

  // Extract SKUs/variants
  const skus = result?.ae_item_sku_info_dtos?.ae_item_sku_info_d_t_o || [];
  const variants = skus.map(sku => ({
    sku: String(sku.sku_id),
    price: sku.sku_price,
    stock: sku.sku_available_stock || 0,
    attributes: sku.sku_attr || "",
  }));

  // Calculate price and stock
  const prices = skus.map(s => parseFloat(s.sku_price || "0")).filter(p => p > 0);
  const salePrices = skus.map(s => parseFloat(s.offer_sale_price || "0")).filter(p => p > 0);
  const totalStock = skus.reduce((sum, s) => sum + (s.sku_available_stock || 0), 0);

  // Extract weight
  const weight = result?.package_info_dto?.gross_weight || "";

  return {
    images,
    description,
    price: prices.length > 0 ? Math.min(...prices) : 0,
    salePrice: salePrices.length > 0 ? Math.min(...salePrices) : null,
    stock: totalStock,
    weight,
    variants,
  };
}

// ============ VARIANT PARSING ============

// EU warehouse country names to match in "Ships From" field
const EU_WAREHOUSE_NAMES = [
  "spain", "es", "poland", "pl", "germany", "de", "france", "fr",
  "italy", "it", "netherlands", "nl", "belgium", "be", "czech", "cz",
  "austria", "at", "portugal", "pt"
];

interface ParsedVariant {
  skuId: string;
  options: Record<string, string>;  // { "Light Color": "Warm", "Quantity": "1PC" }
  shipsFrom: string;
  isEU: boolean;
  price: number;
  salePrice: number;
  stock: number;
  image?: string;
}

function parseVariantsFromAPI(apiResponse: any, workingCountry?: string): ParsedVariant[] {
  const result = apiResponse?.aliexpress_ds_product_get_response?.result as AliExpressProduct;
  const skuInfo = result?.ae_item_sku_info_dtos?.ae_item_sku_info_d_t_o || [];

  // First pass: collect all variants and check if any has "Ships From"
  const variants: ParsedVariant[] = [];
  let anyHasShipsFrom = false;

  for (const sku of skuInfo) {
    const props = sku.ae_sku_property_dtos?.ae_sku_property_d_t_o || [];
    const options: Record<string, string> = {};
    let shipsFrom = "";
    let image = "";

    for (const prop of props) {
      if (prop.sku_property_name === "Ships From") {
        shipsFrom = prop.sku_property_value || prop.property_value_definition_name || "";
        anyHasShipsFrom = true;
      } else {
        // Use display name if available, otherwise use raw value
        options[prop.sku_property_name] =
          prop.property_value_definition_name || prop.sku_property_value;
        if (prop.sku_image) image = prop.sku_image;
      }
    }

    // Check if ships from EU based on "Ships From" field
    const shipsFromLower = shipsFrom.toLowerCase();
    const isEUByShipsFrom = EU_WAREHOUSE_NAMES.some(country => shipsFromLower.includes(country));

    variants.push({
      skuId: String(sku.sku_id),
      options,
      shipsFrom,
      isEU: isEUByShipsFrom, // Will be updated in second pass if needed
      price: parseFloat(sku.sku_price || "0"),
      salePrice: parseFloat(sku.offer_sale_price || "0"),
      stock: sku.sku_available_stock || 0,
      image,
    });
  }

  // Second pass: if no variant has "Ships From" but API succeeded with EU country,
  // treat ALL variants as EU (product ships from single EU warehouse)
  if (!anyHasShipsFrom && workingCountry && EU_COUNTRIES_TO_TRY.includes(workingCountry)) {
    for (const variant of variants) {
      variant.isEU = true;
      variant.shipsFrom = workingCountry; // Mark source country
    }
  }

  return variants;
}

// ============ SHOPIFY VARIANT UPDATE ============

async function updateShopifyVariants(
  shopifyProductId: string,
  allVariants: ParsedVariant[]
): Promise<{ success: boolean; count: number }> {
  // Filter to EU variants only
  const euVariants = allVariants.filter(v => v.isEU);
  if (euVariants.length === 0) {
    return { success: false, count: 0 };
  }

  // Build unique options (max 3 for Shopify)
  const optionNames = new Set<string>();
  euVariants.forEach(v => Object.keys(v.options).forEach(k => optionNames.add(k)));
  const optionArray = Array.from(optionNames).slice(0, 3);

  // If no options, create a default
  if (optionArray.length === 0) {
    optionArray.push("Option");
  }

  // Deduplicate variants by their option combination
  // Keep the variant with highest stock for each unique option combo
  const variantsByOptions = new Map<string, ParsedVariant>();
  for (const v of euVariants) {
    const optionKey = optionArray.map(opt => v.options[opt] || "Default").join("|");
    const existing = variantsByOptions.get(optionKey);
    if (!existing || v.stock > existing.stock) {
      variantsByOptions.set(optionKey, v);
    }
  }
  const uniqueVariants = Array.from(variantsByOptions.values());

  // Build Shopify variants from deduplicated list
  const shopifyVariants = uniqueVariants.map(v => {
    const variant: any = {
      price: (v.salePrice > 0 ? v.salePrice : v.price).toFixed(2),
      sku: `AE-${v.skuId}`,
      inventory_quantity: Math.min(v.stock, 999),
      inventory_management: "shopify",
      option1: v.options[optionArray[0]] || v.shipsFrom || "Default",
    };

    // Add compare_at_price if there's a discount
    if (v.salePrice > 0 && v.price > v.salePrice) {
      variant.compare_at_price = v.price.toFixed(2);
    }

    // Add option2 and option3 if available
    if (optionArray[1] && v.options[optionArray[1]]) {
      variant.option2 = v.options[optionArray[1]];
    }
    if (optionArray[2] && v.options[optionArray[2]]) {
      variant.option3 = v.options[optionArray[2]];
    }

    return variant;
  });

  // Update Shopify product with options and variants
  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/products/${shopifyProductId}.json`,
    {
      method: "PUT",
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        product: {
          id: parseInt(shopifyProductId),
          options: optionArray.map(name => ({ name })),
          variants: shopifyVariants,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`    Variant update failed: ${response.status} - ${errorText.substring(0, 200)}`);
    return { success: false, count: 0 };
  }

  return { success: true, count: uniqueVariants.length };
}

// ============ SHOPIFY UPDATE ============

async function updateShopifyProduct(
  shopifyProductId: string,
  data: {
    images: string[];
    description: string;
    variants: Array<{ price: string; stock: number }>;
  }
): Promise<boolean> {
  // First, update the product
  const productUpdate: any = {
    product: {
      id: parseInt(shopifyProductId),
      body_html: data.description,
    },
  };

  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/products/${shopifyProductId}.json`,
    {
      method: "PUT",
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(productUpdate),
    }
  );

  if (!response.ok) {
    console.error(`  Shopify update failed: ${response.status}`);
    return false;
  }

  // Add images if we have new ones
  if (data.images.length > 0) {
    // Get existing images first
    const existingRes = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/products/${shopifyProductId}/images.json`,
      {
        headers: { "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN },
      }
    );
    const existingData = await existingRes.json();
    const existingCount = existingData.images?.length || 0;

    // Only add images if we have more than existing
    if (data.images.length > existingCount) {
      for (let i = existingCount; i < Math.min(data.images.length, 10); i++) {
        let imageUrl = data.images[i];
        if (imageUrl.startsWith("//")) {
          imageUrl = "https:" + imageUrl;
        }

        await fetch(
          `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/products/${shopifyProductId}/images.json`,
          {
            method: "POST",
            headers: {
              "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              image: { src: imageUrl },
            }),
          }
        );

        // Rate limiting
        await new Promise(r => setTimeout(r, 200));
      }
    }
  }

  return true;
}

// ============ MAIN ============

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find(a => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1]) : null;
  const productIdArg = args.find(a => a.startsWith("--product-id="));
  const specificProductId = productIdArg ? productIdArg.split("=")[1] : null;
  const forceRefresh = args.includes("--force-refresh");

  console.log("=".repeat(60));
  console.log("Sync Products from AliExpress API");
  console.log("=".repeat(60));
  if (forceRefresh) {
    console.log("Mode: FORCE REFRESH (re-checking all products)");
  }

  // Validate tokens
  const tokens = loadTokens();
  if (!tokens) {
    console.error("ERROR: No OAuth tokens found at", TOKENS_FILE);
    process.exit(1);
  }
  console.log(`OAuth tokens loaded (user: ${tokens.user_id})`);

  // Fetch products from Supabase
  let query = supabase
    .from("aliexpress_products")
    .select("aliexpress_product_id, shopify_product_id, title, api_fetched_at");

  if (specificProductId) {
    query = query.eq("aliexpress_product_id", specificProductId);
  } else if (!forceRefresh) {
    // Only fetch products without API data (unless force refresh)
    query = query.is("api_fetched_at", null);
  }

  if (limit) {
    query = query.limit(limit);
  }

  const { data: products, error } = await query;

  if (error) {
    console.error("Supabase error:", error);
    process.exit(1);
  }

  console.log(`Found ${products?.length || 0} products to sync\n`);

  if (!products || products.length === 0) {
    console.log("No products need syncing!");
    return;
  }

  let synced = 0;
  let errors = 0;

  for (const product of products) {
    console.log(`[${synced + errors + 1}/${products.length}] ${product.aliexpress_product_id}`);
    console.log(`  Title: ${product.title?.substring(0, 50)}...`);

    try {
      // Fetch from AliExpress API with multi-country fallback
      const result = await fetchProductWithFallback(product.aliexpress_product_id);

      if (!result.success) {
        console.log(`  ERROR: ${result.error}`);
        errors++;
        continue;
      }

      // Extract data
      const extracted = extractProductData(result.data);
      console.log(`  Country: ${result.workingCountry}`);
      console.log(`  Images: ${extracted.images.length}`);
      console.log(`  Variants: ${extracted.variants.length}`);
      console.log(`  Stock: ${extracted.stock}`);
      console.log(`  Price: €${extracted.price}`);

      // Update Supabase with working country
      const { error: updateError } = await supabase
        .from("aliexpress_products")
        .update({
          api_images: extracted.images,
          api_price: extracted.price,
          api_sale_price: extracted.salePrice,
          api_stock_quantity: extracted.stock,
          description: extracted.description.substring(0, 10000), // Limit size
          api_fetched_at: new Date().toISOString(),
          api_country_tested: result.workingCountry,
        })
        .eq("aliexpress_product_id", product.aliexpress_product_id);

      if (updateError) {
        console.log(`  Supabase update error: ${updateError.message}`);
      } else {
        console.log(`  Supabase updated`);
      }

      // Update Shopify description and images
      if (product.shopify_product_id && extracted.images.length > 0) {
        const shopifySuccess = await updateShopifyProduct(
          product.shopify_product_id,
          {
            images: extracted.images,
            description: extracted.description,
            variants: extracted.variants.map(v => ({ price: v.price, stock: v.stock })),
          }
        );
        console.log(`  Shopify: ${shopifySuccess ? "updated" : "failed"}`);

        // Parse and sync variants to Shopify
        const parsedVariants = parseVariantsFromAPI(result.data, result.workingCountry);
        const euVariants = parsedVariants.filter(v => v.isEU);
        console.log(`  EU Variants: ${euVariants.length} (of ${parsedVariants.length} total)`);

        if (euVariants.length > 0) {
          const variantResult = await updateShopifyVariants(product.shopify_product_id, parsedVariants);
          if (variantResult.success) {
            console.log(`  Shopify variants: synced ${variantResult.count}`);
          } else {
            console.log(`  Shopify variants: no EU variants to sync`);
          }
        }
      }

      synced++;

      // Rate limiting
      await new Promise(r => setTimeout(r, 500));

    } catch (error) {
      console.log(`  ERROR: ${error instanceof Error ? error.message : "Unknown"}`);
      errors++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("SYNC COMPLETE");
  console.log("=".repeat(60));
  console.log(`Synced: ${synced}`);
  console.log(`Errors: ${errors}`);
}

main().catch(console.error);
