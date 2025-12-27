/**
 * Check translation status in database
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

async function check() {
  // Check aliexpress_products
  const { data: products, error } = await supabase
    .from("aliexpress_products")
    .select("id, title, images, localized_titles, localized_slugs, shopify_product_id")
    .not("shopify_product_id", "is", null);

  if (error) {
    console.error("Products error:", error);
    return;
  }

  const missing_images = products.filter(
    (p) => !p.images || p.images.length === 0
  ).length;
  const has_et_title = products.filter((p) => p.localized_titles?.et).length;
  const has_et_slug = products.filter((p) => p.localized_slugs?.et).length;

  console.log("=== aliexpress_products table ===");
  console.log("Total synced products:", products.length);
  console.log("Missing images:", missing_images);
  console.log("Has Estonian title (localized_titles->et):", has_et_title);
  console.log("Has Estonian slug (localized_slugs->et):", has_et_slug);

  // Check product_translations table
  const { data: translations, error: tErr } = await supabase
    .from("product_translations")
    .select("locale, shopify_product_id")
    .eq("locale", "et");

  if (!tErr) {
    console.log("\n=== product_translations table ===");
    console.log("Estonian translations:", translations?.length || 0);
  }

  // Show products missing translations
  const missing_et = products.filter((p) => !p.localized_titles?.et).slice(0, 5);
  console.log("\nSample products missing Estonian title:");
  missing_et.forEach((p) => console.log("  -", p.title?.slice(0, 50)));

  // Show products missing images
  const no_images = products.filter((p) => !p.images || p.images.length === 0).slice(0, 5);
  console.log("\nSample products missing images:");
  no_images.forEach((p) => console.log("  -", p.title?.slice(0, 50)));
}

check();
