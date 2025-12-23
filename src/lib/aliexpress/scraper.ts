/**
 * AliExpress EU Warehouse Product Scraper
 *
 * Uses Puppeteer with stealth plugin to scrape products from AliExpress
 * that ship from EU warehouses.
 *
 * Supports ScraperAPI for CAPTCHA bypass and IP rotation.
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page } from 'puppeteer';
import * as cheerio from 'cheerio';
import {
  EU_WAREHOUSE_COUNTRIES,
  COUNTRY_NAMES,
  USER_AGENTS,
  type EUWarehouseCountry,
  type ScrapeOptions,
  type ScrapedProduct,
  type ScrapeResult,
} from './types';

// Add stealth plugin
puppeteer.use(StealthPlugin());

// ScraperAPI configuration
const SCRAPER_API_PROXY = 'proxy-server.scraperapi.com:8001';
const SCRAPER_API_URL = 'https://api.scraperapi.com';
const getScraperApiKey = () => process.env.SCRAPER_API_KEY;

/**
 * Fetch page content via ScraperAPI direct API
 * More reliable for JS-heavy sites like AliExpress
 */
async function fetchViaScraperApi(url: string): Promise<string> {
  const apiKey = getScraperApiKey();
  if (!apiKey) throw new Error('SCRAPER_API_KEY not set');

  // Note: AliExpress is a protected domain requiring premium/ultra_premium proxies
  // Free ScraperAPI plan only has datacenter proxies which AliExpress blocks
  // For AliExpress, you need at least the Hobby plan ($49/mo)
  // Hobby/Startup plans only support 'us' or 'eu' country codes (not specific countries like 'de')
  const params = new URLSearchParams({
    api_key: apiKey,
    url: url,
    render: 'true',                          // Enable JavaScript rendering
    country_code: 'eu',                      // Use EU proxy (Hobby plan only supports 'us' or 'eu')
    device_type: 'desktop',
  });

  const response = await fetch(`${SCRAPER_API_URL}?${params.toString()}`, {
    method: 'GET',
    headers: { 'Accept': 'text/html' },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ScraperAPI error: ${response.status} - ${errorText}`);
  }

  return response.text();
}

/**
 * Parse product cards from HTML string using Cheerio
 * Used with ScraperAPI direct mode
 */
function parseProductCardsFromHtml(
  html: string,
  searchQuery: string,
  category?: string
): ScrapedProduct[] {
  const products: ScrapedProduct[] = [];
  const $ = cheerio.load(html);

  // Find all product links
  const processedIds = new Set<string>();

  $('a[href*="/item/"]').each((_, el) => {
    try {
      const $link = $(el);
      const href = $link.attr('href') || '';
      if (!href.includes('.html')) return;

      // Extract product ID
      const productIdMatch = href.match(/\/item\/(\d+)\.html/);
      const productId = productIdMatch ? productIdMatch[1] : null;
      if (!productId || processedIds.has(productId)) return;
      processedIds.add(productId);

      // Build full URL - handle various formats
      let fullUrl = href;
      if (href.startsWith('//')) {
        // Protocol-relative URL like //de.aliexpress.com/item/...
        fullUrl = `https:${href}`;
      } else if (!href.startsWith('http')) {
        // Relative URL like /item/...
        fullUrl = `https://www.aliexpress.com${href}`;
      }
      // else: already absolute URL, use as-is

      // Find parent card element
      let $card = $link;
      for (let i = 0; i < 10; i++) {
        const className = $card.attr('class') || '';
        if (className.includes('card') || className.includes('item') || className.includes('product')) {
          break;
        }
        const parent = $card.parent();
        if (!parent.length) break;
        $card = parent;
      }

      // Extract title
      let title = '';
      const titleSelectors = ['h1', 'h2', 'h3', '[class*="title"]', '[class*="Title"]', '[class*="name"]'];
      for (const sel of titleSelectors) {
        const titleText = $card.find(sel).first().text().trim() || $link.find(sel).first().text().trim();
        if (titleText && titleText.length > 5) {
          title = titleText;
          break;
        }
      }
      // Fallback to img alt
      if (!title) {
        const img = $card.find('img').first();
        title = img.attr('alt') || $link.text().trim().substring(0, 100) || '';
      }
      if (!title || title.length < 5) return;

      // Extract price
      const cardText = $card.text();
      let price = 0;
      const eurMatch = cardText.match(/€\s*([\d,.]+)|EUR\s*([\d,.]+)|([\d,.]+)\s*€/i);
      if (eurMatch) {
        const priceStr = eurMatch[1] || eurMatch[2] || eurMatch[3] || '0';
        price = parseFloat(priceStr.replace(',', '.')) || 0;
      } else {
        const priceMatch = cardText.match(/[\d]{1,3}[,.][\d]{2}/);
        if (priceMatch) price = parseFloat(priceMatch[0].replace(',', '.')) || 0;
      }

      // Extract original price
      let originalPrice: number | undefined;
      const delEl = $card.find('del, s, [class*="origin"], [class*="was"]').first();
      if (delEl.length) {
        const origMatch = delEl.text().match(/[\d,.]+/);
        if (origMatch) originalPrice = parseFloat(origMatch[0].replace(',', '.'));
      }

      // Extract image
      const imgEl = $card.find('img').first();
      let mainImageUrl = imgEl.attr('src') || imgEl.attr('data-src');
      if (mainImageUrl?.includes('data:image')) {
        mainImageUrl = imgEl.attr('data-src');
      }

      // Extract ships from
      let shipsFrom: string | null = null;
      const shipsMatch = cardText.match(/ships?\s*from[:\s]*([\w\s]+)/i);
      if (shipsMatch) {
        shipsFrom = shipsMatch[1].trim();
      }

      products.push({
        aliexpressProductId: productId,
        aliexpressUrl: fullUrl,
        title,
        price,
        originalPrice,
        currency: 'EUR',
        shipsFrom: shipsFrom || 'EU',
        shipsFromDisplay: shipsFrom || undefined,
        isEuWarehouse: true,
        mainImageUrl: mainImageUrl || undefined,
        searchQuery,
        category,
      });
    } catch {
      // Skip malformed items
    }
  });

  return products;
}

// Helper for random delays
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const randomDelay = (min: number, max: number) => delay(min + Math.random() * (max - min));

// Get random user agent
const getRandomUserAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

/**
 * Launch browser with stealth settings
 * @param headless - Run browser in headless mode
 * @param useScraperApi - Use ScraperAPI proxy for CAPTCHA bypass
 */
export async function launchBrowser(headless: boolean = true, useScraperApi: boolean = false): Promise<Browser> {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process',
    '--window-size=1920,1080',
    '--disable-notifications',
    '--disable-popup-blocking',
  ];

  // Add ScraperAPI proxy if enabled
  if (useScraperApi && getScraperApiKey()) {
    args.push(`--proxy-server=${SCRAPER_API_PROXY}`);
    // Ignore SSL cert errors - required for ScraperAPI proxy
    args.push('--ignore-certificate-errors');
    args.push('--ignore-certificate-errors-spki-list');
    console.log('  Using ScraperAPI proxy for CAPTCHA bypass');
  }

  return puppeteer.launch({
    headless: headless ? 'new' : false,
    args,
    defaultViewport: null,
  });
}

/**
 * Setup page with anti-detection measures
 * @param useScraperApi - Authenticate with ScraperAPI proxy
 */
async function setupPage(browser: Browser, useScraperApi: boolean = false): Promise<Page> {
  const page = await browser.newPage();

  // Authenticate with ScraperAPI proxy if enabled
  const scraperApiKey = getScraperApiKey();
  if (useScraperApi && scraperApiKey) {
    await page.authenticate({
      username: 'scraperapi.render=true',
      password: scraperApiKey,
    });
  }

  // Set random user agent
  await page.setUserAgent(getRandomUserAgent());

  // Set viewport
  await page.setViewport({ width: 1920, height: 1080 });

  // Set extra headers to simulate EU location
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-GB,en;q=0.9,de;q=0.8',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  });

  // Set cookies to force English/EUR locale
  await page.setCookie(
    { name: 'aep_usuc_f', value: 'site=glo&c_tp=EUR&region=DE&b_locale=en_US', domain: '.aliexpress.com' },
    { name: 'intl_locale', value: 'en_US', domain: '.aliexpress.com' },
    { name: 'intl_common_forever', value: '', domain: '.aliexpress.com' },
    { name: 'xman_f', value: 'G7LqJLIsPBkv/F9wIZwMSjOu3TZBk59vNXnHvVvqqEeRpZDC2+bJHhKhgXdEk6rn', domain: '.aliexpress.com' },
  );

  // Block unnecessary resources for faster loading (skip if using ScraperAPI)
  if (!useScraperApi) {
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      if (['font', 'media'].includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });
  }

  return page;
}

/**
 * Build AliExpress search URL with EU warehouse filter
 */
function buildSearchUrl(query: string, country: EUWarehouseCountry, page: number = 1): string {
  // Build URL without page parameter for first page (AliExpress works better this way)
  const params = new URLSearchParams({
    SearchText: query,
    shipFromCountry: country,
  });

  // Only add page parameter for pages > 1
  if (page > 1) {
    params.set('page', page.toString());
  }

  return `https://www.aliexpress.com/wholesale?${params.toString()}`;
}

/**
 * Wait for products to load on the page
 * Scrolls to trigger lazy loading and waits for product elements
 */
async function waitForProducts(page: Page, maxWaitTime: number = 30000): Promise<boolean> {
  const startTime = Date.now();

  console.log('    Waiting for products to load...');

  // Scroll down to trigger lazy loading
  await page.evaluate(() => {
    window.scrollTo(0, 500);
  });
  await delay(1000);

  // Try multiple selectors that indicate products are present
  const productSelectors = [
    // Common AliExpress product card selectors
    '[class*="search-item-card"]',
    '[class*="product-card"]',
    '[class*="list--gallery"]',
    '[class*="list-item"]',
    '[class*="card-out-wrapper"]',
    '[data-widget-cid*="product"]',
    // Links to product pages
    'a[href*="/item/"][href*=".html"]',
    // Product images
    'img[src*="ae01.alicdn.com"]',
    'img[src*="ae04.alicdn.com"]',
  ];

  while (Date.now() - startTime < maxWaitTime) {
    // Check if any product selector is present
    for (const selector of productSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          // Found a product element - wait a bit more for full load
          console.log(`    Found products (selector: ${selector.substring(0, 30)}...)`);
          await delay(2000);

          // Scroll more to load additional items
          await page.evaluate(() => {
            window.scrollTo(0, 1000);
          });
          await delay(1000);

          // Count products
          const count = await page.evaluate((sel) => {
            return document.querySelectorAll(sel).length;
          }, selector);
          console.log(`    Products found: ${count}`);

          return true;
        }
      } catch {
        // Selector not found, continue
      }
    }

    // Also check by counting product links
    const linkCount = await page.evaluate(() => {
      return document.querySelectorAll('a[href*="/item/"]').length;
    });

    if (linkCount > 3) {
      console.log(`    Found ${linkCount} product links`);
      await delay(2000);
      return true;
    }

    // Scroll more to trigger loading
    await page.evaluate(() => {
      window.scrollBy(0, 300);
    });

    await delay(2000);
  }

  console.log('    Timeout waiting for products');
  return false;
}

/**
 * Check if page is showing a CAPTCHA
 */
async function isCaptchaPage(page: Page): Promise<boolean> {
  try {
    const title = await page.title();
    const url = page.url();

    // Check for common CAPTCHA indicators
    const captchaIndicators = [
      title.toLowerCase().includes('captcha'),
      title.toLowerCase().includes('verification'),
      title.toLowerCase().includes('robot'),
      url.includes('captcha'),
      url.includes('punish'),
      url.includes('sec.aliexpress'),
    ];

    return captchaIndicators.some(Boolean);
  } catch {
    // If we can't get the title/URL, assume navigation happened (CAPTCHA solved)
    return false;
  }
}

/**
 * Wait for user to solve CAPTCHA manually
 */
async function waitForCaptchaSolve(page: Page, maxWaitTime: number = 120000): Promise<boolean> {
  console.log('\n⚠️  CAPTCHA DETECTED!');
  console.log('    Please solve the CAPTCHA in the browser window.');
  console.log('    The script will automatically continue once solved.');
  console.log(`    Waiting up to ${maxWaitTime / 1000} seconds...\n`);

  const startTime = Date.now();
  const checkInterval = 3000; // Check every 3 seconds

  while (Date.now() - startTime < maxWaitTime) {
    await delay(checkInterval);

    try {
      // Check if we're no longer on a CAPTCHA page
      const stillCaptcha = await isCaptchaPage(page);
      if (!stillCaptcha) {
        console.log('    ✅ CAPTCHA solved! Continuing...\n');
        // Wait for page to fully load after CAPTCHA solved
        await delay(3000);
        return true;
      }

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      if (elapsed % 15 === 0) {
        console.log(`    Still waiting... (${elapsed}s elapsed)`);
      }
    } catch {
      // Navigation or context change - might mean CAPTCHA was solved
      console.log('    Page navigated - checking if CAPTCHA solved...');
      await delay(3000);
      const stillCaptcha = await isCaptchaPage(page);
      if (!stillCaptcha) {
        console.log('    ✅ CAPTCHA solved! Continuing...\n');
        return true;
      }
    }
  }

  console.log('    ❌ CAPTCHA timeout - please try again\n');
  return false;
}

/**
 * Extract product ID from AliExpress URL
 */
function extractProductId(url: string): string | null {
  // Match patterns like /item/1005006123456789.html or /i/1005006123456789.html
  const match = url.match(/\/(?:item|i)\/(\d+)\.html/);
  return match ? match[1] : null;
}

/**
 * Parse product cards from search results page
 */
async function parseProductCards(page: Page, searchQuery: string, category?: string): Promise<ScrapedProduct[]> {
  const products: ScrapedProduct[] = [];

  try {
    // Wait for page to fully load - try multiple strategies
    try {
      // First try to wait for common product card selectors
      await Promise.race([
        page.waitForSelector('[class*="search-item-card"]', { timeout: 10000 }),
        page.waitForSelector('[class*="product-card"]', { timeout: 10000 }),
        page.waitForSelector('a[href*="/item/"]', { timeout: 10000 }),
        page.waitForSelector('[data-widget-cid*="product"]', { timeout: 10000 }),
      ]);
    } catch {
      // If no specific selectors found, wait a bit more for dynamic content
      await delay(5000);
    }

    // Additional wait for images to load (indicates content is ready)
    await delay(2000);

    // Extract product data from the page
    const productData = await page.evaluate(() => {
      const items: Array<{
        url: string;
        title: string;
        price: string;
        originalPrice: string | null;
        image: string | null;
        shipsFrom: string | null;
        sellerName: string | null;
        orders: string | null;
        rating: string | null;
      }> = [];

      // Find all product links first - this is the most reliable approach
      const allProductLinks = document.querySelectorAll('a[href*="/item/"]');
      const processedUrls = new Set<string>();

      allProductLinks.forEach((linkEl) => {
        try {
          const url = linkEl.getAttribute('href') || '';
          if (!url.includes('/item/') || !url.includes('.html')) return;

          // Normalize URL - handle various formats
          let fullUrl = url;
          if (url.startsWith('//')) {
            // Protocol-relative URL like //de.aliexpress.com/item/...
            fullUrl = `https:${url}`;
          } else if (!url.startsWith('http')) {
            // Relative URL like /item/...
            fullUrl = `https://www.aliexpress.com${url}`;
          }
          // else: already absolute URL, use as-is

          // Skip duplicates
          const productIdMatch = url.match(/\/item\/(\d+)\.html/);
          const productId = productIdMatch ? productIdMatch[1] : null;
          if (!productId || processedUrls.has(productId)) return;
          processedUrls.add(productId);

          // Find the parent card element (walk up the DOM tree)
          let card: Element | null = linkEl;
          for (let i = 0; i < 10 && card; i++) {
            if (card.className && (
              card.className.includes('card') ||
              card.className.includes('item') ||
              card.className.includes('product') ||
              card.getAttribute('data-widget-cid')
            )) {
              break;
            }
            card = card.parentElement;
          }
          if (!card) card = linkEl;

          // Get title - try multiple approaches
          let title = '';
          const titleSelectors = ['h1', 'h2', 'h3', '[class*="title"]', '[class*="Title"]', '[class*="name"]'];
          for (const sel of titleSelectors) {
            const titleEl = card.querySelector(sel) || linkEl.querySelector(sel);
            if (titleEl?.textContent?.trim()) {
              title = titleEl.textContent.trim();
              break;
            }
          }
          // Fallback: use the link text or alt text
          if (!title) {
            const img = card.querySelector('img') || linkEl.querySelector('img');
            title = img?.alt || linkEl.textContent?.trim()?.substring(0, 100) || '';
          }
          if (!title || title.length < 5) return;

          // Get price - look for currency symbols and numbers
          let price = '0';
          const priceText = card.textContent || '';
          // Look for EUR prices first
          const eurMatch = priceText.match(/€\s*([\d,.]+)|EUR\s*([\d,.]+)|([\d,.]+)\s*€/i);
          if (eurMatch) {
            price = eurMatch[1] || eurMatch[2] || eurMatch[3] || '0';
          } else {
            // Look for any price-like number
            const priceMatch = priceText.match(/[\d]{1,3}[,.][\d]{2}/);
            if (priceMatch) price = priceMatch[0];
          }

          // Get original price (strikethrough or "was" price)
          let originalPrice: string | null = null;
          const delEl = card.querySelector('del, s, [class*="origin"], [class*="was"]');
          if (delEl?.textContent) {
            const origMatch = delEl.textContent.match(/[\d,.]+/);
            if (origMatch) originalPrice = origMatch[0];
          }

          // Get image
          const imgEl = card.querySelector('img') || linkEl.querySelector('img');
          let image = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src') || null;
          // Handle lazy-loaded images
          if (image && image.includes('data:image')) {
            image = imgEl?.getAttribute('data-src') || null;
          }

          // Get ships from info
          const shipsFromText = card.textContent || '';
          let shipsFrom: string | null = null;
          const shipsMatch = shipsFromText.match(/ships?\s*from[:\s]*([\w\s]+)/i);
          if (shipsMatch) {
            shipsFrom = shipsMatch[1].trim();
          }

          items.push({
            url: fullUrl,
            title,
            price,
            originalPrice,
            image,
            shipsFrom,
            sellerName: null,
            orders: null,
            rating: null,
          });
        } catch {
          // Skip malformed items
        }
      });

      return items;
    });

    console.log(`    Raw items extracted: ${productData.length}`);

    // Process and validate extracted data
    for (const item of productData) {
      const productId = extractProductId(item.url);
      if (!productId) continue;

      // Parse price
      const price = parseFloat(item.price.replace(',', '.')) || 0;
      const originalPrice = item.originalPrice
        ? parseFloat(item.originalPrice.replace(',', '.'))
        : undefined;

      // Parse rating
      const rating = item.rating ? parseFloat(item.rating) : undefined;

      products.push({
        aliexpressProductId: productId,
        aliexpressUrl: item.url,
        title: item.title,
        price,
        originalPrice,
        currency: 'EUR',
        shipsFrom: item.shipsFrom || 'EU',
        shipsFromDisplay: item.shipsFrom || undefined,
        isEuWarehouse: true,
        mainImageUrl: item.image || undefined,
        sellerName: item.sellerName || undefined,
        sellerRating: rating,
        searchQuery,
        category,
      });
    }
  } catch (error) {
    console.error('Error parsing product cards:', error);
  }

  return products;
}

/**
 * Scrape products from AliExpress for a specific country
 */
async function scrapeCountry(
  page: Page,
  query: string,
  country: EUWarehouseCountry,
  maxPages: number,
  category?: string,
  minPrice?: number,
  maxPrice?: number,
  debug?: boolean,
): Promise<ScrapedProduct[]> {
  const allProducts: ScrapedProduct[] = [];

  console.log(`  Scraping ${COUNTRY_NAMES[country]} (${country})...`);

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    try {
      const url = buildSearchUrl(query, country, pageNum);
      console.log(`    Page ${pageNum}/${maxPages}...`);
      console.log(`    URL: ${url}`);

      // Use longer timeout for ScraperAPI (JS rendering takes time)
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });

      // Check for CAPTCHA and wait for manual solving if detected
      if (await isCaptchaPage(page)) {
        const solved = await waitForCaptchaSolve(page);
        if (!solved) {
          console.log(`    Skipping ${country} due to unsolved CAPTCHA`);
          break; // Skip this country
        }
        // After CAPTCHA is solved, the page usually redirects automatically
        // Wait for navigation to complete
        console.log('    Waiting for page to load after CAPTCHA...');
        await delay(3000);

        // Check if we're still on a search results page
        const currentUrl = page.url();
        console.log(`    Current URL: ${currentUrl}`);

        // If redirected to homepage or non-search page, re-navigate
        if (!currentUrl.includes('wholesale') && !currentUrl.includes('SearchText')) {
          console.log('    Re-navigating to search results...');
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
        }
      }

      // Wait for products to actually load (with scrolling)
      const productsLoaded = await waitForProducts(page, 30000);
      if (!productsLoaded) {
        console.log('    Products did not load, trying to scroll more...');
        // Extra scroll attempt
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight / 2);
        });
        await delay(3000);
      }

      // Debug: save screenshot if enabled
      if (debug) {
        const screenshotPath = `debug-${country}-page${pageNum}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`    Screenshot saved: ${screenshotPath}`);
      }

      // Debug: log page title and URL
      const pageTitle = await page.title();
      const currentUrl = page.url();
      console.log(`    Page title: ${pageTitle}`);
      if (currentUrl !== url) {
        console.log(`    Redirected to: ${currentUrl}`);
      }

      // Parse products from current page
      const products = await parseProductCards(page, query, category);

      // Filter by price if specified
      const filteredProducts = products.filter(p => {
        if (minPrice !== undefined && p.price < minPrice) return false;
        if (maxPrice !== undefined && p.price > maxPrice) return false;
        return true;
      });

      // Update ships from display with country name
      filteredProducts.forEach(p => {
        p.shipsFrom = country;
        p.shipsFromDisplay = `Ships from ${COUNTRY_NAMES[country]}`;
      });

      allProducts.push(...filteredProducts);
      console.log(`    Found ${filteredProducts.length} products`);

      // Check if there are more pages
      const hasNextPage = await page.evaluate(() => {
        const nextBtn = document.querySelector('[class*="next"]:not([disabled])');
        return !!nextBtn;
      });

      if (!hasNextPage || products.length === 0) {
        console.log(`    No more pages available`);
        break;
      }

      // Longer delay between pages
      await randomDelay(3000, 6000);

    } catch (error) {
      console.error(`    Error on page ${pageNum}:`, error);
      // Continue to next page on error
      await randomDelay(5000, 10000);
    }
  }

  return allProducts;
}

/**
 * Scrape products using ScraperAPI direct mode (no Puppeteer)
 * More reliable for JavaScript-heavy sites
 */
async function scrapeCountryViaApi(
  query: string,
  country: EUWarehouseCountry,
  maxPages: number,
  category?: string,
  minPrice?: number,
  maxPrice?: number,
  debug?: boolean,
): Promise<ScrapedProduct[]> {
  const allProducts: ScrapedProduct[] = [];

  console.log(`  Scraping ${COUNTRY_NAMES[country]} (${country}) via ScraperAPI...`);

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    try {
      const url = buildSearchUrl(query, country, pageNum);
      console.log(`    Page ${pageNum}/${maxPages}...`);
      console.log(`    URL: ${url}`);

      // Fetch via ScraperAPI
      const html = await fetchViaScraperApi(url);
      console.log(`    HTML received: ${html.length} bytes`);

      // Debug: save HTML if enabled
      if (debug) {
        const fs = await import('fs/promises');
        const htmlPath = `debug-${country}-page${pageNum}.html`;
        await fs.writeFile(htmlPath, html);
        console.log(`    HTML saved: ${htmlPath}`);
      }

      // Parse products from HTML
      const products = parseProductCardsFromHtml(html, query, category);
      console.log(`    Raw items extracted: ${products.length}`);

      // Filter by price if specified
      const filteredProducts = products.filter(p => {
        if (minPrice !== undefined && p.price < minPrice) return false;
        if (maxPrice !== undefined && p.price > maxPrice) return false;
        return true;
      });

      // Update ships from display with country name
      filteredProducts.forEach(p => {
        p.shipsFrom = country;
        p.shipsFromDisplay = `Ships from ${COUNTRY_NAMES[country]}`;
      });

      allProducts.push(...filteredProducts);
      console.log(`    Found ${filteredProducts.length} products`);

      if (products.length === 0) {
        console.log(`    No products found, stopping pagination`);
        break;
      }

      // Delay between pages (ScraperAPI has rate limits)
      if (pageNum < maxPages) {
        await randomDelay(2000, 4000);
      }

    } catch (error) {
      console.error(`    Error on page ${pageNum}:`, error);
      // Continue to next page on error
      await randomDelay(3000, 5000);
    }
  }

  return allProducts;
}

/**
 * Main scraping function
 */
export async function scrapeAliExpressEU(options: ScrapeOptions): Promise<{ products: ScrapedProduct[]; result: ScrapeResult }> {
  const startTime = Date.now();
  const errors: string[] = [];
  const allProducts: ScrapedProduct[] = [];

  const {
    searchQuery,
    countries = [...EU_WAREHOUSE_COUNTRIES],
    maxPages = 3,
    minPrice,
    maxPrice,
    category,
    debug = false,
    headless = true,
    useScraperApi = false,
  } = options;

  console.log(`\nStarting AliExpress EU scraper`);
  console.log(`Query: "${searchQuery}"`);
  console.log(`Countries: ${countries.join(', ')}`);
  console.log(`Max pages per country: ${maxPages}`);
  if (minPrice) console.log(`Min price: ${minPrice} EUR`);
  if (maxPrice) console.log(`Max price: ${maxPrice} EUR`);
  if (category) console.log(`Category: ${category}`);
  if (debug) console.log(`Debug mode: enabled (screenshots will be saved)`);
  if (!headless) console.log(`Headless: disabled (browser will be visible)`);
  if (useScraperApi) {
    if (getScraperApiKey()) {
      console.log(`ScraperAPI: enabled (CAPTCHA bypass active)`);
    } else {
      console.log(`⚠️  ScraperAPI requested but SCRAPER_API_KEY not set!`);
    }
  }
  console.log('');

  // Use ScraperAPI direct mode if enabled (no Puppeteer needed)
  if (useScraperApi && getScraperApiKey()) {
    console.log('Using ScraperAPI direct mode (no browser)...\n');

    for (const country of countries) {
      try {
        const products = await scrapeCountryViaApi(
          searchQuery,
          country,
          maxPages,
          category,
          minPrice,
          maxPrice,
          debug,
        );
        allProducts.push(...products);

        // Delay between countries
        if (countries.indexOf(country) < countries.length - 1) {
          await randomDelay(5000, 10000);
        }

      } catch (error) {
        const errorMsg = `Error scraping ${country}: ${error}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }
  } else {
    // Use Puppeteer (browser-based scraping)
    let browser: Browser | null = null;

    try {
      browser = await launchBrowser(headless, false);
      const page = await setupPage(browser, false);

      for (const country of countries) {
        try {
          const products = await scrapeCountry(
            page,
            searchQuery,
            country,
            maxPages,
            category,
            minPrice,
            maxPrice,
            debug,
          );
          allProducts.push(...products);

          // Longer delay between countries
          await randomDelay(10000, 20000);

        } catch (error) {
          const errorMsg = `Error scraping ${country}: ${error}`;
          console.error(errorMsg);
          errors.push(errorMsg);
        }
      }

    } catch (error) {
      const errorMsg = `Browser error: ${error}`;
      console.error(errorMsg);
      errors.push(errorMsg);
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  // Deduplicate by product ID
  const uniqueProducts = new Map<string, ScrapedProduct>();
  for (const product of allProducts) {
    if (!uniqueProducts.has(product.aliexpressProductId)) {
      uniqueProducts.set(product.aliexpressProductId, product);
    }
  }

  const products = Array.from(uniqueProducts.values());
  const duplicatesSkipped = allProducts.length - products.length;

  console.log(`\nScraping complete!`);
  console.log(`Total products found: ${allProducts.length}`);
  console.log(`Unique products: ${products.length}`);
  console.log(`Duplicates skipped: ${duplicatesSkipped}`);

  return {
    products,
    result: {
      success: errors.length === 0,
      productsFound: products.length,
      productsSaved: 0,  // Will be set by caller after saving
      duplicatesSkipped,
      errors,
      duration: Date.now() - startTime,
    },
  };
}

/**
 * Scrape a single product page for detailed info
 */
export async function scrapeProductDetails(
  browser: Browser,
  productUrl: string,
): Promise<Partial<ScrapedProduct> | null> {
  const page = await setupPage(browser);

  try {
    await page.goto(productUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await randomDelay(2000, 4000);

    const details = await page.evaluate(() => {
      // Get full description
      const descEl = document.querySelector('[class*="description"], [class*="detail"]');
      const description = descEl?.textContent?.trim() || '';

      // Get all images
      const imageEls = document.querySelectorAll('[class*="image-view"] img, [class*="gallery"] img');
      const imageUrls = Array.from(imageEls)
        .map(img => img.getAttribute('src') || img.getAttribute('data-src'))
        .filter((url): url is string => !!url);

      // Get seller info
      const sellerEl = document.querySelector('[class*="store-name"], [class*="seller"]');
      const sellerName = sellerEl?.textContent?.trim() || '';

      const sellerLink = document.querySelector('a[href*="/store/"]');
      const sellerUrl = sellerLink?.getAttribute('href') || '';

      return {
        description,
        imageUrls,
        sellerName,
        sellerUrl: sellerUrl.startsWith('http') ? sellerUrl : `https://www.aliexpress.com${sellerUrl}`,
      };
    });

    return details;

  } catch (error) {
    console.error('Error scraping product details:', error);
    return null;
  } finally {
    await page.close();
  }
}
