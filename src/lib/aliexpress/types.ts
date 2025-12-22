/**
 * AliExpress EU Warehouse Scraper Types
 */

// EU warehouse country codes
export const EU_WAREHOUSE_COUNTRIES = [
  'DE',  // Germany
  'FR',  // France
  'ES',  // Spain
  'PL',  // Poland
  'IT',  // Italy
  'NL',  // Netherlands
  'BE',  // Belgium
  'CZ',  // Czech Republic
  'AT',  // Austria
  'PT',  // Portugal
] as const;

export type EUWarehouseCountry = typeof EU_WAREHOUSE_COUNTRIES[number];

// Country code to display name mapping
export const COUNTRY_NAMES: Record<EUWarehouseCountry, string> = {
  DE: 'Germany',
  FR: 'France',
  ES: 'Spain',
  PL: 'Poland',
  IT: 'Italy',
  NL: 'Netherlands',
  BE: 'Belgium',
  CZ: 'Czech Republic',
  AT: 'Austria',
  PT: 'Portugal',
};

// Scraper options
export interface ScrapeOptions {
  searchQuery: string;
  countries?: EUWarehouseCountry[];  // Default: all EU countries
  maxPages?: number;                  // Pages per country (default: 3)
  minRating?: number;                 // Minimum seller rating (0-5)
  maxPrice?: number;                  // Maximum price in EUR
  minPrice?: number;                  // Minimum price in EUR
  category?: string;                  // Category for tagging
  debug?: boolean;                    // Save debug screenshots
  headless?: boolean;                 // Run in headless mode (default: true)
  useScraperApi?: boolean;            // Use ScraperAPI for CAPTCHA bypass
}

// Scraped product data
export interface ScrapedProduct {
  aliexpressProductId: string;
  aliexpressUrl: string;
  title: string;
  description?: string;
  price: number;
  originalPrice?: number;
  currency: string;
  shipsFrom: string;
  shipsFromDisplay?: string;
  isEuWarehouse: boolean;
  mainImageUrl?: string;
  imageUrls?: string[];
  sellerName?: string;
  sellerRating?: number;
  sellerUrl?: string;
  category?: string;
  searchQuery: string;
  orders?: number;
  freeShipping?: boolean;
}

// Database record
export interface AliexpressProductRecord {
  id?: string;
  aliexpress_product_id: string;
  aliexpress_url: string;
  title: string;
  description?: string;
  price?: number;
  original_price?: number;
  currency: string;
  ships_from: string;
  ships_from_display?: string;
  is_eu_warehouse: boolean;
  main_image_url?: string;
  image_urls?: string[];
  seller_name?: string;
  seller_rating?: number;
  seller_url?: string;
  category?: string;
  search_query: string;
  status: 'pending' | 'imported' | 'rejected' | 'unavailable';
  shopify_product_id?: string;
  scraped_at?: string;
  last_checked_at?: string;
  created_at?: string;
  updated_at?: string;
}

// Scraper result
export interface ScrapeResult {
  success: boolean;
  productsFound: number;
  productsSaved: number;
  duplicatesSkipped: number;
  errors: string[];
  duration: number;  // milliseconds
}

// User agents for rotation
export const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];
