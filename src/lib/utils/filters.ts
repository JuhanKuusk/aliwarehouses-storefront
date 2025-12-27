/**
 * Product filtering utilities
 * Can be used on both server and client
 */

export type SortOption = "featured" | "price-low-high" | "price-high-low" | "newest" | "best-selling";

export interface FilterState {
  minPrice: string;
  maxPrice: string;
  inStockOnly: boolean;
  sort: SortOption;
  category: string;
  search: string;
}

// Utility function to filter and sort products
export function applyFilters<T extends {
  priceRange: { minVariantPrice: { amount: string } };
  availableForSale: boolean;
  tags?: string[];
  title?: string;
}>(
  products: T[],
  filters: FilterState
): T[] {
  let filtered = [...products];

  // Filter by search
  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filtered = filtered.filter(
      (p) => p.title?.toLowerCase().includes(searchLower)
    );
  }

  // Filter by price
  if (filters.minPrice) {
    const min = parseFloat(filters.minPrice);
    filtered = filtered.filter(
      (p) => parseFloat(p.priceRange.minVariantPrice.amount) >= min
    );
  }

  if (filters.maxPrice) {
    const max = parseFloat(filters.maxPrice);
    filtered = filtered.filter(
      (p) => parseFloat(p.priceRange.minVariantPrice.amount) <= max
    );
  }

  // Filter by availability
  if (filters.inStockOnly) {
    filtered = filtered.filter((p) => p.availableForSale);
  }

  // Filter by category (using tags)
  if (filters.category) {
    filtered = filtered.filter((p) => p.tags?.includes(filters.category));
  }

  // Sort
  switch (filters.sort) {
    case "price-low-high":
      filtered.sort(
        (a, b) =>
          parseFloat(a.priceRange.minVariantPrice.amount) -
          parseFloat(b.priceRange.minVariantPrice.amount)
      );
      break;
    case "price-high-low":
      filtered.sort(
        (a, b) =>
          parseFloat(b.priceRange.minVariantPrice.amount) -
          parseFloat(a.priceRange.minVariantPrice.amount)
      );
      break;
    // For "newest" and "best-selling", we'd need additional data from Shopify
    // For now, keep the original order
  }

  return filtered;
}
