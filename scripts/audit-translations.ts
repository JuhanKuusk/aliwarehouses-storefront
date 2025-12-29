/**
 * Audit Translation Quality Script
 *
 * This script analyzes product_translations to identify:
 * 1. Products with no translations (missing from Supabase)
 * 2. Products with wrong-language translations (same content for all locales)
 * 3. Products with partial translations (some locales missing)
 *
 * Usage: npx tsx scripts/audit-translations.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

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

interface TranslationRecord {
  shopify_handle: string;
  shopify_product_id: string;
  locale: string;
  title: string;
  slug: string;
}

interface AuditResult {
  shopify_handle: string;
  issue: "no_translations" | "wrong_language" | "partial" | "ok";
  unique_slugs: number;
  locales_count: number;
  sample_title: string;
  needs_re_enrichment: boolean;
}

// Simple heuristics to detect wrong language in translations
function detectLanguageIssues(translations: TranslationRecord[]): boolean {
  if (translations.length < 2) return true;

  // Get unique slugs - properly translated products should have many unique slugs
  const uniqueSlugs = new Set(translations.map(t => t.slug));

  // If all locales have the same slug, translation failed
  if (uniqueSlugs.size <= 2) {
    return true;
  }

  // Check for German patterns in non-German locales
  const germanPatterns = /\b(und|für|mit|aus|der|die|das|Wand|Lampe|Licht|Leuchte|Metall)\b/i;
  const spanishPatterns = /\b(para|con|luz|solar|exterior|lámpara|jardín|patio)\b/i;
  const portuguesePatterns = /\b(para|com|luz|solar|exterior|lâmpada|jardim|pátio|repelente)\b/i;

  for (const t of translations) {
    // Skip checking native language locales
    if (t.locale === "de" && germanPatterns.test(t.title)) continue;
    if (t.locale === "es" && spanishPatterns.test(t.title)) continue;
    if (t.locale === "pt" && portuguesePatterns.test(t.title)) continue;

    // Check for wrong language in other locales
    if (t.locale !== "de" && germanPatterns.test(t.title)) {
      return true;
    }
    if (t.locale !== "es" && t.locale !== "pt" && spanishPatterns.test(t.title)) {
      return true;
    }
    if (t.locale !== "pt" && t.locale !== "es" && portuguesePatterns.test(t.title)) {
      return true;
    }
  }

  return false;
}

async function auditTranslations(): Promise<AuditResult[]> {
  console.log("Fetching all translations from Supabase...");

  const { data: translations, error } = await supabase
    .from("product_translations")
    .select("shopify_handle, shopify_product_id, locale, title, slug")
    .order("shopify_handle");

  if (error) {
    console.error("Error fetching translations:", error);
    return [];
  }

  console.log(`Found ${translations?.length || 0} translation records`);

  // Group by shopify_handle
  const grouped = new Map<string, TranslationRecord[]>();
  for (const t of translations || []) {
    const existing = grouped.get(t.shopify_handle) || [];
    existing.push(t);
    grouped.set(t.shopify_handle, existing);
  }

  console.log(`Found ${grouped.size} unique products with translations`);

  const results: AuditResult[] = [];

  for (const [handle, records] of Array.from(grouped.entries())) {
    const uniqueSlugs = new Set(records.map(r => r.slug));
    const hasLanguageIssues = detectLanguageIssues(records);

    let issue: AuditResult["issue"] = "ok";
    let needsReEnrichment = false;

    if (records.length < ALL_LOCALES.length) {
      issue = "partial";
      needsReEnrichment = true;
    }

    if (uniqueSlugs.size <= 2) {
      issue = "wrong_language";
      needsReEnrichment = true;
    } else if (hasLanguageIssues) {
      issue = "wrong_language";
      needsReEnrichment = true;
    }

    results.push({
      shopify_handle: handle,
      issue,
      unique_slugs: uniqueSlugs.size,
      locales_count: records.length,
      sample_title: records[0]?.title || "",
      needs_re_enrichment: needsReEnrichment,
    });
  }

  return results;
}

async function findMissingProducts(): Promise<string[]> {
  console.log("\nChecking for products in Shopify without translations...");

  // Fetch all Shopify products via GraphQL
  const query = `
    query GetProducts($first: Int!, $after: String) {
      products(first: $first, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            handle
          }
        }
      }
    }
  `;

  const allHandles: string[] = [];
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
    const products = data.data?.products;

    if (!products) {
      console.error("Error fetching from Shopify:", data);
      break;
    }

    allHandles.push(...products.edges.map((e: { node: { handle: string } }) => e.node.handle));
    hasNextPage = products.pageInfo.hasNextPage;
    cursor = products.pageInfo.endCursor;
  }

  console.log(`Found ${allHandles.length} products in Shopify`);

  // Get handles that have translations
  const { data: translatedHandles } = await supabase
    .from("product_translations")
    .select("shopify_handle")
    .limit(1000);

  const translatedSet = new Set((translatedHandles || []).map(t => t.shopify_handle));

  // Find missing
  const missing = allHandles.filter(h => !translatedSet.has(h));
  console.log(`Found ${missing.length} products without any translations`);

  return missing;
}

async function main() {
  console.log("=".repeat(60));
  console.log("Translation Quality Audit");
  console.log("=".repeat(60));

  // Audit existing translations
  const auditResults = await auditTranslations();

  // Find missing products
  const missingProducts = await findMissingProducts();

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("AUDIT SUMMARY");
  console.log("=".repeat(60));

  const wrongLanguage = auditResults.filter(r => r.issue === "wrong_language");
  const partial = auditResults.filter(r => r.issue === "partial");
  const ok = auditResults.filter(r => r.issue === "ok");
  const needsWork = auditResults.filter(r => r.needs_re_enrichment);

  console.log(`\nProducts with translations: ${auditResults.length}`);
  console.log(`  - OK (properly translated): ${ok.length}`);
  console.log(`  - Wrong language: ${wrongLanguage.length}`);
  console.log(`  - Partial translations: ${partial.length}`);
  console.log(`\nProducts without translations: ${missingProducts.length}`);
  console.log(`\nTotal needing re-enrichment: ${needsWork.length + missingProducts.length}`);

  // Show sample of wrong language products
  if (wrongLanguage.length > 0) {
    console.log("\n--- Sample Wrong Language Products ---");
    wrongLanguage.slice(0, 5).forEach(r => {
      console.log(`  ${r.shopify_handle}`);
      console.log(`    Unique slugs: ${r.unique_slugs}, Sample: "${r.sample_title.slice(0, 60)}..."`);
    });
  }

  // Show sample of missing products
  if (missingProducts.length > 0) {
    console.log("\n--- Sample Missing Products ---");
    missingProducts.slice(0, 5).forEach(h => {
      console.log(`  ${h}`);
    });
  }

  // Export results for fix script
  const exportData = {
    timestamp: new Date().toISOString(),
    summary: {
      total_in_shopify: auditResults.length + missingProducts.length,
      with_translations: auditResults.length,
      properly_translated: ok.length,
      wrong_language: wrongLanguage.length,
      partial: partial.length,
      missing: missingProducts.length,
    },
    needs_re_enrichment: needsWork.map(r => r.shopify_handle),
    missing_translations: missingProducts,
  };

  // Write to file for fix script to use
  const fs = await import("fs");
  fs.writeFileSync(
    "scripts/audit-results.json",
    JSON.stringify(exportData, null, 2)
  );
  console.log("\nResults saved to scripts/audit-results.json");
}

main().catch(console.error);
