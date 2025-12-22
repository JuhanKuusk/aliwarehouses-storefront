#!/usr/bin/env npx tsx
/**
 * AliExpress EU Warehouse Product Scraper CLI
 *
 * Usage:
 *   npx tsx scripts/scrape-aliexpress-eu.ts --query "led wall light"
 *   npx tsx scripts/scrape-aliexpress-eu.ts --query "garden furniture" --category garden --max-pages 5
 *   npx tsx scripts/scrape-aliexpress-eu.ts --query "solar panel" --max-price 100 --countries DE,FR,PL
 *
 * Options:
 *   --query <string>       Search query (required)
 *   --category <string>    Category tag for organizing products
 *   --max-pages <number>   Max pages per country (default: 3)
 *   --min-price <number>   Minimum price in EUR
 *   --max-price <number>   Maximum price in EUR
 *   --countries <string>   Comma-separated country codes (default: all EU)
 *   --dry-run              Don't save to database, just show results
 *   --stats                Show database statistics and exit
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });

import { scrapeAliExpressEU, EU_WAREHOUSE_COUNTRIES, type EUWarehouseCountry } from '../src/lib/aliexpress';
import { createAdminClient, saveProducts, getProductStats } from '../src/lib/supabase/aliexpress';

// Parse command line arguments
function parseArgs(): {
  query?: string;
  category?: string;
  maxPages: number;
  minPrice?: number;
  maxPrice?: number;
  countries: EUWarehouseCountry[];
  dryRun: boolean;
  stats: boolean;
  debug: boolean;
  headless: boolean;
  useScraperApi: boolean;
} {
  const args = process.argv.slice(2);
  const result = {
    query: undefined as string | undefined,
    category: undefined as string | undefined,
    maxPages: 3,
    minPrice: undefined as number | undefined,
    maxPrice: undefined as number | undefined,
    countries: [...EU_WAREHOUSE_COUNTRIES] as EUWarehouseCountry[],
    dryRun: false,
    stats: false,
    debug: false,
    headless: true,
    useScraperApi: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--query':
      case '-q':
        result.query = nextArg;
        i++;
        break;
      case '--category':
      case '-c':
        result.category = nextArg;
        i++;
        break;
      case '--max-pages':
      case '-p':
        result.maxPages = parseInt(nextArg) || 3;
        i++;
        break;
      case '--min-price':
        result.minPrice = parseFloat(nextArg);
        i++;
        break;
      case '--max-price':
        result.maxPrice = parseFloat(nextArg);
        i++;
        break;
      case '--countries':
        result.countries = nextArg
          .split(',')
          .map(c => c.trim().toUpperCase())
          .filter(c => EU_WAREHOUSE_COUNTRIES.includes(c as EUWarehouseCountry)) as EUWarehouseCountry[];
        i++;
        break;
      case '--dry-run':
        result.dryRun = true;
        break;
      case '--stats':
        result.stats = true;
        break;
      case '--debug':
        result.debug = true;
        break;
      case '--no-headless':
        result.headless = false;
        break;
      case '--use-scraperapi':
      case '--scraperapi':
        result.useScraperApi = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
AliExpress EU Warehouse Product Scraper

Usage:
  npx tsx scripts/scrape-aliexpress-eu.ts --query "search term" [options]

Options:
  --query, -q <string>     Search query (required unless --stats)
  --category, -c <string>  Category tag for organizing products
  --max-pages, -p <number> Max pages per country (default: 3)
  --min-price <number>     Minimum price in EUR
  --max-price <number>     Maximum price in EUR
  --countries <string>     Comma-separated country codes
                          Available: ${EU_WAREHOUSE_COUNTRIES.join(', ')}
  --dry-run                Don't save to database, just show results
  --stats                  Show database statistics and exit
  --debug                  Save screenshots for debugging
  --no-headless            Show browser window (for debugging)
  --use-scraperapi         Use ScraperAPI for CAPTCHA bypass ($49/mo)
  --help, -h               Show this help message

Examples:
  # Search for LED wall lights in all EU countries
  npx tsx scripts/scrape-aliexpress-eu.ts --query "led wall light"

  # Search with price filter and category
  npx tsx scripts/scrape-aliexpress-eu.ts --query "garden furniture" --category garden --max-price 200

  # Search only in Germany and France
  npx tsx scripts/scrape-aliexpress-eu.ts --query "solar panel" --countries DE,FR

  # Debug mode with visible browser
  npx tsx scripts/scrape-aliexpress-eu.ts --query "led lamp" --countries DE --debug --no-headless

  # Use ScraperAPI for CAPTCHA bypass (recommended)
  npx tsx scripts/scrape-aliexpress-eu.ts --query "led lamp" --countries DE --use-scraperapi

  # Show database statistics
  npx tsx scripts/scrape-aliexpress-eu.ts --stats
`);
}

async function showStats(): Promise<void> {
  console.log('\n📊 AliExpress Products Database Statistics\n');

  const supabase = createAdminClient();
  const stats = await getProductStats(supabase);

  console.log(`Total products: ${stats.total}`);
  console.log(`├─ Pending: ${stats.pending}`);
  console.log(`├─ Imported: ${stats.imported}`);
  console.log(`├─ Rejected: ${stats.rejected}`);
  console.log(`└─ Unavailable: ${stats.unavailable}`);

  if (Object.keys(stats.byCountry).length > 0) {
    console.log('\nBy warehouse country:');
    for (const [country, count] of Object.entries(stats.byCountry)) {
      console.log(`├─ ${country}: ${count}`);
    }
  }

  if (Object.keys(stats.byCategory).length > 0) {
    console.log('\nBy category:');
    for (const [category, count] of Object.entries(stats.byCategory)) {
      console.log(`├─ ${category}: ${count}`);
    }
  }

  console.log('');
}

async function main(): Promise<void> {
  const args = parseArgs();

  // Show stats and exit
  if (args.stats) {
    await showStats();
    return;
  }

  // Validate query
  if (!args.query) {
    console.error('Error: --query is required\n');
    printHelp();
    process.exit(1);
  }

  console.log('\n🔍 AliExpress EU Warehouse Product Scraper\n');
  console.log(`Query: "${args.query}"`);
  console.log(`Category: ${args.category || '(none)'}`);
  console.log(`Max pages per country: ${args.maxPages}`);
  console.log(`Countries: ${args.countries.join(', ')}`);
  if (args.minPrice) console.log(`Min price: €${args.minPrice}`);
  if (args.maxPrice) console.log(`Max price: €${args.maxPrice}`);
  console.log(`Dry run: ${args.dryRun}`);
  if (args.debug) console.log(`Debug: enabled`);
  if (!args.headless) console.log(`Headless: disabled (browser visible)`);
  if (args.useScraperApi) console.log(`ScraperAPI: enabled (CAPTCHA bypass)`);
  console.log('');

  // Run scraper
  const { products, result } = await scrapeAliExpressEU({
    searchQuery: args.query,
    countries: args.countries,
    maxPages: args.maxPages,
    minPrice: args.minPrice,
    maxPrice: args.maxPrice,
    category: args.category,
    debug: args.debug,
    headless: args.headless,
    useScraperApi: args.useScraperApi,
  });

  // Show sample products
  if (products.length > 0) {
    console.log('\n📦 Sample products found:\n');
    const sample = products.slice(0, 5);
    sample.forEach((p, i) => {
      console.log(`${i + 1}. ${p.title.substring(0, 60)}...`);
      console.log(`   Price: €${p.price}${p.originalPrice ? ` (was €${p.originalPrice})` : ''}`);
      console.log(`   Ships from: ${p.shipsFromDisplay || p.shipsFrom}`);
      console.log(`   URL: ${p.aliexpressUrl}`);
      console.log('');
    });

    if (products.length > 5) {
      console.log(`... and ${products.length - 5} more products\n`);
    }
  }

  // Save to database (unless dry run)
  if (!args.dryRun && products.length > 0) {
    console.log('💾 Saving products to database...');
    const supabase = createAdminClient();
    const { saved, errors } = await saveProducts(supabase, products);

    result.productsSaved = saved;

    if (errors.length > 0) {
      console.log(`\n⚠️  Errors during save:`);
      errors.forEach(e => console.log(`   - ${e}`));
    }

    console.log(`\n✅ Saved ${saved} products to database`);
  } else if (args.dryRun) {
    console.log('\n🏃 Dry run mode - products not saved to database');
  }

  // Show summary
  console.log('\n📈 Summary:');
  console.log(`├─ Products found: ${result.productsFound}`);
  console.log(`├─ Products saved: ${result.productsSaved}`);
  console.log(`├─ Duplicates skipped: ${result.duplicatesSkipped}`);
  console.log(`├─ Duration: ${(result.duration / 1000).toFixed(1)}s`);
  console.log(`└─ Success: ${result.success ? 'Yes' : 'No'}`);

  if (result.errors.length > 0) {
    console.log('\n❌ Errors:');
    result.errors.forEach(e => console.log(`   - ${e}`));
  }

  console.log('');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
