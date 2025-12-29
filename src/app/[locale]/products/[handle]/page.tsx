import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { getProductByHandle, getProducts } from "@/lib/shopify";
import { getTranslation, getTranslationBySlug, findSlugInAnyLocale, type ProductTranslation } from "@/lib/supabase/translations";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import ProductGallery from "@/components/products/ProductGallery";
import Navbar from "@/components/layout/Navbar";
import AddToCartButton from "@/components/products/AddToCartButton";
import type { Locale } from "@/i18n/routing";
import { localizedPaths } from "@/i18n/routing";

type Props = {
  params: Promise<{ locale: string; handle: string }>;
};

// Allow dynamic params for localized slugs not pre-generated at build time
export const dynamicParams = true;

export async function generateStaticParams() {
  try {
    const products = await getProducts(100);
    return products.map((product) => ({
      handle: product.handle,
    }));
  } catch {
    return [];
  }
}

export default async function ProductPage({ params }: Props) {
  const { locale, handle: slugOrHandle } = await params;
  setRequestLocale(locale);

  // First, try to find by localized slug for current locale
  let translation = await getTranslationBySlug(slugOrHandle, locale);
  let shopifyHandle = translation?.shopify_handle;

  // If not found by slug in current locale, check if it's a slug from another locale
  if (!translation) {
    const crossLocaleResult = await findSlugInAnyLocale(slugOrHandle, locale);
    if (crossLocaleResult && crossLocaleResult.targetSlug !== slugOrHandle) {
      // Redirect to the correct localized URL
      const localizedPath = localizedPaths.products[locale as Locale] || "products";
      redirect(`/${locale}/${localizedPath}/${crossLocaleResult.targetSlug}`);
    }
  }

  // If still not found, try as Shopify handle
  if (!translation) {
    translation = await getTranslation(slugOrHandle, locale);
    shopifyHandle = slugOrHandle;

    // If found by Shopify handle and has a localized slug, redirect to localized URL
    if (translation?.slug && translation.slug !== slugOrHandle) {
      const localizedPath = localizedPaths.products[locale as Locale] || "products";
      redirect(`/${locale}/${localizedPath}/${translation.slug}`);
    }
  }

  // Fetch product from Shopify
  const product = await getProductByHandle(shopifyHandle || slugOrHandle);

  if (!product) {
    notFound();
  }

  return <ProductContent product={product} translation={translation} locale={locale as Locale} />;
}

// Specification row component
function SpecRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between py-2 border-b border-gray-100 dark:border-white/5 last:border-0">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-gray-900 dark:text-white font-medium">{value}</span>
    </div>
  );
}

// Section header component
function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white mb-4">
      {icon}
      {title}
    </h3>
  );
}

// Sanitize HTML to remove inline color/background styles that break dark mode
function sanitizeHtml(html: string): string {
  return html
    .replace(/style="[^"]*"/gi, '') // Remove all inline styles
    .replace(/color="[^"]*"/gi, '') // Remove color attributes
    .replace(/bgcolor="[^"]*"/gi, '') // Remove bgcolor attributes
    .replace(/<font[^>]*>/gi, '') // Remove font tags
    .replace(/<\/font>/gi, '');
}

function ProductContent({
  product,
  translation,
  locale,
}: {
  product: NonNullable<Awaited<ReturnType<typeof getProductByHandle>>>;
  translation: ProductTranslation | null;
  locale: Locale;
}) {
  const t = useTranslations();

  // Use translated content if available, fallback to Shopify content
  const title = translation?.title || product.title;
  const description = translation?.description || product.description;
  const descriptionHtml = translation?.description || product.descriptionHtml || product.description;
  const headline = translation?.headline;

  // Structured product details
  const specs = translation?.specifications;
  const hasSpecs = specs && Object.keys(specs).length > 0;
  const hasDimensions = translation?.product_size || translation?.package_size || translation?.weight;
  const hasPackageInfo = translation?.package_contents || translation?.origin_country;

  const images = product.images?.edges?.map((edge) => edge.node) || [];
  const variants = product.variants?.edges?.map((edge) => edge.node) || [];
  const firstVariant = variants[0];
  const hasDiscount = firstVariant?.compareAtPrice &&
    parseFloat(firstVariant.compareAtPrice.amount) > parseFloat(firstVariant.price.amount);
  const discountPercent = hasDiscount
    ? Math.round(
        (1 - parseFloat(firstVariant.price.amount) / parseFloat(firstVariant.compareAtPrice!.amount)) * 100
      )
    : 0;

  return (
    <main className="min-h-screen bg-white dark:bg-black transition-colors">
      <Navbar locale={locale} />

      {/* Breadcrumb */}
      <div className="mx-auto max-w-7xl px-6 py-4 lg:px-8">
        <nav className="flex text-sm text-gray-600 dark:text-gray-400">
          <Link href="/" className="hover:text-gray-900 dark:hover:text-white">
            {t("nav.home")}
          </Link>
          <span className="mx-2">/</span>
          <Link href="/products" className="hover:text-gray-900 dark:hover:text-white">
            {t("nav.products")}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900 dark:text-white truncate max-w-[200px]">{title}</span>
        </nav>
      </div>

      {/* Product */}
      <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2">
          {/* Images */}
          <ProductGallery images={images} title={title} />

          {/* Info */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{title}</h1>
            {headline && (
              <p className="mt-2 text-lg text-purple-600 dark:text-purple-400 font-medium">{headline}</p>
            )}

            <div className="mt-4 flex items-center gap-4">
              <span className="text-3xl font-bold text-gray-900 dark:text-white">
                €{parseFloat(firstVariant?.price.amount || "0").toFixed(2)}
              </span>
              {hasDiscount && firstVariant?.compareAtPrice && (
                <>
                  <span className="text-xl text-gray-500 line-through">
                    €{parseFloat(firstVariant.compareAtPrice.amount).toFixed(2)}
                  </span>
                  <span className="rounded-full bg-red-500 px-3 py-1 text-sm font-bold text-white">
                    -{discountPercent}%
                  </span>
                </>
              )}
            </div>

            <div className="mt-4 flex items-center gap-2">
              {product.availableForSale ? (
                <>
                  <span className="inline-flex h-2 w-2 rounded-full bg-green-400" />
                  <span className="text-sm text-green-400">{t("product.inStock")}</span>
                </>
              ) : (
                <>
                  <span className="inline-flex h-2 w-2 rounded-full bg-red-400" />
                  <span className="text-sm text-red-400">{t("product.outOfStock")}</span>
                </>
              )}
            </div>

            <div className="mt-6 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <svg className="h-5 w-5 text-purple-500 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {t("product.shipsFrom")}
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <svg className="h-5 w-5 text-purple-500 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {t("product.freeShipping")}
            </div>

            {/* Variants */}
            {product.options && product.options.length > 0 && product.options[0]?.values && product.options[0].values.length > 1 && (
              <div className="mt-8">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white">{product.options[0].name}</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {product.options[0].values.map((value) => (
                    <button
                      key={value}
                      className="rounded-lg border border-gray-300 dark:border-white/20 px-4 py-2 text-sm text-gray-900 dark:text-white hover:border-purple-500 transition-colors"
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Add to Cart */}
            <div className="mt-8">
              <AddToCartButton
                variantId={firstVariant?.id || ""}
                availableForSale={product.availableForSale && !!firstVariant}
              />
            </div>

            {/* Shipping Info */}
            {translation?.shipping_info && (
              <div className="mt-8 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🇪🇺</span>
                  <div>
                    <p className="font-medium text-blue-900 dark:text-blue-100">{translation.shipping_info}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Usage/Application */}
            {translation?.usage_description && (
              <div className="mt-8 border-t border-gray-200 dark:border-white/10 pt-8">
                <SectionHeader
                  icon={
                    <svg className="h-5 w-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  }
                  title={t("product.usage")}
                />
                <p className="text-gray-600 dark:text-gray-400">{translation.usage_description}</p>
              </div>
            )}

            {/* Specifications */}
            {hasSpecs && (
              <div className="mt-8 border-t border-gray-200 dark:border-white/10 pt-8">
                <SectionHeader
                  icon={
                    <svg className="h-5 w-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                  }
                  title={t("product.specifications")}
                />
                <div className="rounded-lg bg-gray-50 dark:bg-white/5 p-4">
                  {Object.entries(specs).map(([key, value]) => (
                    <SpecRow
                      key={key}
                      label={key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                      value={value as string}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Dimensions */}
            {hasDimensions && (
              <div className="mt-8 border-t border-gray-200 dark:border-white/10 pt-8">
                <SectionHeader
                  icon={
                    <svg className="h-5 w-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                  }
                  title={t("product.dimensions")}
                />
                <div className="rounded-lg bg-gray-50 dark:bg-white/5 p-4">
                  <SpecRow label={t("product.productSize")} value={translation?.product_size} />
                  <SpecRow label={t("product.packageSize")} value={translation?.package_size} />
                  <SpecRow label={t("product.weight")} value={translation?.weight} />
                </div>
              </div>
            )}

            {/* Package Info */}
            {hasPackageInfo && (
              <div className="mt-8 border-t border-gray-200 dark:border-white/10 pt-8">
                <SectionHeader
                  icon={
                    <svg className="h-5 w-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  }
                  title={t("product.packageInfo")}
                />
                <div className="rounded-lg bg-gray-50 dark:bg-white/5 p-4">
                  <SpecRow label={t("product.packageContents")} value={translation?.package_contents} />
                  <SpecRow label={t("product.originCountry")} value={translation?.origin_country} />
                </div>
              </div>
            )}

            {/* Description */}
            {description && (
              <div className="mt-8 border-t border-gray-200 dark:border-white/10 pt-8">
                <SectionHeader
                  icon={
                    <svg className="h-5 w-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                    </svg>
                  }
                  title={t("product.description")}
                />
                <div
                  className="prose prose-sm dark:prose-invert max-w-none text-gray-600 dark:text-gray-400 whitespace-pre-line"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(descriptionHtml) }}
                />
              </div>
            )}

            {/* Tags */}
            {product.tags && product.tags.length > 0 && (
              <div className="mt-8 flex flex-wrap gap-2">
                {product.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-gray-100 dark:bg-white/5 px-3 py-1 text-xs text-gray-600 dark:text-gray-400"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
