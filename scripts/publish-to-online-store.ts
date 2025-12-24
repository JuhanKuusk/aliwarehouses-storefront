#!/usr/bin/env npx tsx
/**
 * Publish Products to Online Store Sales Channel
 *
 * Uses GraphQL publishablePublish mutation with channel/publication ID
 * to properly publish products to the Online Store.
 *
 * Usage:
 *   npx tsx scripts/publish-to-online-store.ts
 *   npx tsx scripts/publish-to-online-store.ts --dry-run
 *   npx tsx scripts/publish-to-online-store.ts --limit 50
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const SHOPIFY_STORE = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN!;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN!;
const API_VERSION = process.env.NEXT_PUBLIC_SHOPIFY_API_VERSION || '2024-10';

// Known Online Store channel ID (from earlier query)
const ONLINE_STORE_CHANNEL_ID = 'gid://shopify/Channel/167423738044';

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

function parseArgs(): { dryRun: boolean; limit?: number } {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    limit: args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : undefined,
  };
}

async function graphqlRequest<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const url = `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/graphql.json`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GraphQL error: ${response.status} - ${text}`);
  }

  const result: GraphQLResponse<T> = await response.json();
  if (result.errors && result.errors.length > 0) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  return result.data!;
}

async function getActiveProducts(limit?: number): Promise<Array<{ id: string; title: string }>> {
  const allProducts: Array<{ id: string; title: string }> = [];
  let cursor: string | null = null;
  const maxProducts = limit || 500;

  while (allProducts.length < maxProducts) {
    const query = `
      query getProducts($first: Int!, $after: String) {
        products(first: $first, after: $after, query: "status:active") {
          edges {
            node {
              id
              title
            }
            cursor
          }
          pageInfo {
            hasNextPage
          }
        }
      }
    `;

    const data = await graphqlRequest<{
      products: {
        edges: Array<{ node: { id: string; title: string }; cursor: string }>;
        pageInfo: { hasNextPage: boolean };
      };
    }>(query, { first: Math.min(250, maxProducts - allProducts.length), after: cursor });

    allProducts.push(...data.products.edges.map(e => e.node));

    if (!data.products.pageInfo.hasNextPage || allProducts.length >= maxProducts) {
      break;
    }

    cursor = data.products.edges[data.products.edges.length - 1].cursor;
  }

  return allProducts;
}

async function publishProductToChannel(productId: string): Promise<{ success: boolean; error?: string }> {
  // Convert channel ID to publication ID format
  const publicationId = ONLINE_STORE_CHANNEL_ID.replace('/Channel/', '/Publication/');

  const mutation = `
    mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        publishable {
          ... on Product {
            id
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    const result = await graphqlRequest<{
      publishablePublish: {
        publishable: { id: string } | null;
        userErrors: Array<{ field: string; message: string }>;
      };
    }>(mutation, {
      id: productId,
      input: [{ publicationId }],
    });

    if (result.publishablePublish.userErrors.length > 0) {
      const errors = result.publishablePublish.userErrors.map(e => e.message);
      // Check if already published
      if (errors.some(e => e.includes('already published') || e.includes('already'))) {
        return { success: true, error: 'already_published' };
      }
      return { success: false, error: errors.join(', ') };
    }

    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    // Check if it's an access denied error
    if (errorMsg.includes('ACCESS_DENIED') || errorMsg.includes('write_publications')) {
      return { success: false, error: 'ACCESS_DENIED - needs write_publications scope' };
    }
    return { success: false, error: errorMsg };
  }
}

async function main(): Promise<void> {
  const args = parseArgs();

  console.log('\n🏪 Publish Products to Online Store (GraphQL)\n');
  console.log(`Store: ${SHOPIFY_STORE}`);
  console.log(`Dry run: ${args.dryRun}`);
  if (args.limit) console.log(`Limit: ${args.limit}`);
  console.log('');

  // Get all active products
  console.log('📦 Fetching active products...');
  const products = await getActiveProducts(args.limit);
  console.log(`Found ${products.length} active products\n`);

  if (products.length === 0) {
    console.log('No products to publish.\n');
    return;
  }

  // Publish each product
  let published = 0;
  let alreadyPublished = 0;
  let errors = 0;

  console.log('🚀 Publishing products to Online Store...\n');

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const shortTitle = product.title.substring(0, 50) + (product.title.length > 50 ? '...' : '');

    if (args.dryRun) {
      console.log(`[${i + 1}/${products.length}] ○ ${shortTitle}`);
      published++;
      continue;
    }

    const result = await publishProductToChannel(product.id);

    if (result.success && !result.error) {
      console.log(`[${i + 1}/${products.length}] ✅ ${shortTitle}`);
      published++;
    } else if (result.error === 'already_published') {
      console.log(`[${i + 1}/${products.length}] ✓ ${shortTitle} (already)`);
      alreadyPublished++;
    } else {
      console.log(`[${i + 1}/${products.length}] ❌ ${shortTitle}`);
      if (result.error) console.log(`    Error: ${result.error}`);
      errors++;

      // If access denied, stop trying
      if (result.error?.includes('ACCESS_DENIED')) {
        console.log('\n⚠️  Access denied. Need write_publications scope in Admin API token.');
        console.log('   Update your app at: Shopify Admin > Settings > Apps > Develop apps');
        break;
      }
    }

    // Rate limiting
    await new Promise(r => setTimeout(r, 200));
  }

  // Summary
  console.log('\n📊 Summary:');
  console.log(`├─ Total products: ${products.length}`);
  console.log(`├─ Newly published: ${published}`);
  console.log(`├─ Already published: ${alreadyPublished}`);
  console.log(`└─ Errors: ${errors}`);

  if (args.dryRun) {
    console.log('\n🏃 Dry run mode - no changes were made');
  } else if (published > 0) {
    console.log('\n✅ Products published to Online Store!');
    console.log(`View at: https://www.aliwarehouses.eu`);
  }

  console.log('');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
