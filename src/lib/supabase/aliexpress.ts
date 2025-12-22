/**
 * Supabase queries for AliExpress products
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { ScrapedProduct, AliexpressProductRecord } from '../aliexpress/types';

/**
 * Create Supabase admin client (for scripts)
 */
export function createAdminClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

/**
 * Convert scraped product to database record
 */
function toDbRecord(product: ScrapedProduct): Omit<AliexpressProductRecord, 'id' | 'created_at' | 'updated_at'> {
  return {
    aliexpress_product_id: product.aliexpressProductId,
    aliexpress_url: product.aliexpressUrl,
    title: product.title,
    description: product.description,
    price: product.price,
    original_price: product.originalPrice,
    currency: product.currency,
    ships_from: product.shipsFrom,
    ships_from_display: product.shipsFromDisplay,
    is_eu_warehouse: product.isEuWarehouse,
    main_image_url: product.mainImageUrl,
    image_urls: product.imageUrls,
    seller_name: product.sellerName,
    seller_rating: product.sellerRating,
    seller_url: product.sellerUrl,
    category: product.category,
    search_query: product.searchQuery,
    status: 'pending',
    scraped_at: new Date().toISOString(),
  };
}

/**
 * Save scraped products to database
 * Uses upsert to avoid duplicates
 */
export async function saveProducts(
  supabase: SupabaseClient,
  products: ScrapedProduct[],
): Promise<{ saved: number; errors: string[] }> {
  const errors: string[] = [];
  let saved = 0;

  // Process in batches of 50
  const batchSize = 50;
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    const records = batch.map(toDbRecord);

    const { error } = await supabase
      .from('aliexpress_products')
      .upsert(records, {
        onConflict: 'aliexpress_product_id',
        ignoreDuplicates: false,  // Update existing records
      });

    if (error) {
      errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
    } else {
      saved += batch.length;
    }
  }

  return { saved, errors };
}

/**
 * Get products by status
 */
export async function getProductsByStatus(
  supabase: SupabaseClient,
  status: AliexpressProductRecord['status'],
  limit: number = 100,
): Promise<AliexpressProductRecord[]> {
  const { data, error } = await supabase
    .from('aliexpress_products')
    .select('*')
    .eq('status', status)
    .order('scraped_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch products: ${error.message}`);
  }

  return data || [];
}

/**
 * Get products by category
 */
export async function getProductsByCategory(
  supabase: SupabaseClient,
  category: string,
  limit: number = 100,
): Promise<AliexpressProductRecord[]> {
  const { data, error } = await supabase
    .from('aliexpress_products')
    .select('*')
    .eq('category', category)
    .order('scraped_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch products: ${error.message}`);
  }

  return data || [];
}

/**
 * Update product status
 */
export async function updateProductStatus(
  supabase: SupabaseClient,
  productId: string,
  status: AliexpressProductRecord['status'],
  shopifyProductId?: string,
): Promise<void> {
  const updates: Partial<AliexpressProductRecord> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (shopifyProductId) {
    updates.shopify_product_id = shopifyProductId;
  }

  const { error } = await supabase
    .from('aliexpress_products')
    .update(updates)
    .eq('aliexpress_product_id', productId);

  if (error) {
    throw new Error(`Failed to update product status: ${error.message}`);
  }
}

/**
 * Mark products as unavailable if not updated recently
 */
export async function markStaleProductsUnavailable(
  supabase: SupabaseClient,
  olderThanDays: number = 30,
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const { data, error } = await supabase
    .from('aliexpress_products')
    .update({
      status: 'unavailable',
      updated_at: new Date().toISOString(),
    })
    .lt('last_checked_at', cutoffDate.toISOString())
    .eq('status', 'pending')
    .select('id');

  if (error) {
    throw new Error(`Failed to mark stale products: ${error.message}`);
  }

  return data?.length || 0;
}

/**
 * Get product statistics
 */
export async function getProductStats(supabase: SupabaseClient): Promise<{
  total: number;
  pending: number;
  imported: number;
  rejected: number;
  unavailable: number;
  byCountry: Record<string, number>;
  byCategory: Record<string, number>;
}> {
  // Get counts by status
  const { data: statusCounts, error: statusError } = await supabase
    .from('aliexpress_products')
    .select('status')
    .then(result => {
      if (result.error) throw result.error;
      const counts: Record<string, number> = {};
      (result.data || []).forEach(row => {
        counts[row.status] = (counts[row.status] || 0) + 1;
      });
      return { data: counts, error: null };
    });

  if (statusError) {
    throw new Error(`Failed to get status counts: ${statusError}`);
  }

  // Get counts by country
  const { data: countryCounts } = await supabase
    .from('aliexpress_products')
    .select('ships_from')
    .then(result => {
      const counts: Record<string, number> = {};
      (result.data || []).forEach(row => {
        counts[row.ships_from] = (counts[row.ships_from] || 0) + 1;
      });
      return { data: counts };
    });

  // Get counts by category
  const { data: categoryCounts } = await supabase
    .from('aliexpress_products')
    .select('category')
    .not('category', 'is', null)
    .then(result => {
      const counts: Record<string, number> = {};
      (result.data || []).forEach(row => {
        if (row.category) {
          counts[row.category] = (counts[row.category] || 0) + 1;
        }
      });
      return { data: counts };
    });

  const total = Object.values(statusCounts || {}).reduce((a, b) => a + b, 0);

  return {
    total,
    pending: statusCounts?.pending || 0,
    imported: statusCounts?.imported || 0,
    rejected: statusCounts?.rejected || 0,
    unavailable: statusCounts?.unavailable || 0,
    byCountry: countryCounts || {},
    byCategory: categoryCounts || {},
  };
}

/**
 * Check if product exists
 */
export async function productExists(
  supabase: SupabaseClient,
  aliexpressProductId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('aliexpress_products')
    .select('id')
    .eq('aliexpress_product_id', aliexpressProductId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to check product: ${error.message}`);
  }

  return !!data;
}

/**
 * Delete rejected or unavailable products older than X days
 */
export async function cleanupOldProducts(
  supabase: SupabaseClient,
  olderThanDays: number = 90,
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const { data, error } = await supabase
    .from('aliexpress_products')
    .delete()
    .in('status', ['rejected', 'unavailable'])
    .lt('updated_at', cutoffDate.toISOString())
    .select('id');

  if (error) {
    throw new Error(`Failed to cleanup products: ${error.message}`);
  }

  return data?.length || 0;
}
