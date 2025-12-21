/**
 * Shopify Storefront API - Main exports
 */

import { shopifyFetch, ShopifyProduct, ShopifyCollection, ShopifyCart } from './client';
import {
  GET_PRODUCTS,
  GET_PRODUCT_BY_HANDLE,
  GET_COLLECTION_PRODUCTS,
  GET_COLLECTIONS,
  SEARCH_PRODUCTS,
  GET_CART
} from './queries';
import {
  CREATE_CART,
  ADD_TO_CART,
  UPDATE_CART,
  REMOVE_FROM_CART
} from './mutations';

// Re-export types
export * from './client';

// Product functions
export async function getProducts(first = 20): Promise<ShopifyProduct[]> {
  const data = await shopifyFetch<{
    products: { edges: Array<{ node: ShopifyProduct }> };
  }>({
    query: GET_PRODUCTS,
    variables: { first },
    tags: ['products'],
  });

  return data.products.edges.map((edge) => edge.node);
}

export async function getProductByHandle(handle: string): Promise<ShopifyProduct | null> {
  const data = await shopifyFetch<{
    product: ShopifyProduct | null;
  }>({
    query: GET_PRODUCT_BY_HANDLE,
    variables: { handle },
    tags: ['products', `product-${handle}`],
  });

  return data.product;
}

// Collection functions
export async function getCollections(): Promise<ShopifyCollection[]> {
  const data = await shopifyFetch<{
    collections: { edges: Array<{ node: ShopifyCollection }> };
  }>({
    query: GET_COLLECTIONS,
    tags: ['collections'],
  });

  return data.collections.edges.map((edge) => edge.node);
}

export async function getCollectionProducts(
  handle: string,
  first = 20
): Promise<{ collection: ShopifyCollection | null; products: ShopifyProduct[] }> {
  const data = await shopifyFetch<{
    collection: ShopifyCollection | null;
  }>({
    query: GET_COLLECTION_PRODUCTS,
    variables: { handle, first },
    tags: ['collections', `collection-${handle}`],
  });

  if (!data.collection) {
    return { collection: null, products: [] };
  }

  return {
    collection: data.collection,
    products: data.collection.products.edges.map((edge) => edge.node),
  };
}

// Search function
export async function searchProducts(query: string, first = 20): Promise<ShopifyProduct[]> {
  const data = await shopifyFetch<{
    search: { edges: Array<{ node: ShopifyProduct }> };
  }>({
    query: SEARCH_PRODUCTS,
    variables: { query, first },
    cache: 'no-store',
  });

  return data.search.edges.map((edge) => edge.node);
}

// Cart functions
export async function createCart(lines: Array<{ merchandiseId: string; quantity: number }> = []): Promise<ShopifyCart> {
  const data = await shopifyFetch<{
    cartCreate: { cart: ShopifyCart; userErrors: Array<{ message: string }> };
  }>({
    query: CREATE_CART,
    variables: { lines },
    cache: 'no-store',
  });

  if (data.cartCreate.userErrors.length > 0) {
    throw new Error(data.cartCreate.userErrors[0].message);
  }

  return data.cartCreate.cart;
}

export async function getCart(cartId: string): Promise<ShopifyCart | null> {
  const data = await shopifyFetch<{
    cart: ShopifyCart | null;
  }>({
    query: GET_CART,
    variables: { cartId },
    cache: 'no-store',
  });

  return data.cart;
}

export async function addToCart(
  cartId: string,
  lines: Array<{ merchandiseId: string; quantity: number }>
): Promise<ShopifyCart> {
  const data = await shopifyFetch<{
    cartLinesAdd: { cart: ShopifyCart; userErrors: Array<{ message: string }> };
  }>({
    query: ADD_TO_CART,
    variables: { cartId, lines },
    cache: 'no-store',
  });

  if (data.cartLinesAdd.userErrors.length > 0) {
    throw new Error(data.cartLinesAdd.userErrors[0].message);
  }

  return data.cartLinesAdd.cart;
}

export async function updateCart(
  cartId: string,
  lines: Array<{ id: string; quantity: number }>
): Promise<ShopifyCart> {
  const data = await shopifyFetch<{
    cartLinesUpdate: { cart: ShopifyCart; userErrors: Array<{ message: string }> };
  }>({
    query: UPDATE_CART,
    variables: { cartId, lines },
    cache: 'no-store',
  });

  if (data.cartLinesUpdate.userErrors.length > 0) {
    throw new Error(data.cartLinesUpdate.userErrors[0].message);
  }

  return data.cartLinesUpdate.cart;
}

export async function removeFromCart(cartId: string, lineIds: string[]): Promise<ShopifyCart> {
  const data = await shopifyFetch<{
    cartLinesRemove: { cart: ShopifyCart; userErrors: Array<{ message: string }> };
  }>({
    query: REMOVE_FROM_CART,
    variables: { cartId, lineIds },
    cache: 'no-store',
  });

  if (data.cartLinesRemove.userErrors.length > 0) {
    throw new Error(data.cartLinesRemove.userErrors[0].message);
  }

  return data.cartLinesRemove.cart;
}

// Utility functions
export function formatPrice(price: { amount: string; currencyCode: string }): string {
  return new Intl.NumberFormat('en-EU', {
    style: 'currency',
    currency: price.currencyCode,
  }).format(parseFloat(price.amount));
}
