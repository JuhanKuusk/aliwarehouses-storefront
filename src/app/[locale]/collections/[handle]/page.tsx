import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { getCollectionProducts, getCollections, ShopifyProduct, ShopifyCollection } from "@/lib/shopify";
import { getTranslationsForProducts, type ProductTranslation } from "@/lib/supabase/translations";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import Navbar from "@/components/layout/Navbar";
import type { Locale } from "@/i18n/routing";

type Props = {
  params: Promise<{ locale: string; handle: string }>;
};

export async function generateStaticParams() {
  try {
    const collections = await getCollections();
    return collections.map((collection) => ({
      handle: collection.handle,
    }));
  } catch {
    return [];
  }
}

export default async function CollectionPage({ params }: Props) {
  const { locale, handle } = await params;
  setRequestLocale(locale);

  const { collection, products } = await getCollectionProducts(handle, 50);

  if (!collection) {
    notFound();
  }

  // Fetch translations for products
  const handles = products.map((p) => p.handle);
  const translationsMap = await getTranslationsForProducts(handles, locale);

  return (
    <CollectionContent
      collection={collection}
      products={products}
      translationsMap={translationsMap}
      locale={locale as Locale}
    />
  );
}

function CollectionContent({
  collection,
  products,
  translationsMap,
  locale,
}: {
  collection: ShopifyCollection;
  products: ShopifyProduct[];
  translationsMap: Map<string, ProductTranslation>;
  locale: Locale;
}) {
  const t = useTranslations();

  return (
    <main className="min-h-screen bg-white dark:bg-black transition-colors">
      <Navbar locale={locale} />

      {/* Collection Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-purple-100 via-white to-blue-100 dark:from-purple-900/20 dark:via-black dark:to-blue-900/20">
        {collection.image && (
          <div className="absolute inset-0">
            <Image
              src={collection.image.url}
              alt={collection.image.altText || collection.title}
              fill
              className="object-cover opacity-20"
              priority
            />
          </div>
        )}
        <div className="relative mx-auto max-w-7xl px-6 py-16 lg:px-8 lg:py-24">
          {/* Breadcrumb */}
          <nav className="mb-6 flex text-sm text-gray-600 dark:text-gray-400">
            <Link href="/" className="hover:text-gray-900 dark:hover:text-white">
              {t("nav.home")}
            </Link>
            <span className="mx-2">/</span>
            <Link href="/collections" className="hover:text-gray-900 dark:hover:text-white">
              {t("nav.collections")}
            </Link>
            <span className="mx-2">/</span>
            <span className="text-gray-900 dark:text-white">{collection.title}</span>
          </nav>

          <h1 className="text-4xl font-bold text-gray-900 dark:text-white lg:text-5xl">
            {collection.title}
          </h1>
          {collection.description && (
            <p className="mt-4 max-w-2xl text-lg text-gray-600 dark:text-gray-400">
              {collection.description}
            </p>
          )}
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-500">
            <span className="inline-flex h-2 w-2 rounded-full bg-purple-500" />
            {products.length} {t("nav.products").toLowerCase()}
          </div>
        </div>
      </div>

      {/* Products Grid */}
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
        {products.length > 0 ? (
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((product) => {
              const price = parseFloat(product.priceRange.minVariantPrice.amount);
              const compareAtPrice = product.variants.edges[0]?.node.compareAtPrice?.amount;
              const hasDiscount = compareAtPrice && parseFloat(compareAtPrice) > price;
              const discountPercent = hasDiscount
                ? Math.round((1 - price / parseFloat(compareAtPrice!)) * 100)
                : 0;

              // Get translation if available
              const translation = translationsMap.get(product.handle);
              const title = translation?.title || product.title;
              const headline = translation?.headline;

              return (
                <Link
                  key={product.id}
                  href={`/products/${product.handle}`}
                  className="group"
                >
                  <div className="aspect-square overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-white/10 transition-all group-hover:border-purple-500/50 relative">
                    {/* Discount Badge */}
                    {hasDiscount && (
                      <div className="absolute top-2 left-2 z-10 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                        -{discountPercent}%
                      </div>
                    )}

                    {/* EU Badge */}
                    {product.tags.includes("EU-Warehouse") && (
                      <div className="absolute top-2 right-2 z-10 bg-purple-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                        EU
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
                        <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}

                    {/* Quick View Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black shadow-lg">
                        {t("common.viewAll")}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                      {title}
                    </h3>
                    {headline && (
                      <p className="mt-0.5 text-xs text-purple-600 dark:text-purple-400 line-clamp-1">
                        {headline}
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
            <p className="text-gray-600 dark:text-gray-400">
              No products in this collection yet.
            </p>
            <Link
              href="/products"
              className="mt-4 inline-flex items-center gap-2 text-purple-600 dark:text-purple-400 hover:text-purple-500"
            >
              {t("common.viewAll")} {t("nav.products").toLowerCase()}
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
