"use client";

import { useState, useCallback, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { SortOption, FilterState } from "@/lib/utils/filters";

// Re-export types and function for convenience
export type { SortOption, FilterState } from "@/lib/utils/filters";
export { applyFilters } from "@/lib/utils/filters";

interface ProductFiltersProps {
  categories?: string[];
  productCount?: number;
}

export default function ProductFilters({ categories = [], productCount = 0 }: ProductFiltersProps) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);

  // Get current filter state from URL
  const currentFilters: FilterState = {
    minPrice: searchParams.get("minPrice") || "",
    maxPrice: searchParams.get("maxPrice") || "",
    inStockOnly: searchParams.get("inStock") === "true",
    sort: (searchParams.get("sort") as SortOption) || "featured",
    category: searchParams.get("category") || "",
  };

  const [filters, setFilters] = useState<FilterState>(currentFilters);

  // Update URL with new filters
  const updateFilters = useCallback(
    (newFilters: Partial<FilterState>) => {
      const updatedFilters = { ...filters, ...newFilters };
      setFilters(updatedFilters);

      const params = new URLSearchParams();

      if (updatedFilters.minPrice) params.set("minPrice", updatedFilters.minPrice);
      if (updatedFilters.maxPrice) params.set("maxPrice", updatedFilters.maxPrice);
      if (updatedFilters.inStockOnly) params.set("inStock", "true");
      if (updatedFilters.sort !== "featured") params.set("sort", updatedFilters.sort);
      if (updatedFilters.category) params.set("category", updatedFilters.category);

      const queryString = params.toString();
      const newUrl = queryString ? `${pathname}?${queryString}` : pathname;

      startTransition(() => {
        router.push(newUrl, { scroll: false });
      });
    },
    [filters, pathname, router]
  );

  // Clear all filters
  const clearFilters = useCallback(() => {
    const defaultFilters: FilterState = {
      minPrice: "",
      maxPrice: "",
      inStockOnly: false,
      sort: "featured",
      category: "",
    };
    setFilters(defaultFilters);
    startTransition(() => {
      router.push(pathname, { scroll: false });
    });
  }, [pathname, router]);

  const hasActiveFilters =
    filters.minPrice ||
    filters.maxPrice ||
    filters.inStockOnly ||
    filters.sort !== "featured" ||
    filters.category;

  return (
    <>
      {/* Mobile Filter Toggle */}
      <div className="lg:hidden mb-4">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          {isOpen ? t("common.hideFilters") : t("common.showFilters")}
          {hasActiveFilters && (
            <span className="ml-1 px-1.5 py-0.5 bg-purple-500 text-white text-xs rounded-full">!</span>
          )}
        </button>
      </div>

      {/* Filter Panel */}
      <div
        className={`${
          isOpen ? "block" : "hidden"
        } lg:block bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-white/10 p-4 mb-6 lg:mb-0`}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white">{t("filters.title")}</h3>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-sm text-purple-600 dark:text-purple-400 hover:underline"
            >
              {t("filters.clearAll")}
            </button>
          )}
        </div>

        {/* Loading indicator */}
        {isPending && (
          <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-500 border-t-transparent"></div>
            {t("common.loading")}
          </div>
        )}

        {/* Sort */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t("filters.sort")}
          </label>
          <select
            value={filters.sort}
            onChange={(e) => updateFilters({ sort: e.target.value as SortOption })}
            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value="featured">{t("filters.sortOptions.featured")}</option>
            <option value="price-low-high">{t("filters.sortOptions.priceLowHigh")}</option>
            <option value="price-high-low">{t("filters.sortOptions.priceHighLow")}</option>
            <option value="newest">{t("filters.sortOptions.newest")}</option>
            <option value="best-selling">{t("filters.sortOptions.bestSelling")}</option>
          </select>
        </div>

        {/* Price Range */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t("filters.priceRange")}
          </label>
          <div className="flex gap-2">
            <div className="flex-1">
              <input
                type="number"
                placeholder={t("filters.minPrice")}
                value={filters.minPrice}
                onChange={(e) => updateFilters({ minPrice: e.target.value })}
                min="0"
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            <span className="flex items-center text-gray-400">-</span>
            <div className="flex-1">
              <input
                type="number"
                placeholder={t("filters.maxPrice")}
                value={filters.maxPrice}
                onChange={(e) => updateFilters({ maxPrice: e.target.value })}
                min="0"
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Availability */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t("filters.availability")}
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.inStockOnly}
              onChange={(e) => updateFilters({ inStockOnly: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-purple-600 focus:ring-purple-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">{t("filters.inStockOnly")}</span>
          </label>
        </div>

        {/* Category */}
        {categories.length > 0 && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t("filters.category")}
            </label>
            <select
              value={filters.category}
              onChange={(e) => updateFilters({ category: e.target.value })}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="">{t("filters.allCategories")}</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Results Count */}
        <div className="pt-4 border-t border-gray-200 dark:border-white/10">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("filters.resultsCount", { count: productCount })}
          </p>
        </div>
      </div>
    </>
  );
}
