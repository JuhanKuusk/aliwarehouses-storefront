"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

// Category icons mapping
const CATEGORY_ICONS: Record<string, string> = {
  "Home Decor": "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  "Lighting": "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
  "Furniture": "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  "Garden": "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z",
  "Beauty Products": "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z",
  "Body Care Equipment": "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  "Renewable Energy": "M13 10V3L4 14h7v7l9-11h-7z",
  "Toys": "M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  "Pets": "M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0 0L9.121 9.12m5.758 5.759a3 3 0 114.243-4.243 3 3 0 01-4.243 4.243z",
  "Sports & Leisure": "M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
};

// Default icon for unknown categories
const DEFAULT_ICON = "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z";

interface CategoryTilesProps {
  categories: string[];
  selectedCategory: string;
}

export default function CategoryTiles({ categories, selectedCategory }: CategoryTilesProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Build URL with category parameter, preserving other params
  const buildCategoryUrl = (category: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (category) {
      params.set("category", category);
    } else {
      params.delete("category");
    }
    const queryString = params.toString();
    return queryString ? `${pathname}?${queryString}` : pathname;
  };

  if (categories.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        {t("home.categories.title")}
      </h2>
      <div className="flex flex-wrap gap-3">
        {/* All Products tile */}
        <Link
          href={buildCategoryUrl("")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all ${
            !selectedCategory
              ? "bg-purple-600 border-purple-600 text-white shadow-lg shadow-purple-500/25"
              : "bg-white dark:bg-gray-800 border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:border-purple-500/50 hover:shadow-md"
          }`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          <span className="font-medium">{t("filters.allProducts")}</span>
        </Link>

        {/* Category tiles */}
        {categories.map((category) => {
          const isSelected = selectedCategory === category;
          const icon = CATEGORY_ICONS[category] || DEFAULT_ICON;

          return (
            <Link
              key={category}
              href={buildCategoryUrl(category)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all ${
                isSelected
                  ? "bg-purple-600 border-purple-600 text-white shadow-lg shadow-purple-500/25"
                  : "bg-white dark:bg-gray-800 border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:border-purple-500/50 hover:shadow-md"
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
              </svg>
              <span className="font-medium">{category}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
