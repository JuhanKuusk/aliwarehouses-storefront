import { supabase, createServerClient } from "./client";

export interface ProductSpecifications {
  style?: string;
  material?: string;
  color?: string;
  process?: string;
  installation_type?: string;
  indoor_outdoor?: string;
}

export interface ProductTranslation {
  id: string;
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
  // Structured product details
  usage_description: string | null;
  specifications: ProductSpecifications | null;
  product_size: string | null;
  package_size: string | null;
  weight: string | null;
  package_contents: string | null;
  origin_country: string | null;
  shipping_info: string | null;
  created_at: string;
  updated_at: string;
}

export interface SlugMapping {
  id: string;
  shopify_handle: string;
  locale: string;
  localized_slug: string;
}

// Get translation by Shopify handle and locale
export async function getTranslation(handle: string, locale: string): Promise<ProductTranslation | null> {
  const { data, error } = await supabase
    .from("product_translations")
    .select("*")
    .eq("shopify_handle", handle)
    .eq("locale", locale)
    .single();

  if (error) {
    console.error("Error fetching translation:", error);
    return null;
  }

  return data;
}

// Get translation by localized slug and locale
export async function getTranslationBySlug(slug: string, locale: string): Promise<ProductTranslation | null> {
  const { data, error } = await supabase
    .from("product_translations")
    .select("*")
    .eq("slug", slug)
    .eq("locale", locale)
    .single();

  if (error) {
    console.error("Error fetching translation by slug:", error);
    return null;
  }

  return data;
}

// Get all translations for a product
export async function getProductTranslations(handle: string): Promise<ProductTranslation[]> {
  const { data, error } = await supabase
    .from("product_translations")
    .select("*")
    .eq("shopify_handle", handle);

  if (error) {
    console.error("Error fetching product translations:", error);
    return [];
  }

  return data || [];
}

// Get Shopify handle from localized slug
export async function getShopifyHandleFromSlug(slug: string, locale: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("product_slug_mappings")
    .select("shopify_handle")
    .eq("localized_slug", slug)
    .eq("locale", locale)
    .single();

  if (error) {
    return null;
  }

  return data?.shopify_handle || null;
}

// Server-side: Upsert translation
export async function upsertTranslation(translation: Omit<ProductTranslation, "id" | "created_at" | "updated_at">) {
  const serverClient = createServerClient();

  const { data, error } = await serverClient
    .from("product_translations")
    .upsert(translation, {
      onConflict: "shopify_product_id,locale",
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to upsert translation: ${error.message}`);
  }

  return data;
}

// Server-side: Upsert slug mapping
export async function upsertSlugMapping(mapping: Omit<SlugMapping, "id">) {
  const serverClient = createServerClient();

  const { data, error } = await serverClient
    .from("product_slug_mappings")
    .upsert(mapping, {
      onConflict: "shopify_handle,locale",
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to upsert slug mapping: ${error.message}`);
  }

  return data;
}

// Get all slug mappings for routing
export async function getAllSlugMappings(): Promise<SlugMapping[]> {
  const { data, error } = await supabase
    .from("product_slug_mappings")
    .select("*");

  if (error) {
    console.error("Error fetching slug mappings:", error);
    return [];
  }

  return data || [];
}

// Get translations for multiple products by handles
export async function getTranslationsForProducts(
  handles: string[],
  locale: string
): Promise<Map<string, ProductTranslation>> {
  if (handles.length === 0) return new Map();

  const { data, error } = await supabase
    .from("product_translations")
    .select("*")
    .in("shopify_handle", handles)
    .eq("locale", locale);

  if (error) {
    console.error("Error fetching translations:", error);
    return new Map();
  }

  // Create a map for O(1) lookups
  const translationsMap = new Map<string, ProductTranslation>();
  (data || []).forEach((t) => {
    translationsMap.set(t.shopify_handle, t);
  });

  return translationsMap;
}

// Get all translations for a locale (for static generation)
export async function getAllTranslationsForLocale(locale: string): Promise<ProductTranslation[]> {
  const { data, error } = await supabase
    .from("product_translations")
    .select("*")
    .eq("locale", locale);

  if (error) {
    console.error("Error fetching all translations:", error);
    return [];
  }

  return data || [];
}

// Find a slug in any locale and return the shopify_handle and target locale's slug
export async function findSlugInAnyLocale(slug: string, targetLocale: string): Promise<{
  shopifyHandle: string;
  targetSlug: string;
} | null> {
  // First, find the slug in any locale to get the shopify_handle
  const { data: anyLocale, error: anyError } = await supabase
    .from("product_translations")
    .select("shopify_handle")
    .eq("slug", slug)
    .limit(1)
    .single();

  if (anyError || !anyLocale) {
    return null;
  }

  // Now get the target locale's slug
  const { data: targetTranslation, error: targetError } = await supabase
    .from("product_translations")
    .select("slug")
    .eq("shopify_handle", anyLocale.shopify_handle)
    .eq("locale", targetLocale)
    .single();

  if (targetError || !targetTranslation) {
    return null;
  }

  return {
    shopifyHandle: anyLocale.shopify_handle,
    targetSlug: targetTranslation.slug,
  };
}
