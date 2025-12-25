#!/usr/bin/env npx tsx
/**
 * Scrape Full Product Details from AliExpress
 *
 * Uses ScraperAPI to fetch the product page and extract:
 * - Variants/SKUs
 * - Selling points
 * - Detailed specifications
 * - Full description
 *
 * Usage:
 *   npx tsx scripts/scrape-product-details.ts --product-id 1005008281471292
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;

async function scrapeProductPage(productId: string) {
  const productUrl = `https://www.aliexpress.com/item/${productId}.html`;

  console.log(`Fetching: ${productUrl}`);

  // Use ScraperAPI to bypass anti-bot protection
  const scraperUrl = `http://api.scraperapi.com/?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(productUrl)}&render=true`;

  const response = await fetch(scraperUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`Scraper failed: ${response.status}`);
  }

  return await response.text();
}

function extractProductData(html: string) {
  const data: any = {
    title: null,
    sellingPoints: [],
    specifications: {},
    variants: [],
    description: null,
  };

  // Try to find product data in window.__INIT_DATA__ or similar
  const initDataMatch = html.match(/window\.__INIT_DATA__\s*=\s*({[\s\S]*?});/);
  if (initDataMatch) {
    try {
      const initData = JSON.parse(initDataMatch[1]);
      console.log("Found __INIT_DATA__");
      return initData;
    } catch (e) {
      console.log("Failed to parse __INIT_DATA__");
    }
  }

  // Try to find runParams data
  const runParamsMatch = html.match(/data:\s*({[\s\S]*?}),\s*csrfToken/);
  if (runParamsMatch) {
    try {
      const runParams = JSON.parse(runParamsMatch[1]);
      console.log("Found runParams data");
      return runParams;
    } catch (e) {
      console.log("Failed to parse runParams");
    }
  }

  // Extract selling points (usually in a specific div)
  const sellingPointsMatch = html.match(/sellingPoint[^>]*>([^<]+)/gi);
  if (sellingPointsMatch) {
    data.sellingPoints = sellingPointsMatch.map((m) =>
      m.replace(/<[^>]+>/g, "").trim()
    );
  }

  // Extract title
  const titleMatch = html.match(/<h1[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)/i);
  if (titleMatch) {
    data.title = titleMatch[1].trim();
  }

  // Extract specs from table
  const specMatches = html.matchAll(/<tr[^>]*>[\s\S]*?<td[^>]*>([^<]+)<\/td>[\s\S]*?<td[^>]*>([^<]+)<\/td>/gi);
  for (const match of specMatches) {
    data.specifications[match[1].trim()] = match[2].trim();
  }

  return data;
}

async function main() {
  const args = process.argv.slice(2);
  const productIdArg = args.find((a) => a.startsWith("--product-id="));
  const productId = productIdArg?.split("=")[1] || "1005008281471292";

  console.log("=".repeat(60));
  console.log("Scrape AliExpress Product Details");
  console.log("=".repeat(60));
  console.log(`Product ID: ${productId}\n`);

  if (!SCRAPER_API_KEY) {
    console.error("SCRAPER_API_KEY not configured!");
    return;
  }

  try {
    const html = await scrapeProductPage(productId);
    console.log(`\nReceived ${html.length} bytes\n`);

    // Save HTML for debugging
    const fs = await import("fs");
    fs.writeFileSync("/tmp/aliexpress-product.html", html);
    console.log("Saved HTML to /tmp/aliexpress-product.html\n");

    // Look for JSON data in the page
    const jsonMatches = html.match(/window\._dida_config_\s*=\s*({[\s\S]*?});/);
    if (jsonMatches) {
      console.log("Found _dida_config_ data");
      try {
        const didaData = JSON.parse(jsonMatches[1]);
        console.log(JSON.stringify(didaData, null, 2).substring(0, 2000));
      } catch (e) {
        console.log("Could not parse");
      }
    }

    // Look for SKU data
    const skuMatch = html.match(/skuModule["\s]*:\s*({[\s\S]*?})\s*,\s*["\w]+Module/);
    if (skuMatch) {
      console.log("\n📦 Found SKU Module!");
      console.log(skuMatch[1].substring(0, 1000));
    }

    // Look for specifications
    const specsMatch = html.match(/specsModule["\s]*:\s*({[\s\S]*?})\s*,\s*["\w]+Module/);
    if (specsMatch) {
      console.log("\n📐 Found Specs Module!");
      console.log(specsMatch[1].substring(0, 1000));
    }

    // Check for product detail data
    const detailMatch = html.match(/descriptionModule["\s]*:\s*({[\s\S]*?})\s*,\s*["\w]+Module/);
    if (detailMatch) {
      console.log("\n📝 Found Description Module!");
      console.log(detailMatch[1].substring(0, 500));
    }

    // Search for any JSON that looks like product data
    const allJsonMatches = html.matchAll(/"productSKUPropertyList"\s*:\s*(\[[^\]]+\])/g);
    for (const match of allJsonMatches) {
      console.log("\n🎨 Found productSKUPropertyList!");
      console.log(match[1]);
    }

  } catch (error) {
    console.error("Error:", error);
  }
}

main().catch(console.error);
