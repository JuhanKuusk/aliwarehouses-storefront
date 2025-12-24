#!/usr/bin/env npx tsx
/**
 * Publish Products to Online Store via GraphQL Admin API
 *
 * This script uses the GraphQL Admin API to properly publish products
 * to the Online Store sales channel/publication.
 *
 * Usage:
 *   npx tsx scripts/publish-products.ts
 *   npx tsx scripts/publish-products.ts --dry-run
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const SHOPIFY_STORE = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN!;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN!;
const API_VERSION = process.env.NEXT_PUBLIC_SHOPIFY_API_VERSION || '2024-10';

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

function parseArgs(): { dryRun: boolean } {
  const args = process.argv.slice(2);
  return { dryRun: args.includes('--dry-run') };
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

async function getProducts(): Promise<Array<{ id: string; title: string; handle: string }>> {
  const query = `
    query {
      products(first: 250, query: "status:active") {
        edges {
          node {
            id
            title
            handle
          }
        }
      }
    }
  `;

  const data = await graphqlRequest<{
    products: { edges: Array<{ node: { id: string; title: string; handle: string } }> };
  }>(query);

  return data.products.edges.map(edge => edge.node);
}

async function getProductPublicationStatus(productId: string): Promise<{
  isPublishedToOnlineStore: boolean;
  onlineStorePublicationId: string | null;
  publications: Array<{ name: string; id: string }>;
}> {
  const query = `
    query getProductPublications($id: ID!) {
      product(id: $id) {
        resourcePublicationsV2(first: 20) {
          edges {
            node {
              publication {
                id
                name
              }
              isPublished
            }
          }
        }
      }
    }
  `;

  const data = await graphqlRequest<{
    product: {
      resourcePublicationsV2: {
        edges: Array<{
          node: {
            publication: { id: string; name: string };
            isPublished: boolean;
          };
        }>;
      };
    };
  }>(query, { id: productId });

  const allPublications = data.product.resourcePublicationsV2.edges.map(e => ({
    ...e.node.publication,
    isPublished: e.node.isPublished,
  }));

  const publications = allPublications.filter(p => p.isPublished);

  const onlineStore = allPublications.find(
    p => p.name.toLowerCase().includes('online store') || p.name.toLowerCase() === 'online store'
  );

  return {
    isPublishedToOnlineStore: onlineStore?.isPublished || false,
    onlineStorePublicationId: onlineStore?.id || null,
    publications,
  };
}

async function findOnlineStorePublicationId(): Promise<string | null> {
  // Get all products and find the Online Store publication from any of them
  const query = `
    query {
      products(first: 50, query: "status:active") {
        edges {
          node {
            id
            resourcePublicationsV2(first: 20) {
              edges {
                node {
                  publication {
                    id
                    name
                  }
                  isPublished
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await graphqlRequest<{
    products: {
      edges: Array<{
        node: {
          id: string;
          resourcePublicationsV2: {
            edges: Array<{
              node: {
                publication: { id: string; name: string };
                isPublished: boolean;
              };
            }>;
          };
        };
      }>;
    };
  }>(query);

  // Find Online Store publication from any product
  for (const productEdge of data.products.edges) {
    for (const pubEdge of productEdge.node.resourcePublicationsV2.edges) {
      const name = pubEdge.node.publication.name.toLowerCase();
      if (name.includes('online store') || name === 'online store') {
        return pubEdge.node.publication.id;
      }
    }
  }

  return null;
}

async function publishProductToOnlineStore(productId: string, publicationId: string): Promise<void> {
  const mutation = `
    mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        publishable {
          ... on Product {
            id
            title
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const result = await graphqlRequest<{
    publishablePublish: {
      publishable: { id: string; title: string } | null;
      userErrors: Array<{ field: string; message: string }>;
    };
  }>(mutation, {
    id: productId,
    input: [{ publicationId: publicationId }],
  });

  if (result.publishablePublish.userErrors.length > 0) {
    throw new Error(`Publish error: ${JSON.stringify(result.publishablePublish.userErrors)}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs();

  console.log('\n🏪 Publish Products to Online Store (GraphQL)\n');
  console.log(`Store: ${SHOPIFY_STORE}`);
  console.log(`Dry run: ${args.dryRun}`);
  console.log('');

  // Find the Online Store publication ID first
  console.log('🔍 Finding Online Store publication...');
  const onlineStorePublicationId = await findOnlineStorePublicationId();

  if (!onlineStorePublicationId) {
    console.log('❌ Could not find Online Store publication');
    console.log('Make sure at least one product is published to Online Store via Shopify admin');
    return;
  }

  console.log(`✅ Found Online Store publication: ${onlineStorePublicationId}\n`);

  // Get all active products
  console.log('📦 Fetching active products...');
  const products = await getProducts();
  console.log(`Found ${products.length} active products\n`);

  // Check publication status for each product
  let published = 0;
  let alreadyPublished = 0;
  let errors = 0;

  for (const product of products) {
    try {
      const status = await getProductPublicationStatus(product.id);

      if (status.isPublishedToOnlineStore) {
        console.log(`✓ ${product.title.substring(0, 50)}... (already in Online Store)`);
        alreadyPublished++;
      } else {
        if (args.dryRun) {
          console.log(`○ ${product.title.substring(0, 50)}... (would publish)`);
          console.log(`   Current publications: ${status.publications.map(p => p.name).join(', ') || 'none'}`);
        } else {
          await publishProductToOnlineStore(product.id, onlineStorePublicationId);
          console.log(`✅ ${product.title.substring(0, 50)}... (published!)`);
        }
        published++;
      }
    } catch (error) {
      console.log(`❌ ${product.title.substring(0, 50)}... (error: ${error})`);
      errors++;
    }

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 300));
  }

  // Summary
  console.log('\n📊 Summary:');
  console.log(`├─ Total active products: ${products.length}`);
  console.log(`├─ Newly published: ${published}`);
  console.log(`├─ Already published: ${alreadyPublished}`);
  console.log(`└─ Errors: ${errors}`);

  if (args.dryRun) {
    console.log('\n🏃 Dry run mode - no changes were made');
    console.log('Run without --dry-run to publish products');
  } else if (published > 0) {
    console.log('\n✅ Products are now visible on www.aliwarehouses.eu');
  }

  console.log('');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
