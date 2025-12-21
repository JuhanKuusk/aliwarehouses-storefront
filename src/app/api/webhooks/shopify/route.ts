import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// Supabase client with service role
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// DeepL translation
async function translateText(text: string, targetLang: string, sourceLang = "DE"): Promise<string> {
  const params = new URLSearchParams({ text, target_lang: targetLang, source_lang: sourceLang });

  const response = await fetch("https://api.deepl.com/v2/translate", {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`DeepL error: ${response.status}`);
  }

  const data = await response.json();
  return data.translations[0].text;
}

// Translate to all languages
async function translateToAllLanguages(text: string): Promise<Record<string, string>> {
  const langs = [
    { code: "EN", locale: "en" },
    { code: "DE", locale: "de" },
    { code: "ET", locale: "et" },
    { code: "FR", locale: "fr" },
    { code: "RU", locale: "ru" },
    { code: "PT-PT", locale: "pt" },
  ];

  const results: Record<string, string> = {};

  await Promise.all(
    langs.map(async ({ code, locale }) => {
      if (code === "DE") {
        results[locale] = text; // Original is German
      } else {
        results[locale] = await translateText(text, code);
      }
    })
  );

  return results;
}

// Verify Shopify webhook signature
function verifyWebhook(body: string, hmacHeader: string): boolean {
  const secret = process.env.SHOPIFY_REVALIDATION_SECRET;
  if (!secret) return true; // Skip verification if no secret set

  const hash = crypto
    .createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("base64");

  return hash === hmacHeader;
}

interface ShopifyProductWebhook {
  id: number;
  handle: string;
  title: string;
  body_html: string | null;
  images: Array<{ src: string }>;
}

const LOCALES = ["en", "de", "et", "fr", "ru", "pt"];

export async function POST(request: NextRequest) {
  const body = await request.text();
  const hmac = request.headers.get("X-Shopify-Hmac-Sha256") || "";
  const topic = request.headers.get("X-Shopify-Topic");

  // Verify signature
  if (!verifyWebhook(body, hmac)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const product: ShopifyProductWebhook = JSON.parse(body);

  console.log(`📦 Webhook received: ${topic} - ${product.title} (${product.handle})`);

  try {
    if (topic === "products/delete") {
      // Remove translations for deleted product
      await supabase
        .from("product_translations")
        .delete()
        .eq("shopify_product_id", product.id.toString());

      await supabase
        .from("product_slug_mappings")
        .delete()
        .eq("shopify_handle", product.handle);

      console.log(`🗑️ Deleted translations for ${product.handle}`);
      return NextResponse.json({ success: true, action: "deleted" });
    }

    // For create/update, translate the product
    const [titles, descriptions] = await Promise.all([
      translateToAllLanguages(product.title),
      product.body_html
        ? translateToAllLanguages(product.body_html.replace(/<[^>]*>/g, "")) // Strip HTML
        : Promise.resolve({} as Record<string, string>),
    ]);

    // Save translations for each locale
    for (const locale of LOCALES) {
      const title = titles[locale] || product.title;
      const description = descriptions[locale] || "";

      // Generate slug
      const slug = title
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .substring(0, 50);

      await supabase.from("product_translations").upsert(
        {
          shopify_product_id: product.id.toString(),
          shopify_handle: product.handle,
          locale,
          title,
          headline: null,
          description,
          description_enhanced: null,
          seo_title: title.substring(0, 60),
          seo_description: description.substring(0, 160),
          slug,
          original_title: product.title,
          translation_source: "deepl",
          image_analyzed: false,
        },
        { onConflict: "shopify_product_id,locale" }
      );

      await supabase.from("product_slug_mappings").upsert(
        {
          shopify_handle: product.handle,
          locale,
          localized_slug: slug,
        },
        { onConflict: "shopify_handle,locale" }
      );
    }

    console.log(`✅ Translated ${product.handle} to ${LOCALES.length} languages`);
    return NextResponse.json({ success: true, action: topic, locales: LOCALES });
  } catch (error) {
    console.error("❌ Webhook error:", error);
    return NextResponse.json(
      { error: "Translation failed", details: String(error) },
      { status: 500 }
    );
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: "ok",
    webhook: "shopify-products",
    endpoints: [
      "products/create - Translate new product",
      "products/update - Re-translate product",
      "products/delete - Remove translations",
    ],
  });
}
