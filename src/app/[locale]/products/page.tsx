import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { getProducts, ShopifyProduct } from "@/lib/shopify";
import { getTranslationsForProducts, type ProductTranslation } from "@/lib/supabase/translations";
import Link from "next/link";
import Image from "next/image";
import Navbar from "@/components/layout/Navbar";
import type { Locale } from "@/i18n/routing";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function ProductsPage({ params }: Props) {
  const { locale } = await params;
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

  return <ProductsContent products={products} translationsMap={translationsMap} locale={locale as Locale} />;
}

function ProductsContent({
  products,
  translationsMap,
  locale,
}: {
  products: Awaited<ReturnType<typeof getProducts>>;
  translationsMap: Map<string, ProductTranslation>;
  locale: Locale;
}) {
  const t = useTranslations();

  return (
    <main className="min-h-screen bg-white dark:bg-black transition-colors">
      <Navbar locale={locale} />

      {/* Content */}
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t("nav.products")}</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">{t("common.tagline")}</p>

        {products.length > 0 ? (
          <div className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
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
          <div className="mt-8 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-gray-900/50 p-12 text-center">
            <p className="text-gray-600 dark:text-gray-400">
              No products available. Configure your Shopify Storefront API token.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
