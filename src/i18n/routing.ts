/**
 * i18n Routing Configuration
 * Defines all 24 EU languages with 6 priority languages first
 * Includes localized URL paths for SEO
 */

import { defineRouting } from 'next-intl/routing';

// Priority languages (6)
export const priorityLocales = ['en', 'de', 'et', 'fr', 'ru', 'pt'] as const;

// All EU languages (24 total)
export const allLocales = [
  // Priority languages
  'en', 'de', 'et', 'fr', 'ru', 'pt',
  // Additional EU languages
  'es', 'it', 'nl', 'pl', 'cs', 'sk',
  'hu', 'ro', 'bg', 'el', 'sv', 'da',
  'fi', 'lt', 'lv', 'sl', 'hr', 'mt'
] as const;

export type Locale = (typeof allLocales)[number];
export type PriorityLocale = (typeof priorityLocales)[number];

// Language names for the locale switcher
export const localeNames: Record<Locale, string> = {
  en: 'English',
  de: 'Deutsch',
  et: 'Eesti',
  fr: 'Français',
  ru: 'Русский',
  pt: 'Português',
  es: 'Español',
  it: 'Italiano',
  nl: 'Nederlands',
  pl: 'Polski',
  cs: 'Čeština',
  sk: 'Slovenčina',
  hu: 'Magyar',
  ro: 'Română',
  bg: 'Български',
  el: 'Ελληνικά',
  sv: 'Svenska',
  da: 'Dansk',
  fi: 'Suomi',
  lt: 'Lietuvių',
  lv: 'Latviešu',
  sl: 'Slovenščina',
  hr: 'Hrvatski',
  mt: 'Malti',
};

// Localized path segments for SEO
export const localizedPaths = {
  products: {
    en: 'products',
    de: 'produkte',
    et: 'tooted',
    fr: 'produits',
    ru: 'produkty',
    pt: 'produtos',
  },
  collections: {
    en: 'collections',
    de: 'kollektionen',
    et: 'kollektsioonid',
    fr: 'collections',
    ru: 'kollektsii',
    pt: 'colecoes',
  },
  cart: {
    en: 'cart',
    de: 'warenkorb',
    et: 'ostukorv',
    fr: 'panier',
    ru: 'korzina',
    pt: 'carrinho',
  },
} as const;

// For MVP, start with priority locales only
// Later switch to allLocales for full support
export const routing = defineRouting({
  locales: priorityLocales,
  defaultLocale: 'en',
  localePrefix: 'as-needed', // Don't show /en prefix for default locale
  pathnames: {
    '/': '/',
    '/products': {
      en: '/products',
      de: '/produkte',
      et: '/tooted',
      fr: '/produits',
      ru: '/produkty',
      pt: '/produtos',
    },
    '/products/[handle]': {
      en: '/products/[handle]',
      de: '/produkte/[handle]',
      et: '/tooted/[handle]',
      fr: '/produits/[handle]',
      ru: '/produkty/[handle]',
      pt: '/produtos/[handle]',
    },
    '/collections': {
      en: '/collections',
      de: '/kollektionen',
      et: '/kollektsioonid',
      fr: '/collections',
      ru: '/kollektsii',
      pt: '/colecoes',
    },
    '/collections/[handle]': {
      en: '/collections/[handle]',
      de: '/kollektionen/[handle]',
      et: '/kollektsioonid/[handle]',
      fr: '/collections/[handle]',
      ru: '/kollektsii/[handle]',
      pt: '/colecoes/[handle]',
    },
    '/cart': {
      en: '/cart',
      de: '/warenkorb',
      et: '/ostukorv',
      fr: '/panier',
      ru: '/korzina',
      pt: '/carrinho',
    },
  },
});

// Helper to get localized product path
export function getLocalizedProductPath(locale: PriorityLocale, handle: string): string {
  const productsPath = localizedPaths.products[locale] || 'products';
  return `/${productsPath}/${handle}`;
}

// Helper to get localized collection path
export function getLocalizedCollectionPath(locale: PriorityLocale, handle: string): string {
  const collectionsPath = localizedPaths.collections[locale] || 'collections';
  return `/${collectionsPath}/${handle}`;
}

// Pathnames type for type-safe navigation
export type Pathnames = keyof typeof routing.pathnames;
