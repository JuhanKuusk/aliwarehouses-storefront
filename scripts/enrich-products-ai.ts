/**
 * Bulk AI Product Enrichment Script
 *
 * This script:
 * 1. Fetches all products from Shopify
 * 2. Uses OpenAI GPT-4 to extract structured data from descriptions
 * 3. Translates structured data to all 24 EU locales using DeepL
 * 4. Saves enriched data to Supabase product_translations table
 *
 * Usage: npx tsx scripts/enrich-products-ai.ts [--dry-run] [--product-handle=<handle>]
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// All 24 EU locales
const ALL_LOCALES = [
  "en", "de", "et", "fr", "ru", "pt",
  "es", "it", "nl", "pl", "cs", "sk",
  "hu", "ro", "bg", "el", "sv", "da",
  "fi", "lt", "lv", "sl", "hr", "mt"
] as const;

// DeepL language code mapping (DeepL supports most EU languages)
const localeToDeepL: Record<string, string> = {
  en: "EN",
  de: "DE",
  et: "ET",
  fr: "FR",
  ru: "RU",
  pt: "PT-PT",
  es: "ES",
  it: "IT",
  nl: "NL",
  pl: "PL",
  cs: "CS",
  sk: "SK",
  hu: "HU",
  ro: "RO",
  bg: "BG",
  el: "EL",
  sv: "SV",
  da: "DA",
  fi: "FI",
  lt: "LT",
  lv: "LV",
  sl: "SL",
  // Languages not directly supported by DeepL - will use OpenAI
  hr: null,  // Croatian - use OpenAI
  mt: null,  // Maltese - use OpenAI
};

// Structured product data interface
interface StructuredProductData {
  title: string;
  headline: string;
  usage_description: string;
  specifications: {
    style?: string;
    material?: string;
    color?: string;
    process?: string;
    installation_type?: string;
    indoor_outdoor?: string;
  };
  product_size: string;
  package_size: string;
  weight: string;
  package_contents: string;
  origin_country: string;
  shipping_info: string;
  seo_title: string;
  seo_description: string;
}

// Shopify product type
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
  featuredImage?: { url: string };
}

// ============ SHOPIFY API ============

async function fetchAllProducts(): Promise<ShopifyProduct[]> {
  const query = `
    query GetProducts($first: Int!, $after: String) {
      products(first: $first, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
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
            featuredImage {
              url
            }
          }
        }
      }
    }
  `;

  const allProducts: ShopifyProduct[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    const response = await fetch(
      `https://${process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN}/api/${process.env.NEXT_PUBLIC_SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": process.env.NEXT_PUBLIC_SHOPIFY_STOREFRONT_TOKEN!,
        },
        body: JSON.stringify({
          query,
          variables: { first: 50, after: cursor },
        }),
      }
    );

    const data = await response.json();
    const products = data.data.products;

    allProducts.push(...products.edges.map((e: any) => e.node));
    hasNextPage = products.pageInfo.hasNextPage;
    cursor = products.pageInfo.endCursor;

    console.log(`Fetched ${allProducts.length} products...`);
  }

  return allProducts;
}

// ============ OPENAI API ============

async function extractStructuredData(
  product: ShopifyProduct
): Promise<StructuredProductData> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const prompt = `Analyze this product and extract structured information. Return a JSON object.

Product Title: ${product.title}
Product Description: ${product.description || product.descriptionHtml}
Tags: ${product.tags?.join(", ") || "none"}
Price: €${parseFloat(product.priceRange.minVariantPrice.amount).toFixed(2)}

Extract and return this JSON structure (use empty string "" if information is not available):
{
  "title": "Product title (keep original or improve slightly)",
  "headline": "Short catchy marketing tagline (5-10 words)",
  "usage_description": "Where and how to use this product (1-2 sentences)",
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
  "seo_title": "SEO-optimized page title (50-60 chars)",
  "seo_description": "SEO meta description (150-160 chars)"
}

Respond ONLY with valid JSON, no markdown or explanation.`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",  // Cost-effective model for structured data extraction
      messages: [
        {
          role: "system",
          content: "You are a product data extraction assistant. Extract structured product information and return valid JSON only.",
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
  if (content.startsWith("```json")) {
    content = content.slice(7);
  }
  if (content.startsWith("```")) {
    content = content.slice(3);
  }
  if (content.endsWith("```")) {
    content = content.slice(0, -3);
  }

  return JSON.parse(content);
}

// ============ DEEPL TRANSLATION ============

async function translateWithDeepL(
  text: string,
  targetLang: string
): Promise<string> {
  if (!text || text.trim() === "") return "";

  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) throw new Error("DEEPL_API_KEY is not configured");

  const params = new URLSearchParams({
    text,
    target_lang: targetLang,
    source_lang: "EN",
  });

  const response = await fetch("https://api.deepl.com/v2/translate", {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    console.error(`DeepL error for ${targetLang}:`, await response.text());
    return text; // Return original on error
  }

  const data = await response.json();
  return data.translations[0].text;
}

// Translate using OpenAI for all languages (DeepL quota exhausted)
async function translateWithOpenAI(
  text: string,
  targetLocale: string
): Promise<string> {
  if (!text || text.trim() === "") return "";

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const languageNames: Record<string, string> = {
    en: "English",
    de: "German",
    et: "Estonian",
    fr: "French",
    ru: "Russian",
    pt: "Portuguese",
    es: "Spanish",
    it: "Italian",
    nl: "Dutch",
    pl: "Polish",
    cs: "Czech",
    sk: "Slovak",
    hu: "Hungarian",
    ro: "Romanian",
    bg: "Bulgarian",
    el: "Greek",
    sv: "Swedish",
    da: "Danish",
    fi: "Finnish",
    lt: "Lithuanian",
    lv: "Latvian",
    sl: "Slovenian",
    hr: "Croatian",
    mt: "Maltese",
  };

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
          content: `Translate the following text to ${languageNames[targetLocale] || targetLocale}. Return ONLY the translation, no explanation.`,
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

// Translate structured data to a target locale
async function translateStructuredData(
  data: StructuredProductData,
  targetLocale: string
): Promise<StructuredProductData> {
  if (targetLocale === "en") {
    return data; // English is source, no translation needed
  }

  // Use OpenAI for all translations (DeepL key needs activation time)
  const translateFn = (text: string) => translateWithOpenAI(text, targetLocale);

  // Translate all text fields in parallel
  const [
    title,
    headline,
    usage_description,
    style,
    material,
    color,
    process,
    installation_type,
    indoor_outdoor,
    product_size,
    package_size,
    weight,
    package_contents,
    origin_country,
    shipping_info,
    seo_title,
    seo_description,
  ] = await Promise.all([
    translateFn(data.title),
    translateFn(data.headline),
    translateFn(data.usage_description),
    translateFn(data.specifications.style || ""),
    translateFn(data.specifications.material || ""),
    translateFn(data.specifications.color || ""),
    translateFn(data.specifications.process || ""),
    translateFn(data.specifications.installation_type || ""),
    translateFn(data.specifications.indoor_outdoor || ""),
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
    title,
    headline,
    usage_description,
    specifications: {
      style: style || undefined,
      material: material || undefined,
      color: color || undefined,
      process: process || undefined,
      installation_type: installation_type || undefined,
      indoor_outdoor: indoor_outdoor || undefined,
    },
    product_size,
    package_size,
    weight,
    package_contents,
    origin_country,
    shipping_info,
    seo_title,
    seo_description,
  };
}

// ============ SUPABASE ============

async function saveTranslation(
  product: ShopifyProduct,
  data: StructuredProductData,
  locale: string
): Promise<void> {
  const slug = generateSlug(data.title, locale);

  const record = {
    shopify_product_id: product.id,
    shopify_handle: product.handle,
    locale,
    title: data.title,
    headline: data.headline,
    description: null, // Can be filled with full description if needed
    description_enhanced: null,
    seo_title: data.seo_title,
    seo_description: data.seo_description,
    slug,
    original_title: product.title,
    translation_source: "ai-enrichment",
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
    .upsert(record, {
      onConflict: "shopify_product_id,locale",
    });

  if (error) {
    console.error(`Error saving ${locale} translation for ${product.handle}:`, error);
  }
}

// Transliteration maps for non-Latin scripts
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

const bulgarianMap: Record<string, string> = {
  ...cyrillicMap,
  'щ': 'sht', 'ъ': 'a', 'ь': 'y',
};

function transliterate(text: string, locale: string): string {
  let result = text.toLowerCase();

  // Choose the right map based on locale
  let map: Record<string, string> = {};
  if (locale === 'ru') map = cyrillicMap;
  else if (locale === 'bg') map = bulgarianMap;
  else if (locale === 'el') map = greekMap;

  // Apply transliteration
  for (const [char, replacement] of Object.entries(map)) {
    result = result.replace(new RegExp(char, 'g'), replacement);
  }

  return result;
}

function generateSlug(title: string, locale: string): string {
  // First transliterate non-Latin scripts
  let slug = transliterate(title, locale);

  return slug
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") // Remove leading/trailing dashes
    .slice(0, 100);
}

// ============ MAIN ============

async function processProduct(
  product: ShopifyProduct,
  dryRun: boolean
): Promise<void> {
  console.log(`\nProcessing: ${product.handle}`);

  // Step 1: Extract structured data using OpenAI
  console.log("  Extracting structured data with AI...");
  const structuredData = await extractStructuredData(product);
  console.log("  Extracted:", structuredData.headline);

  // Step 2: Translate to all locales
  for (const locale of ALL_LOCALES) {
    console.log(`  Translating to ${locale}...`);

    try {
      const translatedData = await translateStructuredData(structuredData, locale);

      if (!dryRun) {
        await saveTranslation(product, translatedData, locale);
        console.log(`    Saved ${locale} translation`);
      } else {
        console.log(`    [DRY RUN] Would save ${locale}: ${translatedData.title}`);
      }

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`    Error translating to ${locale}:`, error);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const productHandle = args.find((a) => a.startsWith("--product-handle="))?.split("=")[1];

  console.log("=".repeat(60));
  console.log("AI Product Enrichment Script");
  console.log("=".repeat(60));
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Target: ${productHandle || "ALL products"}`);
  console.log("");

  // Validate environment
  if (!process.env.OPENAI_API_KEY) {
    console.error("ERROR: OPENAI_API_KEY is required");
    process.exit(1);
  }
  // DeepL not required - using OpenAI for all translations

  // Fetch products
  console.log("Fetching products from Shopify...");
  let products = await fetchAllProducts();

  if (productHandle) {
    products = products.filter((p) => p.handle === productHandle);
    if (products.length === 0) {
      console.error(`Product not found: ${productHandle}`);
      process.exit(1);
    }
  }

  console.log(`Found ${products.length} products to process`);

  // Process each product
  let processed = 0;
  let errors = 0;

  for (const product of products) {
    try {
      await processProduct(product, dryRun);
      processed++;
    } catch (error) {
      console.error(`Error processing ${product.handle}:`, error);
      errors++;
    }

    // Delay between products to avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log("\n" + "=".repeat(60));
  console.log("COMPLETE");
  console.log("=".repeat(60));
  console.log(`Processed: ${processed}`);
  console.log(`Errors: ${errors}`);
}

main().catch(console.error);
