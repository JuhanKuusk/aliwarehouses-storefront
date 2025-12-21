import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { getProducts, getCollections, ShopifyProduct, ShopifyCollection } from "@/lib/shopify";
import { getTranslationsForProducts, type ProductTranslation } from "@/lib/supabase/translations";
import Link from "next/link";
import Image from "next/image";
import { HeroParallax } from "@/components/ui/hero-parallax";
import { InfiniteMovingCards } from "@/components/ui/infinite-moving-cards";
import { Spotlight } from "@/components/ui/spotlight";
import Navbar from "@/components/layout/Navbar";
import type { Locale } from "@/i18n/routing";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Fetch products and collections from Shopify
  let products: ShopifyProduct[] = [];
  let collections: ShopifyCollection[] = [];
  let translationsMap = new Map<string, ProductTranslation>();

  try {
    [products, collections] = await Promise.all([
      getProducts(15), // Get 15 for hero parallax
      getCollections(),
    ]);
    // Fetch translations for all products
    const handles = products.map((p) => p.handle);
    translationsMap = await getTranslationsForProducts(handles, locale);
  } catch (error) {
    console.error("Failed to fetch from Shopify:", error);
  }

  return <HomeContent products={products} collections={collections} translationsMap={translationsMap} locale={locale as Locale} />;
}

function HomeContent({
  products,
  collections,
  translationsMap,
  locale,
}: {
  products: ShopifyProduct[];
  collections: ShopifyCollection[];
  translationsMap: Map<string, ProductTranslation>;
  locale: Locale;
}) {
  const t = useTranslations();

  // Helper to get translated title
  const getTitle = (product: ShopifyProduct) =>
    translationsMap.get(product.handle)?.title || product.title;

  // Transform products for Hero Parallax format
  const heroProducts = products.map((product) => ({
    title: getTitle(product),
    link: `/products/${product.handle}`,
    thumbnail: product.featuredImage?.url || "/placeholder.jpg",
  }));

  return (
    <main className="min-h-screen bg-white dark:bg-black transition-colors">
      <Navbar locale={locale} />

      {/* Hero Parallax Section */}
      {products.length >= 5 ? (
        <HeroParallax
          products={heroProducts}
          title={t("home.hero.title")}
          subtitle={t("home.hero.subtitle")}
          ctaText={t("home.hero.cta")}
          ctaLink="/products"
        />
      ) : (
        /* Fallback Hero Section with Spotlight for few products */
        <section className="relative overflow-hidden min-h-[60vh] flex items-center">
          <Spotlight
            className="-top-40 left-0 md:left-60 md:-top-20"
            fill="white"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-purple-100/50 via-white to-blue-100/50 dark:from-purple-900/20 dark:via-black dark:to-blue-900/20" />
          <div className="relative mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-6xl">
                {t("home.hero.title")}
                <br />
                <span className="bg-gradient-to-r from-purple-500 to-blue-500 dark:from-purple-400 dark:to-blue-400 bg-clip-text text-transparent">
                  Fast EU Delivery
                </span>
              </h1>
              <p className="mt-6 text-lg leading-8 text-gray-600 dark:text-gray-300">
                {t("home.hero.subtitle")}
              </p>
              <div className="mt-10 flex items-center justify-center gap-x-6">
                <Link
                  href="/products"
                  className="rounded-full bg-gray-900 dark:bg-white px-8 py-3 text-sm font-semibold text-white dark:text-black shadow-sm hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
                >
                  {t("home.hero.cta")}
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Benefits Section */}
      <section className="border-t border-gray-200 dark:border-white/10 py-16 bg-gray-50 dark:bg-black">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-500/10">
                <svg className="h-6 w-6 text-purple-500 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t("home.benefits.shipping.title")}</h3>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{t("home.benefits.shipping.description")}</p>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-500/10">
                <svg className="h-6 w-6 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t("home.benefits.quality.title")}</h3>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{t("home.benefits.quality.description")}</p>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-500/10">
                <svg className="h-6 w-6 text-green-500 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t("home.benefits.support.title")}</h3>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{t("home.benefits.support.description")}</p>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-500/10">
                <svg className="h-6 w-6 text-orange-500 dark:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t("home.benefits.returns.title")}</h3>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{t("home.benefits.returns.description")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Products - Infinite Moving Cards */}
      {products.length > 0 && (
        <section className="py-16 bg-white dark:bg-black overflow-hidden">
          <div className="mx-auto max-w-7xl px-6 lg:px-8 mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t("home.featured.title")}</h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{t("home.featured.subtitle")}</p>
              </div>
              <Link
                href="/products"
                className="text-sm font-medium text-purple-600 dark:text-purple-400 hover:text-purple-500 dark:hover:text-purple-300"
              >
                {t("common.viewAll")} →
              </Link>
            </div>
          </div>
          <InfiniteMovingCards
            items={products.map((product) => {
              const price = parseFloat(product.priceRange.minVariantPrice.amount);
              const compareAtPrice = product.variants.edges[0]?.node.compareAtPrice?.amount;
              return {
                title: getTitle(product),
                image: product.featuredImage?.url || "/placeholder.jpg",
                price: `€${price.toFixed(2)}`,
                compareAtPrice: compareAtPrice ? `€${parseFloat(compareAtPrice).toFixed(2)}` : undefined,
                link: `/products/${product.handle}`,
              };
            })}
            direction="left"
            speed="slow"
            pauseOnHover={true}
          />
        </section>
      )}

      {/* Featured Products Grid Section */}
      <section className="py-16 bg-white dark:bg-black">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          {products.length > 0 ? (
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
              {products.slice(0, 8).map((product) => {
                const price = parseFloat(product.priceRange.minVariantPrice.amount);
                const compareAtPrice = product.variants.edges[0]?.node.compareAtPrice?.amount;
                const hasDiscount = compareAtPrice && parseFloat(compareAtPrice) > price;
                const title = getTitle(product);

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
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-gray-900/50 p-12 text-center">
              <p className="text-gray-600 dark:text-gray-400">
                No products available yet. Configure your Shopify Storefront API token to display products.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Categories Section */}
      {collections.length > 0 && (
        <section className="py-16 border-t border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-black">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t("home.categories.title")}</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{t("home.categories.subtitle")}</p>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {collections.slice(0, 8).map((collection) => (
                <Link
                  key={collection.id}
                  href={`/collections/${collection.handle}`}
                  className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-purple-100/50 to-blue-100/50 dark:from-purple-900/30 dark:to-blue-900/30 p-6 border border-gray-200 dark:border-white/10 hover:border-purple-500/50 transition-all"
                >
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                    {collection.title}
                  </h3>
                  {collection.description && (
                    <p className="mt-1 text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                      {collection.description}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-white/10 py-12 bg-white dark:bg-black">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-sm text-gray-600 dark:text-gray-400">{t("footer.copyright")}</p>
            <div className="flex gap-6">
              <Link href="#" className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                {t("footer.about")}
              </Link>
              <Link href="#" className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                {t("footer.contact")}
              </Link>
              <Link href="#" className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                {t("footer.terms")}
              </Link>
              <Link href="#" className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                {t("footer.privacy")}
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
