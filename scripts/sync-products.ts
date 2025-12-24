/**
 * Product Translation Sync Script
 *
 * Usage:
 *   npx tsx scripts/sync-products.ts           # Sync all products
 *   npx tsx scripts/sync-products.ts --limit 10  # Sync first 10 products (for testing)
 *   npx tsx scripts/sync-products.ts --handle my-product  # Sync specific product
 */

import { config } from "dotenv";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

// Load environment variables FIRST
config({ path: resolve(process.cwd(), ".env.local") });

// Now we can access env vars
const SHOPIFY_DOMAIN = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN!;
const SHOPIFY_TOKEN = process.env.NEXT_PUBLIC_SHOPIFY_STOREFRONT_TOKEN!;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN!;
const SHOPIFY_API_VERSION = process.env.NEXT_PUBLIC_SHOPIFY_API_VERSION || "2024-10";
const DEEPL_API_KEY = process.env.DEEPL_API_KEY!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Create Supabase client directly (avoid module-level initialization)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface ShopifyProduct {
  id: string;
  handle: string;
  title: string;
  description: string;
  descriptionHtml: string;
  featuredImage?: {
    url: string;
    altText: string | null;
  };
}

// Structured product data extracted from description
interface ParsedProductData {
  shipping_info: string | null;
  usage_description: string | null;
  specifications: {
    style: string | null;
    material: string | null;
    color: string | null;
    process: string | null;
    installation_type: string | null;
    indoor_outdoor: string | null;
  };
  product_size: string | null;
  package_size: string | null;
  weight: string | null;
  package_contents: string | null;
  origin_country: string | null;
  clean_description: string | null;
}

/**
 * Parse AliExpress product description to extract structured data
 * Handles both English and German source text with common patterns
 */
function parseProductDescription(description: string): ParsedProductData {
  // Clean HTML and normalize whitespace
  const text = description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

  const result: ParsedProductData = {
    shipping_info: null,
    usage_description: null,
    specifications: {
      style: null,
      material: null,
      color: null,
      process: null,
      installation_type: null,
      indoor_outdoor: null,
    },
    product_size: null,
    package_size: null,
    weight: null,
    package_contents: null,
    origin_country: null,
    clean_description: null,
  };

  // Extract shipping info
  const shippingMatch = text.match(/🇪🇺?\s*(Ships from EU.*?(?:\d+\s*(?:business\s*)?days))/i) ||
                        text.match(/🇪🇺?\s*(Versand aus EU.*?(?:\d+\s*(?:Werk)?tage))/i);
  if (shippingMatch) {
    result.shipping_info = shippingMatch[1].trim();
  }

  // Extract Application/Usage section (using [\s\S] instead of . with s flag for ES5 compatibility)
  const applicationMatch = text.match(/Application\s+([\s\S]*?)(?=Specification|$)/i) ||
                           text.match(/Verwendung\s+([\s\S]*?)(?=Spezifikation|$)/i);
  if (applicationMatch) {
    result.usage_description = applicationMatch[1].replace(/\s+/g, " ").trim();
  }

  // Extract specifications with clear field boundaries
  // Material - stop at next field or section
  const materialMatch = text.match(/Material:\s*([A-Za-z\s,]+?)(?=\s*(?:Color|Colour|Style|Origin|Process|Mounting|Indoor|Assembly|Product|Package|Specification|$))/i);
  if (materialMatch) {
    result.specifications.material = materialMatch[1].trim();
  }

  // Color
  const colorMatch = text.match(/Colou?r:\s*([A-Za-z\s,&]+?)(?=\s*(?:Material|Style|Process|Mounting|Indoor|Assembly|Product|Package|$))/i);
  if (colorMatch) {
    result.specifications.color = colorMatch[1].trim();
  }

  // Style
  const styleMatch = text.match(/Style:\s*([A-Za-z\s,]+?)(?=\s*(?:Material|Color|Colour|Process|Mounting|Indoor|Assembly|Product|Package|$))/i);
  if (styleMatch) {
    result.specifications.style = styleMatch[1].trim();
  }

  // Process
  const processMatch = text.match(/Process:\s*([A-Za-z\s,]+?)(?=\s*(?:Material|Color|Colour|Style|Mounting|Indoor|Assembly|Product|Package|$))/i);
  if (processMatch) {
    result.specifications.process = processMatch[1].trim();
  }

  // Installation/Mounting Type
  const mountMatch = text.match(/(?:Mounting\s*Type|Installation\s*Type):\s*([A-Za-z\s]+?)(?=\s*(?:Indoor|Assembly|Product|Package|$))/i);
  if (mountMatch) {
    result.specifications.installation_type = mountMatch[1].trim();
  }

  // Indoor/Outdoor
  const indoorMatch = text.match(/Indoor\/Outdoor\s*(?:Use)?:\s*([A-Za-z]+)/i);
  if (indoorMatch) {
    result.specifications.indoor_outdoor = indoorMatch[1].trim();
  }

  // Product Size - look for dimensions pattern (stop before Package)
  const productSizeMatch = text.match(/Product\s*Size:\s*([\d*x×.,\s\/]+(?:cm|mm|m|in)[^\s]*)/i);
  if (productSizeMatch) {
    result.product_size = productSizeMatch[1].trim();
  }

  // Package Size (stop before Gross/Weight)
  const packageSizeMatch = text.match(/Package\s*Size:\s*([\d*x×.,\s\/]+(?:cm|mm|m|in)[^\s]*)/i);
  if (packageSizeMatch) {
    result.package_size = packageSizeMatch[1].trim();
  }

  // Weight (Gross Weight)
  const weightMatch = text.match(/(?:Gross\s*)?Weight:\s*([\d.,]+\s*(?:kg|g|lbs)[^P]*?)(?=\s*Package|$)/i);
  if (weightMatch) {
    result.weight = weightMatch[1].trim();
  }

  // Package Included/Contents (using [\s\S] instead of . with s flag for ES5 compatibility)
  const packageMatch = text.match(/Package\s*(?:Included|Contains)?\s+([\d*×x][\s\S]*?)(?=Other|Note|$)/i);
  if (packageMatch) {
    let contents = packageMatch[1].replace(/\s+/g, " ").trim();
    // Also capture "Other Installation Accessories" if present
    const otherMatch = text.match(/Other\s+(Installation\s+Accessories|Accessories)/i);
    if (otherMatch) {
      contents += ", " + otherMatch[0];
    }
    result.package_contents = contents;
  }

  // Origin Country
  const originMatch = text.match(/Origin:\s*([A-Za-z\s]+?)(?=\s*(?:Package|Weight|Material|Color|$))/i);
  if (originMatch) {
    result.origin_country = originMatch[1].trim();
  }

  // Create clean description (the Application section content)
  if (result.usage_description) {
    result.clean_description = result.usage_description;
  }

  return result;
}

// DeepL API functions
type DeepLLanguage = "EN" | "DE" | "ET" | "FR" | "RU" | "PT-PT";

const localeToDeepL: Record<string, DeepLLanguage> = {
  en: "EN",
  de: "DE",
  et: "ET",
  fr: "FR",
  ru: "RU",
  pt: "PT-PT",
};

const deepLToLocale: Record<DeepLLanguage, string> = {
  EN: "en",
  DE: "de",
  ET: "et",
  FR: "fr",
  RU: "ru",
  "PT-PT": "pt",
};

async function translateText(text: string, targetLang: DeepLLanguage, sourceLang?: DeepLLanguage): Promise<string> {
  const params = new URLSearchParams({ text, target_lang: targetLang });
  if (sourceLang) params.append("source_lang", sourceLang);

  const response = await fetch("https://api.deepl.com/v2/translate", {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${DEEPL_API_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepL API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.translations[0].text;
}

async function translateToAllLanguages(text: string, sourceLang: DeepLLanguage = "DE"): Promise<Record<string, string>> {
  const targetLanguages: DeepLLanguage[] = ["EN", "DE", "ET", "FR", "RU", "PT-PT"];
  const results: Record<string, string> = {};

  const translations = await Promise.all(
    targetLanguages.map(async (lang) => {
      if (lang === sourceLang) {
        return { lang, text };
      }
      const translated = await translateText(text, lang, sourceLang);
      return { lang, text: translated };
    })
  );

  translations.forEach(({ lang, text }) => {
    const locale = deepLToLocale[lang];
    results[locale] = text;
  });

  return results;
}

async function getUsage(): Promise<{ character_count: number; character_limit: number }> {
  const response = await fetch("https://api.deepl.com/v2/usage", {
    headers: { Authorization: `DeepL-Auth-Key ${DEEPL_API_KEY}` },
  });
  if (!response.ok) throw new Error(`DeepL API error: ${response.status}`);
  return response.json();
}

// Shopify functions - Use Admin API to get ALL products including those not on sales channels
async function fetchProducts(limit: number = 250): Promise<ShopifyProduct[]> {
  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=${limit}`,
    {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Shopify Admin API error: ${response.status}`);
  }

  const data = await response.json();

  // Map Admin API response to our ShopifyProduct interface
  return (data.products || []).map((p: { id: number; handle: string; title: string; body_html: string; image?: { src: string } }) => ({
    id: `gid://shopify/Product/${p.id}`,
    handle: p.handle,
    title: p.title,
    description: p.body_html?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || "",
    descriptionHtml: p.body_html || "",
    featuredImage: p.image ? { url: p.image.src, altText: null } : undefined,
  }));
}

async function fetchProductByHandle(handle: string): Promise<ShopifyProduct | null> {
  const query = `
    query GetProduct($handle: String!) {
      product(handle: $handle) {
        id
        handle
        title
        description
        descriptionHtml
        featuredImage {
          url
          altText
        }
      }
    }
  `;

  const response = await fetch(
    `https://${SHOPIFY_DOMAIN}/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": SHOPIFY_TOKEN,
      },
      body: JSON.stringify({ query, variables: { handle } }),
    }
  );

  const data = await response.json();
  return data.data?.product || null;
}

// Supabase functions
async function upsertTranslation(translation: {
  shopify_product_id: string;
  shopify_handle: string;
  locale: string;
  title: string;
  headline: string | null;
  description: string | null;
  description_enhanced: string | null;
  seo_title: string | null;
  seo_description: string | null;
  slug: string;
  original_title: string | null;
  translation_source: string;
  image_analyzed: boolean;
  // Structured fields
  shipping_info?: string | null;
  usage_description?: string | null;
  specifications?: Record<string, string | null> | null;
  product_size?: string | null;
  package_size?: string | null;
  weight?: string | null;
  package_contents?: string | null;
  origin_country?: string | null;
}) {
  const { error } = await supabase
    .from("product_translations")
    .upsert(translation, { onConflict: "shopify_product_id,locale" });

  if (error) throw new Error(`Failed to upsert translation: ${error.message}`);
}

async function upsertSlugMapping(mapping: {
  shopify_handle: string;
  locale: string;
  localized_slug: string;
}) {
  const { error } = await supabase
    .from("product_slug_mappings")
    .upsert(mapping, { onConflict: "shopify_handle,locale" });

  if (error) throw new Error(`Failed to upsert slug mapping: ${error.message}`);
}

const LOCALES = ["en", "de", "et", "fr", "ru", "pt"] as const;

// Helper to translate a single text field if it exists
async function translateFieldIfExists(
  text: string | null,
  sourceLang: DeepLLanguage = "EN"  // Default to English since AliExpress descriptions are in English
): Promise<Record<string, string>> {
  if (!text || text.trim().length === 0) {
    return {};
  }
  return translateToAllLanguages(text, sourceLang);
}

async function translateProduct(product: ShopifyProduct, options: { skipOpenAI?: boolean } = {}) {
  console.log(`\n📦 Translating: ${product.title} (${product.handle})`);

  const shopifyProductId = product.id.split("/").pop()!;

  // Parse the description to extract structured data
  console.log("  ├─ Parsing product description...");
  const parsed = parseProductDescription(product.descriptionHtml || product.description || "");

  const hasStructuredData = parsed.shipping_info || parsed.usage_description ||
    parsed.specifications.material || parsed.product_size;

  if (hasStructuredData) {
    console.log("  │  └─ Found structured data (specs, dimensions, usage)");
  }

  console.log("  ├─ Translating with DeepL...");

  // Detect source language (titles are usually German, descriptions are English)
  const titleSourceLang: DeepLLanguage = "EN";  // Titles appear to be in English too based on the data
  const descSourceLang: DeepLLanguage = "EN";   // Descriptions are in English

  // Translate title and all structured fields in parallel
  const translationPromises: Promise<{ key: string; translations: Record<string, string> }>[] = [
    translateToAllLanguages(product.title, titleSourceLang).then(t => ({ key: "title", translations: t })),
  ];

  // Add structured field translations (all in English)
  if (parsed.shipping_info) {
    translationPromises.push(
      translateFieldIfExists(parsed.shipping_info, descSourceLang).then(t => ({ key: "shipping_info", translations: t }))
    );
  }
  if (parsed.usage_description) {
    translationPromises.push(
      translateFieldIfExists(parsed.usage_description, descSourceLang).then(t => ({ key: "usage_description", translations: t }))
    );
  }
  if (parsed.package_contents) {
    translationPromises.push(
      translateFieldIfExists(parsed.package_contents, descSourceLang).then(t => ({ key: "package_contents", translations: t }))
    );
  }
  if (parsed.origin_country) {
    translationPromises.push(
      translateFieldIfExists(parsed.origin_country, descSourceLang).then(t => ({ key: "origin_country", translations: t }))
    );
  }

  // Translate specifications
  const specKeys = ["style", "material", "color", "process", "installation_type", "indoor_outdoor"] as const;
  for (const specKey of specKeys) {
    const specValue = parsed.specifications[specKey];
    if (specValue) {
      translationPromises.push(
        translateFieldIfExists(specValue, descSourceLang).then(t => ({ key: `spec_${specKey}`, translations: t }))
      );
    }
  }

  // Translate clean description or fallback to original
  const descToTranslate = parsed.clean_description || product.description;
  if (descToTranslate) {
    translationPromises.push(
      translateFieldIfExists(descToTranslate, descSourceLang).then(t => ({ key: "description", translations: t }))
    );
  }

  // Execute all translations in parallel
  const translationResults = await Promise.all(translationPromises);

  // Build translation maps
  const translationsMap: Record<string, Record<string, string>> = {};
  for (const { key, translations } of translationResults) {
    translationsMap[key] = translations;
  }

  console.log("  ├─ Saving translations...");

  for (const locale of LOCALES) {
    const title = translationsMap.title?.[locale] || product.title;
    const description = translationsMap.description?.[locale] || product.description || "";

    // Generate slug from title + product ID for uniqueness
    const baseSlug = title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 40);
    const slug = `${baseSlug}-${shopifyProductId.slice(-6)}`;

    // Build translated specifications
    const translatedSpecs: Record<string, string | null> = {};
    for (const specKey of specKeys) {
      translatedSpecs[specKey] = translationsMap[`spec_${specKey}`]?.[locale] || parsed.specifications[specKey];
    }

    await upsertTranslation({
      shopify_product_id: shopifyProductId,
      shopify_handle: product.handle,
      locale,
      title,
      headline: null,
      description,
      description_enhanced: null,
      seo_title: title.substring(0, 60),
      seo_description: (description || "").substring(0, 160),
      slug,
      original_title: product.title,
      translation_source: "deepl",
      image_analyzed: false,
      // Structured fields
      shipping_info: translationsMap.shipping_info?.[locale] || parsed.shipping_info,
      usage_description: translationsMap.usage_description?.[locale] || parsed.usage_description,
      specifications: translatedSpecs,
      product_size: parsed.product_size, // Keep original (dimensions don't need translation)
      package_size: parsed.package_size,
      weight: parsed.weight,
      package_contents: translationsMap.package_contents?.[locale] || parsed.package_contents,
      origin_country: translationsMap.origin_country?.[locale] || parsed.origin_country,
    });

    await upsertSlugMapping({
      shopify_handle: product.handle,
      locale,
      localized_slug: slug,
    });

    console.log(`  │  └─ [${locale}] ${title.substring(0, 40)}...`);
  }

  console.log(`  └─ ✓ Done (${hasStructuredData ? "with structured data" : "basic translation"})`);
}

async function main() {
  const args = process.argv.slice(2);
  const limitIndex = args.indexOf("--limit");
  const handleIndex = args.indexOf("--handle");
  const skipOpenAI = args.includes("--skip-openai");

  console.log("🚀 AliWarehouses Product Translation Sync\n");

  // Check DeepL usage
  try {
    const usage = await getUsage();
    console.log(`📊 DeepL Usage: ${usage.character_count.toLocaleString()} / ${usage.character_limit.toLocaleString()} characters`);
  } catch (error) {
    console.error("⚠️  Could not fetch DeepL usage:", error);
  }

  let products: ShopifyProduct[];

  if (handleIndex !== -1 && args[handleIndex + 1]) {
    const handle = args[handleIndex + 1];
    console.log(`\n🔍 Fetching product: ${handle}`);
    const product = await fetchProductByHandle(handle);
    if (!product) {
      console.error(`❌ Product not found: ${handle}`);
      process.exit(1);
    }
    products = [product];
  } else {
    const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) || 10 : 250;
    console.log(`\n📥 Fetching ${limit} products from Shopify...`);
    products = await fetchProducts(limit);
  }

  console.log(`📦 Found ${products.length} products to translate\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const product of products) {
    try {
      await translateProduct(product, { skipOpenAI });
      successCount++;
    } catch (error) {
      console.error(`❌ Error translating ${product.handle}:`, error);
      errorCount++;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log(`\n✅ Sync complete: ${successCount} success, ${errorCount} errors`);

  try {
    const usage = await getUsage();
    console.log(`📊 DeepL Usage: ${usage.character_count.toLocaleString()} / ${usage.character_limit.toLocaleString()} characters`);
  } catch (error) {
    // Ignore
  }
}

main().catch(console.error);
