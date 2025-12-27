import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { getProducts, ShopifyProduct } from "@/lib/shopify";
import { getTranslationsForProducts, type ProductTranslation } from "@/lib/supabase/translations";
import Navbar from "@/components/layout/Navbar";
import ProductFilters from "@/components/products/ProductFilters";
import CategoryTiles from "@/components/products/CategoryTiles";
import ProductCard from "@/components/products/ProductCard";
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
    search: (resolvedSearchParams.search as string) || "",
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
      selectedCategory={filters.category}
    />
  );
}

function ProductsContent({
  products,
  translationsMap,
  locale,
  categories,
  totalCount,
  selectedCategory,
}: {
  products: Awaited<ReturnType<typeof getProducts>>;
  translationsMap: Map<string, ProductTranslation>;
  locale: Locale;
  categories: string[];
  totalCount: number;
  selectedCategory: string;
}) {
  const t = useTranslations();

  return (
    <main className="min-h-screen bg-white dark:bg-black transition-colors">
      <Navbar locale={locale} />

      {/* Content */}
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t("nav.products")}</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">{t("common.tagline")}</p>

        {/* Category Tiles */}
        <div className="mt-8">
          <CategoryTiles categories={categories} selectedCategory={selectedCategory} />
        </div>

        <div className="lg:grid lg:grid-cols-4 lg:gap-8">
          {/* Filters Sidebar */}
          <div className="lg:col-span-1">
            <ProductFilters categories={categories} productCount={totalCount} />
          </div>

          {/* Products Grid */}
          <div className="lg:col-span-3">
            {products.length > 0 ? (
              <div className="grid grid-cols-2 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {products.map((product) => {
                  const translation = translationsMap.get(product.handle);
                  return (
                    <ProductCard
                      key={product.id}
                      product={product}
                      translation={translation}
                    />
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
