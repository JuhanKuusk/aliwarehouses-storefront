import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { getProducts, ShopifyProduct } from "@/lib/shopify";
import { getTranslationsForProducts, type ProductTranslation } from "@/lib/supabase/translations";
import Link from "next/link";
import Image from "next/image";
import Navbar from "@/components/layout/Navbar";
import ProductFilters from "@/components/products/ProductFilters";
import { applyFilters, type FilterState, type SortOption } from "@/lib/utils/filters";
import type { Locale } from "@/i18n/routing";

// Force dynamic rendering to always fetch fresh products
export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function ProductsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const resolvedSearchParams = await searchParams;
  setRequestLocale(locale);

  let products: ShopifyProduct[] = [];
  let translationsMap = new Map<string, ProductTranslation>();

  try {
    products = await getProducts(50);
    // Fetch translations for all products in one query
    const handles = products.map((p) => p.handle);
    translationsMap = await getTranslationsForProducts(handles, locale);
  } catch (error) {
    console.error("Failed to fetch products:", error);
  }

  // Parse filter params
  const filters: FilterState = {
    minPrice: (resolvedSearchParams.minPrice as string) || "",
    maxPrice: (resolvedSearchParams.maxPrice as string) || "",
    inStockOnly: resolvedSearchParams.inStock === "true",
    sort: ((resolvedSearchParams.sort as string) || "featured") as SortOption,
    category: (resolvedSearchParams.category as string) || "",
  };

  // Apply filters server-side
  const filteredProducts = applyFilters(products, filters);

  // Extract unique categories from product tags
  const categories = [...new Set(products.flatMap((p) => p.tags || []))].filter(Boolean);

  return (
    <ProductsContent
      products={filteredProducts}
      translationsMap={translationsMap}
      locale={locale as Locale}
      categories={categories}
      totalCount={filteredProducts.length}
    />
  );
}

function ProductsContent({
  products,
  translationsMap,
  locale,
  categories,
  totalCount,
}: {
  products: Awaited<ReturnType<typeof getProducts>>;
  translationsMap: Map<string, ProductTranslation>;
  locale: Locale;
  categories: string[];
  totalCount: number;
}) {
  const t = useTranslations();

  return (
    <main className="min-h-screen bg-white dark:bg-black transition-colors">
      <Navbar locale={locale} />

      {/* Content */}
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t("nav.products")}</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">{t("common.tagline")}</p>

        <div className="mt-8 lg:grid lg:grid-cols-4 lg:gap-8">
          {/* Filters Sidebar */}
          <div className="lg:col-span-1">
            <ProductFilters categories={categories} productCount={totalCount} />
          </div>

          {/* Products Grid */}
          <div className="lg:col-span-3">
            {products.length > 0 ? (
              <div className="grid grid-cols-2 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {products.map((product) => {
                  const price = parseFloat(product.priceRange.minVariantPrice.amount);
                  const compareAtPrice = product.variants.edges[0]?.node.compareAtPrice?.amount;
                  const hasDiscount = compareAtPrice && parseFloat(compareAtPrice) > price;

                  // Get translation if available
                  const translation = translationsMap.get(product.handle);
                  const title = translation?.title || product.title;

                  return (
                    <Link
                      key={product.id}
                      href={`/products/${product.handle}`}
                      className="group"
                    >
                      <div className="aspect-square overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-white/10 transition-all group-hover:border-purple-500/50 relative">
                        {hasDiscount && (
                          <div className="absolute top-2 left-2 z-10 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                            -{Math.round((1 - price / parseFloat(compareAtPrice!)) * 100)}%
                          </div>
                        )}
                        {product.featuredImage ? (
                          <Image
                            src={product.featuredImage.url}
                            alt={product.featuredImage.altText || title}
                            fill
                            className="object-cover transition-transform group-hover:scale-105"
                            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-gray-400 dark:text-gray-600">
                            No image
                          </div>
                        )}
                      </div>
                      <div className="mt-3">
                        <h3 className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                          {title}
                        </h3>
                        {translation?.headline && (
                          <p className="mt-0.5 text-xs text-purple-600 dark:text-purple-400 line-clamp-1">
                            {translation.headline}
                          </p>
                        )}
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-sm font-bold text-gray-900 dark:text-white">
                            €{price.toFixed(2)}
                          </span>
                          {hasDiscount && (
                            <span className="text-xs text-gray-500 line-through">
                              €{parseFloat(compareAtPrice!).toFixed(2)}
                            </span>
                          )}
                        </div>
                        {product.availableForSale ? (
                          <p className="mt-1 text-xs text-green-600 dark:text-green-400">{t("product.inStock")}</p>
                        ) : (
                          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{t("product.outOfStock")}</p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-gray-900/50 p-12 text-center">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="mt-4 text-gray-600 dark:text-gray-400">
                  {t("filters.noResults")}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
