import { config } from "dotenv";
import fs from "fs";
import crypto from "crypto";
config({ path: ".env.local" });

const TOKENS_FILE = "/Users/JuhanKuusk/DEVELOPMENT/Aliwarehouses.eu/.tokens.json";
const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, "utf-8"));

const ALIEXPRESS_APP_KEY = process.env.ALIEXPRESS_APP_KEY || "";
const ALIEXPRESS_APP_SECRET = process.env.ALIEXPRESS_APP_SECRET || "";
const ALIEXPRESS_API_URL = "https://api-sg.aliexpress.com/sync";

// EU countries to test - prioritized by likely warehouse availability
const EU_COUNTRIES_TO_TRY = ['ES', 'FR', 'IT', 'NL', 'PL', 'DE', 'CZ', 'BE', 'PT', 'AT'];

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testCountry(productId: string, country: string) {
  const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);

  const params: Record<string, string> = {
    app_key: ALIEXPRESS_APP_KEY,
    method: "aliexpress.ds.product.get",
    timestamp,
    sign_method: "md5",
    v: "2.0",
    format: "json",
    access_token: tokens.access_token,
    product_id: productId,
    ship_to_country: country,
    target_currency: "EUR",
    target_language: "EN",
  };

  // Generate signature
  const sortedKeys = Object.keys(params).sort();
  let signString = ALIEXPRESS_APP_SECRET;
  for (const key of sortedKeys) {
    signString += key + params[key];
  }
  signString += ALIEXPRESS_APP_SECRET;
  params.sign = crypto.createHash("md5").update(signString).digest("hex").toUpperCase();

  const queryString = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");

  const response = await fetch(`${ALIEXPRESS_API_URL}?${queryString}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  return await response.json();
}

async function testMultipleCountries() {
  const productId = "1005010183746570"; // Dining room cabinet from ES warehouse

  console.log("=".repeat(60));
  console.log(`Testing product ${productId} across EU countries`);
  console.log("=".repeat(60));

  const results: { country: string; success: boolean; error?: string; images?: number; variants?: number }[] = [];

  for (const country of EU_COUNTRIES_TO_TRY) {
    console.log(`\nTesting ${country}...`);

    try {
      const data = await testCountry(productId, country);

      // Check for error responses
      if (data.error_response) {
        console.log(`  ❌ Error: ${data.error_response.msg} (code: ${data.error_response.code})`);
        results.push({ country, success: false, error: data.error_response.msg });
      } else if (data.aliexpress_ds_product_get_response?.rsp_code && data.aliexpress_ds_product_get_response.rsp_code !== 200) {
        console.log(`  ❌ API Error: ${data.aliexpress_ds_product_get_response.rsp_msg} (code: ${data.aliexpress_ds_product_get_response.rsp_code})`);
        results.push({ country, success: false, error: data.aliexpress_ds_product_get_response.rsp_msg });
      } else {
        // Success!
        const result = data.aliexpress_ds_product_get_response?.result;
        const imageStr = result?.ae_multimedia_info_dto?.image_urls || "";
        const images = imageStr.split(";").filter((url: string) => url.length > 0);
        const variants = result?.ae_item_sku_info_dtos?.ae_item_sku_info_d_t_o?.length || 0;

        console.log(`  ✅ SUCCESS!`);
        console.log(`     Images: ${images.length}`);
        console.log(`     Variants: ${variants}`);
        console.log(`     Title: ${result?.ae_item_base_info_dto?.subject?.substring(0, 50)}...`);

        results.push({ country, success: true, images: images.length, variants });

        // Show full response for first successful country
        console.log("\n  Full response (first 500 chars):");
        console.log("  " + JSON.stringify(data).substring(0, 500) + "...");
      }
    } catch (error) {
      console.log(`  ❌ Request error: ${error instanceof Error ? error.message : "Unknown"}`);
      results.push({ country, success: false, error: "Request failed" });
    }

    // Rate limiting - wait between requests
    await sleep(1500);
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\nSuccessful countries (${successful.length}):`);
  for (const r of successful) {
    console.log(`  ✅ ${r.country} - ${r.images} images, ${r.variants} variants`);
  }

  console.log(`\nFailed countries (${failed.length}):`);
  for (const r of failed) {
    console.log(`  ❌ ${r.country} - ${r.error}`);
  }

  if (successful.length > 0) {
    console.log(`\n🎉 BEST COUNTRY: ${successful[0].country}`);
  } else {
    console.log("\n❌ No countries worked for this product");
  }
}

testMultipleCountries().catch(console.error);
