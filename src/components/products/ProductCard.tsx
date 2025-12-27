"use client";

import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { useTranslations } from "next-intl";
import type { ShopifyProduct } from "@/lib/shopify";
import type { ProductTranslation } from "@/lib/supabase/translations";
import { cn } from "@/lib/utils";
import { CardContainer, CardBody, CardItem } from "@/components/ui/3d-card";

interface ProductCardProps {
  product: ShopifyProduct;
  translation?: ProductTranslation | null;
  className?: string;
  use3D?: boolean;
}

export default function ProductCard({ product, translation, className, use3D = false }: ProductCardProps) {
  const t = useTranslations();

  // Use translation if available
  const title = translation?.title || product.title;
  const headline = translation?.headline;
  const usageDescription = translation?.usage_description;

  // Use localized slug if available, otherwise fallback to Shopify handle
  const productSlug = translation?.slug || product.handle;

  const price = parseFloat(product.priceRange.minVariantPrice.amount).toFixed(2);
  const comparePrice = product.variants.edges[0]?.node.compareAtPrice
    ? parseFloat(product.variants.edges[0].node.compareAtPrice.amount).toFixed(2)
    : null;

  const hasDiscount = comparePrice && parseFloat(comparePrice) > parseFloat(price);
  const discountPercent = hasDiscount
    ? Math.round((1 - parseFloat(price) / parseFloat(comparePrice)) * 100)
    : 0;

  const isEuWarehouse = product.tags.includes("EU-Warehouse");

  // Simple card without 3D effect
  const SimpleCard = () => (
    <Link href={{ pathname: "/products/[handle]", params: { handle: productSlug }}} className={cn("group block", className)}>
      {/* Image Container */}
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-white/10 transition-all group-hover:border-purple-500/50">
        {/* Discount Badge */}
        {hasDiscount && (
          <div className="absolute left-2 top-2 z-10 rounded-full bg-red-500 px-2 py-1 text-xs font-semibold text-white">
            -{discountPercent}%
          </div>
        )}

        {/* EU Badge */}
        {isEuWarehouse && (
          <div className="absolute right-2 top-2 z-10 rounded-full bg-purple-500 px-2 py-1 text-xs font-semibold text-white">
            EU
          </div>
        )}

        {/* Image */}
        {product.featuredImage ? (
          <Image
            src={product.featuredImage.url}
            alt={product.featuredImage.altText || title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-400 dark:text-gray-600">
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
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

      {/* Info */}
      <div className="mt-3 space-y-1">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2 transition-colors group-hover:text-purple-600 dark:group-hover:text-purple-400">
          {title}
        </h3>

        {headline && (
          <p className="text-xs text-purple-600 dark:text-purple-400 line-clamp-1">
            {headline}
          </p>
        )}

        {usageDescription && !headline && (
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
            {usageDescription}
          </p>
        )}

        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">€{price}</span>
          {hasDiscount && (
            <span className="text-sm text-gray-500 line-through">€{comparePrice}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {product.availableForSale ? (
            <span className="text-xs text-green-600 dark:text-green-400">{t("product.inStock")}</span>
          ) : (
            <span className="text-xs text-red-600 dark:text-red-400">{t("product.outOfStock")}</span>
          )}
          {isEuWarehouse && (
            <span className="text-xs text-purple-600 dark:text-purple-400 flex items-center gap-0.5">
              <svg className="w-3 h-3" viewBox="0 0 12 8" fill="currentColor">
                <rect width="12" height="8" fill="#003399"/>
                <circle cx="6" cy="4" r="2.5" fill="none" stroke="#FFCC00" strokeWidth="0.5"/>
              </svg>
              EU
            </span>
          )}
        </div>
      </div>
    </Link>
  );

  // 3D Card with animations
  const Card3D = () => (
    <CardContainer className={cn("w-full", className)} containerClassName="py-0">
      <CardBody className="relative group/card w-full">
        <Link href={{ pathname: "/products/[handle]", params: { handle: productSlug }}} className="block">
          {/* Image Container */}
          <CardItem
            translateZ={50}
            className="relative aspect-square w-full overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-white/10 transition-all group-hover/card:border-purple-500/50"
          >
            {/* Discount Badge */}
            {hasDiscount && (
              <div className="absolute left-3 top-3 z-10 rounded-full bg-red-500 px-2 py-1 text-xs font-semibold text-white">
                -{discountPercent}%
              </div>
            )}

            {/* EU Badge */}
            {isEuWarehouse && (
              <div className="absolute right-3 top-3 z-10 rounded-full bg-purple-500 px-2 py-1 text-xs font-semibold text-white">
                EU
              </div>
            )}

            {/* Image */}
            {product.featuredImage ? (
              <Image
                src={product.featuredImage.url}
                alt={product.featuredImage.altText || title}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className="object-cover transition-transform duration-300 group-hover/card:scale-105"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-gray-400 dark:text-gray-600">
                <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
            )}

            {/* Quick View Overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover/card:opacity-100">
              <CardItem
                translateZ={80}
                className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black shadow-lg"
              >
                {t("common.viewAll")}
              </CardItem>
            </div>
          </CardItem>

          {/* Info */}
          <CardItem translateZ={30} className="mt-3 w-full space-y-1">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2 transition-colors group-hover/card:text-purple-600 dark:group-hover/card:text-purple-400">
              {title}
            </h3>

            {headline && (
              <p className="text-xs text-purple-600 dark:text-purple-400 line-clamp-1">
                {headline}
              </p>
            )}

            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900 dark:text-white">€{price}</span>
              {hasDiscount && (
                <span className="text-sm text-gray-500 line-through">€{comparePrice}</span>
              )}
            </div>

            {product.availableForSale ? (
              <p className="text-xs text-green-600 dark:text-green-400">{t("product.inStock")}</p>
            ) : (
              <p className="text-xs text-red-600 dark:text-red-400">{t("product.outOfStock")}</p>
            )}
          </CardItem>
        </Link>
      </CardBody>
    </CardContainer>
  );

  return use3D ? <Card3D /> : <SimpleCard />;
}
