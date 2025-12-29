/**
 * Fix Wrong Translations Script
 *
 * This script re-enriches products that have wrong-language translations.
 * It uses the audit results to identify affected products and re-runs
 * the enrichment process with the improved prompts.
 *
 * Usage:
 *   npx tsx scripts/fix-wrong-translations.ts [options]
 *
 * Options:
 *   --dry-run                  Preview what would be done without making changes
 *   --limit=N                  Process only N products (for testing)
 *   --handle=<handle>          Process only a specific product by handle
 *   --missing-only             Only process products with no translations
 *   --broken-only              Only process products with broken translations
 *
 * Prerequisites:
 *   Run `npx tsx scripts/audit-translations.ts` first to generate audit-results.json
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ALL_LOCALES = [
  "en", "de", "et", "fr", "ru", "pt",
  "es", "it", "nl", "pl", "cs", "sk",
  "hu", "ro", "bg", "el", "sv", "da",
  "fi", "lt", "lv", "sl", "hr", "mt"
] as const;

// Language names for translation prompts
const languageNames: Record<string, string> = {
  en: "English", de: "German", et: "Estonian", fr: "French",
  ru: "Russian", pt: "Portuguese", es: "Spanish", it: "Italian",
  nl: "Dutch", pl: "Polish", cs: "Czech", sk: "Slovak",
  hu: "Hungarian", ro: "Romanian", bg: "Bulgarian", el: "Greek",
  sv: "Swedish", da: "Danish", fi: "Finnish", lt: "Lithuanian",
  lv: "Latvian", sl: "Slovenian", hr: "Croatian", mt: "Maltese",
};

interface AuditResults {
  timestamp: string;
  summary: {
    total_in_shopify: number;
    with_translations: number;
    properly_translated: number;
    wrong_language: number;
    partial: number;
    missing: number;
  };
  needs_re_enrichment: string[];
  missing_translations: string[];
}

interface ShopifyProduct {
  id: string;
  handle: string;
  title: string;
  description: string;
  descriptionHtml: string;
  tags: string[];
  priceRange: {
    minVariantPrice: { amount: string; currencyCode: string };
  };
}

interface StructuredProductData {
  title: string;
  headline: string;
  description: string;
  usage_description: string;
  specifications: Record<string, string>;
  product_size: string;
  package_size: string;
  weight: string;
  package_contents: string;
  origin_country: string;
  shipping_info: string;
  seo_title: string;
  seo_description: string;
}

// ============ SHOPIFY API ============

async function fetchProductByHandle(handle: string): Promise<ShopifyProduct | null> {
  const query = `
    query GetProduct($handle: String!) {
      productByHandle(handle: $handle) {
        id
        handle
        title
        description
        descriptionHtml
        tags
        priceRange {
          minVariantPrice {
            amount
            currencyCode
          }
        }
      }
    }
  `;

  const response = await fetch(
    `https://${process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN}/api/${process.env.NEXT_PUBLIC_SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": process.env.NEXT_PUBLIC_SHOPIFY_STOREFRONT_TOKEN!,
      },
      body: JSON.stringify({ query, variables: { handle } }),
    }
  );

  const data = await response.json();
  return data.data?.productByHandle || null;
}

// ============ OPENAI API ============

async function extractStructuredData(product: ShopifyProduct): Promise<StructuredProductData> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const prompt = `Analyze this product and extract structured information. Return a JSON object.

Product Title: ${product.title}
Product Description: ${product.description || product.descriptionHtml}
Tags: ${product.tags?.join(", ") || "none"}
Price: €${parseFloat(product.priceRange.minVariantPrice.amount).toFixed(2)}

IMPORTANT: The product title may be in ANY language (German, Spanish, Portuguese, Chinese, etc.).
You MUST translate all content to English regardless of the source language.

Extract and return this JSON structure (use empty string "" if information is not available):
{
  "title": "Product title translated to English. Create a clear, SEO-friendly English title.",
  "headline": "Short catchy marketing tagline in English (5-10 words)",
  "description": "Full product description translated to English. Clean up and improve the original description, removing any HTML tags or formatting. Make it readable and informative (2-4 paragraphs).",
  "usage_description": "Where and how to use this product in English (1-2 sentences)",
  "specifications": {
    "style": "Design style (modern, vintage, minimalist, etc.)",
    "material": "Main materials used",
    "color": "Available colors",
    "process": "Manufacturing process if relevant",
    "installation_type": "How to install (wall-mounted, freestanding, etc.)",
    "indoor_outdoor": "Indoor, Outdoor, or Both"
  },
  "product_size": "Product dimensions (e.g., 164×2×70.5cm)",
  "package_size": "Package dimensions if known",
  "weight": "Product weight if known",
  "package_contents": "What's included in the package",
  "origin_country": "Country of manufacture",
  "shipping_info": "Shipping from EU warehouse, expected 5-7 business days",
  "seo_title": "SEO-optimized page title in English (50-60 chars)",
  "seo_description": "SEO meta description in English (150-160 chars)"
}

Respond ONLY with valid JSON, no markdown or explanation.`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a product data extraction assistant. Extract structured product information and return valid JSON only. ALWAYS translate to English.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 1000,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  let content = data.choices[0].message.content.trim();

  // Clean up potential markdown formatting
  if (content.startsWith("```json")) content = content.slice(7);
  if (content.startsWith("```")) content = content.slice(3);
  if (content.endsWith("```")) content = content.slice(0, -3);

  return JSON.parse(content);
}

async function translateWithOpenAI(text: string, targetLocale: string): Promise<string> {
  if (!text || text.trim() === "") return "";

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const targetLanguage = languageNames[targetLocale] || targetLocale;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a professional translator for e-commerce product content.

TASK: Translate the following text to ${targetLanguage}.

IMPORTANT RULES:
1. AUTO-DETECT the source language (it could be English, German, Spanish, Portuguese, Chinese, or any other language)
2. Translate accurately to ${targetLanguage}, preserving the meaning
3. Keep product names, brand names, and technical terms appropriate for the target market
4. Return ONLY the translated text, no explanations or notes
5. If the text is already in ${targetLanguage}, still return it (possibly improved for clarity)`,
        },
        { role: "user", content: text },
      ],
      max_tokens: 500,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    console.error(`OpenAI translation error:`, await response.text());
    return text;
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

async function translateStructuredData(
  data: StructuredProductData,
  targetLocale: string
): Promise<StructuredProductData> {
  if (targetLocale === "en") return data;

  const translateFn = (text: string) => translateWithOpenAI(text, targetLocale);

  const [
    title, headline, description, usage_description,
    style, material, color, process, installation_type, indoor_outdoor,
    product_size, package_size, weight, package_contents,
    origin_country, shipping_info, seo_title, seo_description,
  ] = await Promise.all([
    translateFn(data.title),
    translateFn(data.headline),
    translateFn(data.description),
    translateFn(data.usage_description),
    translateFn(data.specifications?.style || ""),
    translateFn(data.specifications?.material || ""),
    translateFn(data.specifications?.color || ""),
    translateFn(data.specifications?.process || ""),
    translateFn(data.specifications?.installation_type || ""),
    translateFn(data.specifications?.indoor_outdoor || ""),
    translateFn(data.product_size),
    translateFn(data.package_size),
    translateFn(data.weight),
    translateFn(data.package_contents),
    translateFn(data.origin_country),
    translateFn(data.shipping_info),
    translateFn(data.seo_title),
    translateFn(data.seo_description),
  ]);

  return {
    title, headline, description, usage_description,
    specifications: {
      style: style || undefined,
      material: material || undefined,
      color: color || undefined,
      process: process || undefined,
      installation_type: installation_type || undefined,
      indoor_outdoor: indoor_outdoor || undefined,
    },
    product_size, package_size, weight, package_contents,
    origin_country, shipping_info, seo_title, seo_description,
  } as StructuredProductData;
}

// ============ SLUG GENERATION ============

const cyrillicMap: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
  'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
  'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts',
  'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu',
  'я': 'ya', 'є': 'ye', 'і': 'i', 'ї': 'yi', 'ґ': 'g',
};

const greekMap: Record<string, string> = {
  'α': 'a', 'β': 'v', 'γ': 'g', 'δ': 'd', 'ε': 'e', 'ζ': 'z', 'η': 'i', 'θ': 'th',
  'ι': 'i', 'κ': 'k', 'λ': 'l', 'μ': 'm', 'ν': 'n', 'ξ': 'x', 'ο': 'o', 'π': 'p',
  'ρ': 'r', 'σ': 's', 'ς': 's', 'τ': 't', 'υ': 'y', 'φ': 'f', 'χ': 'ch', 'ψ': 'ps', 'ω': 'o',
};

const bulgarianMap: Record<string, string> = { ...cyrillicMap, 'щ': 'sht', 'ъ': 'a', 'ь': 'y' };

function transliterate(text: string, locale: string): string {
  let result = text.toLowerCase();
  let map: Record<string, string> = {};
  if (locale === 'ru') map = cyrillicMap;
  else if (locale === 'bg') map = bulgarianMap;
  else if (locale === 'el') map = greekMap;

  for (const [char, replacement] of Object.entries(map)) {
    result = result.replace(new RegExp(char, 'g'), replacement);
  }
  return result;
}

function generateSlug(title: string, locale: string, productId?: string): string {
  let slug = transliterate(title, locale);

  slug = slug
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  if (productId) {
    const idMatch = productId.match(/(\d+)$/);
    const suffix = idMatch ? idMatch[1].slice(-6) : productId.slice(-6);
    slug = `${slug}-${suffix}`;
  }

  return slug;
}

// ============ SUPABASE ============

async function saveTranslation(
  product: ShopifyProduct,
  data: StructuredProductData,
  locale: string
): Promise<void> {
  const slug = generateSlug(data.title, locale, product.id);

  const record = {
    shopify_product_id: product.id,
    shopify_handle: product.handle,
    locale,
    title: data.title,
    headline: data.headline,
    description: data.description || null,
    description_enhanced: null,
    seo_title: data.seo_title,
    seo_description: data.seo_description,
    slug,
    original_title: product.title,
    translation_source: "ai-enrichment-fixed",
    image_analyzed: false,
    usage_description: data.usage_description,
    specifications: data.specifications,
    product_size: data.product_size,
    package_size: data.package_size,
    weight: data.weight,
    package_contents: data.package_contents,
    origin_country: data.origin_country,
    shipping_info: data.shipping_info,
  };

  const { error } = await supabase
    .from("product_translations")
    .upsert(record, { onConflict: "shopify_product_id,locale" });

  if (error) {
    console.error(`Error saving ${locale} translation for ${product.handle}:`, error);
  }
}

// ============ MAIN ============

async function processProduct(
  handle: string,
  dryRun: boolean
): Promise<{ success: boolean; localesProcessed: number }> {
  console.log(`\nProcessing: ${handle}`);

  // Fetch product from Shopify
  const product = await fetchProductByHandle(handle);
  if (!product) {
    console.log(`  Product not found in Shopify`);
    return { success: false, localesProcessed: 0 };
  }

  // Extract structured data
  console.log("  Extracting structured data with AI...");
  const structuredData = await extractStructuredData(product);
  console.log(`  Extracted: "${structuredData.title}"`);

  if (dryRun) {
    console.log(`  [DRY RUN] Would save translations for all 24 locales`);
    console.log(`  Sample EN title: "${structuredData.title}"`);
    return { success: true, localesProcessed: 0 };
  }

  // Translate to all locales
  let localesProcessed = 0;
  for (const locale of ALL_LOCALES) {
    console.log(`  Translating to ${locale}...`);
    try {
      const translatedData = await translateStructuredData(structuredData, locale);
      await saveTranslation(product, translatedData, locale);
      console.log(`    Saved ${locale}: "${translatedData.title.slice(0, 40)}..."`);
      localesProcessed++;
      await new Promise((r) => setTimeout(r, 200)); // Rate limit
    } catch (error) {
      console.error(`    Error translating to ${locale}:`, error);
    }
  }

  return { success: true, localesProcessed };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1]) : undefined;
  const handleArg = args.find((a) => a.startsWith("--handle="));
  const specificHandle = handleArg?.split("=")[1];
  const missingOnly = args.includes("--missing-only");
  const brokenOnly = args.includes("--broken-only");

  console.log("=".repeat(60));
  console.log("Fix Wrong Translations Script");
  console.log("=".repeat(60));
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  if (limit) console.log(`Limit: ${limit} products`);
  if (specificHandle) console.log(`Specific handle: ${specificHandle}`);
  console.log("");

  // Validate environment
  if (!process.env.OPENAI_API_KEY) {
    console.error("ERROR: OPENAI_API_KEY is required");
    process.exit(1);
  }

  let handlesToProcess: string[] = [];

  if (specificHandle) {
    handlesToProcess = [specificHandle];
  } else {
    // Load audit results
    const auditPath = path.join(__dirname, "audit-results.json");
    if (!fs.existsSync(auditPath)) {
      console.error("ERROR: audit-results.json not found. Run audit-translations.ts first.");
      process.exit(1);
    }

    const auditResults: AuditResults = JSON.parse(fs.readFileSync(auditPath, "utf-8"));
    console.log(`Loaded audit results from ${auditResults.timestamp}`);
    console.log(`Summary: ${auditResults.summary.wrong_language} broken, ${auditResults.summary.missing} missing`);

    if (missingOnly) {
      handlesToProcess = auditResults.missing_translations;
    } else if (brokenOnly) {
      handlesToProcess = auditResults.needs_re_enrichment;
    } else {
      handlesToProcess = [
        ...auditResults.needs_re_enrichment,
        ...auditResults.missing_translations,
      ];
    }
  }

  if (limit) {
    handlesToProcess = handlesToProcess.slice(0, limit);
  }

  console.log(`\nProducts to process: ${handlesToProcess.length}`);

  // Process products
  let processed = 0;
  let failed = 0;
  let totalLocales = 0;

  for (const handle of handlesToProcess) {
    try {
      const result = await processProduct(handle, dryRun);
      if (result.success) {
        processed++;
        totalLocales += result.localesProcessed;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`Error processing ${handle}:`, error);
      failed++;
    }

    // Delay between products
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("\n" + "=".repeat(60));
  console.log("COMPLETE");
  console.log("=".repeat(60));
  console.log(`Processed: ${processed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total locales updated: ${totalLocales}`);
}

main().catch(console.error);
