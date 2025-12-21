import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { getCollections, ShopifyCollection } from "@/lib/shopify";
import Link from "next/link";
import Image from "next/image";
import Navbar from "@/components/layout/Navbar";
import type { Locale } from "@/i18n/routing";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function CollectionsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  let collections: ShopifyCollection[] = [];

  try {
    collections = await getCollections();
  } catch (error) {
    console.error("Failed to fetch collections:", error);
  }

  return <CollectionsContent collections={collections} locale={locale as Locale} />;
}

function CollectionsContent({
  collections,
  locale,
}: {
  collections: ShopifyCollection[];
  locale: Locale;
}) {
  const t = useTranslations();

  // Category icons mapping
  const categoryIcons: Record<string, string> = {
    "home-decor": "🏠",
    "lighting": "💡",
    "furniture": "🪑",
    "garden": "🌿",
    "beauty": "✨",
    "beauty-equipment": "💄",
    "solar-energy": "☀️",
    "wall-art": "🖼️",
    "outdoor": "🏡",
    "electronics": "📱",
  };

  return (
    <main className="min-h-screen bg-white dark:bg-black transition-colors">
      <Navbar locale={locale} />

      {/* Header */}
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
            {t("nav.collections")}
          </h1>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
            {t("home.categories.subtitle")}
          </p>
        </div>

        {/* Collections Grid */}
        {collections.length > 0 ? (
          <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {collections.map((collection) => {
              const icon = categoryIcons[collection.handle] || "📦";

              return (
                <Link
                  key={collection.id}
                  href={`/collections/${collection.handle}`}
                  className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 border border-gray-200 dark:border-white/10 hover:border-purple-500/50 transition-all duration-300"
                >
                  {/* Collection Image */}
                  <div className="aspect-[4/3] relative overflow-hidden">
                    {collection.image ? (
                      <Image
                        src={collection.image.url}
                        alt={collection.image.altText || collection.title}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-110"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30">
                        <span className="text-6xl">{icon}</span>
                      </div>
                    )}

                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

                    {/* Content Overlay */}
                    <div className="absolute bottom-0 left-0 right-0 p-6">
                      <h2 className="text-2xl font-bold text-white group-hover:text-purple-300 transition-colors">
                        {collection.title}
                      </h2>
                      {collection.description && (
                        <p className="mt-2 text-sm text-gray-200 line-clamp-2">
                          {collection.description}
                        </p>
                      )}

                      {/* Product count badge */}
                      {collection.products?.edges?.length > 0 && (
                        <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/20 backdrop-blur-sm px-3 py-1 text-xs text-white">
                          <span>{collection.products.edges.length}</span>
                          <span>{t("nav.products").toLowerCase()}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Hover Arrow */}
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="rounded-full bg-white/90 dark:bg-black/90 p-2">
                      <svg className="h-5 w-5 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="mt-12 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-gray-900/50 p-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
              <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <p className="text-gray-600 dark:text-gray-400">
              No collections available. Create collections in your Shopify admin.
            </p>
          </div>
        )}
      </div>

      {/* Browse All Products CTA */}
      <div className="mx-auto max-w-7xl px-6 pb-16 lg:px-8">
        <div className="rounded-2xl bg-gradient-to-r from-purple-600 to-blue-600 p-8 text-center">
          <h3 className="text-2xl font-bold text-white">
            {t("common.viewAll")} {t("nav.products")}
          </h3>
          <p className="mt-2 text-purple-100">
            {t("common.tagline")}
          </p>
          <Link
            href="/products"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-purple-600 shadow-lg hover:bg-gray-100 transition-colors"
          >
            {t("home.hero.cta")}
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </div>
      </div>
    </main>
  );
}
