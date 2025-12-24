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

// Localized path segments for SEO (all 24 EU languages)
export const localizedPaths = {
  products: {
    en: 'products',
    de: 'produkte',
    et: 'tooted',
    fr: 'produits',
    ru: 'produkty',
    pt: 'produtos',
    es: 'productos',
    it: 'prodotti',
    nl: 'producten',
    pl: 'produkty',
    cs: 'produkty',
    sk: 'produkty',
    hu: 'termekek',
    ro: 'produse',
    bg: 'produkti',
    el: 'proionta',
    sv: 'produkter',
    da: 'produkter',
    fi: 'tuotteet',
    lt: 'produktai',
    lv: 'produkti',
    sl: 'izdelki',
    hr: 'proizvodi',
    mt: 'prodotti',
  },
  collections: {
    en: 'collections',
    de: 'kollektionen',
    et: 'kollektsioonid',
    fr: 'collections',
    ru: 'kollektsii',
    pt: 'colecoes',
    es: 'colecciones',
    it: 'collezioni',
    nl: 'collecties',
    pl: 'kolekcje',
    cs: 'kolekce',
    sk: 'kolekcie',
    hu: 'kollekcio',
    ro: 'colectii',
    bg: 'kolektsii',
    el: 'sylloges',
    sv: 'kollektioner',
    da: 'kollektioner',
    fi: 'kokoelmat',
    lt: 'kolekcijos',
    lv: 'kolekcijas',
    sl: 'kolekcije',
    hr: 'kolekcije',
    mt: 'kollezzjonijiet',
  },
  cart: {
    en: 'cart',
    de: 'warenkorb',
    et: 'ostukorv',
    fr: 'panier',
    ru: 'korzina',
    pt: 'carrinho',
    es: 'carrito',
    it: 'carrello',
    nl: 'winkelwagen',
    pl: 'koszyk',
    cs: 'kosik',
    sk: 'kosik',
    hu: 'kosar',
    ro: 'cos',
    bg: 'koshnitsa',
    el: 'kalathi',
    sv: 'varukorg',
    da: 'kurv',
    fi: 'ostoskori',
    lt: 'krepselis',
    lv: 'grozs',
    sl: 'kosarica',
    hr: 'kosarica',
    mt: 'kartell',
  },
} as const;

// Full 24-locale support for EU market
export const routing = defineRouting({
  locales: allLocales,
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
      es: '/productos',
      it: '/prodotti',
      nl: '/producten',
      pl: '/produkty',
      cs: '/produkty',
      sk: '/produkty',
      hu: '/termekek',
      ro: '/produse',
      bg: '/produkti',
      el: '/proionta',
      sv: '/produkter',
      da: '/produkter',
      fi: '/tuotteet',
      lt: '/produktai',
      lv: '/produkti',
      sl: '/izdelki',
      hr: '/proizvodi',
      mt: '/prodotti',
    },
    '/products/[handle]': {
      en: '/products/[handle]',
      de: '/produkte/[handle]',
      et: '/tooted/[handle]',
      fr: '/produits/[handle]',
      ru: '/produkty/[handle]',
      pt: '/produtos/[handle]',
      es: '/productos/[handle]',
      it: '/prodotti/[handle]',
      nl: '/producten/[handle]',
      pl: '/produkty/[handle]',
      cs: '/produkty/[handle]',
      sk: '/produkty/[handle]',
      hu: '/termekek/[handle]',
      ro: '/produse/[handle]',
      bg: '/produkti/[handle]',
      el: '/proionta/[handle]',
      sv: '/produkter/[handle]',
      da: '/produkter/[handle]',
      fi: '/tuotteet/[handle]',
      lt: '/produktai/[handle]',
      lv: '/produkti/[handle]',
      sl: '/izdelki/[handle]',
      hr: '/proizvodi/[handle]',
      mt: '/prodotti/[handle]',
    },
    '/collections': {
      en: '/collections',
      de: '/kollektionen',
      et: '/kollektsioonid',
      fr: '/collections',
      ru: '/kollektsii',
      pt: '/colecoes',
      es: '/colecciones',
      it: '/collezioni',
      nl: '/collecties',
      pl: '/kolekcje',
      cs: '/kolekce',
      sk: '/kolekcie',
      hu: '/kollekcio',
      ro: '/colectii',
      bg: '/kolektsii',
      el: '/sylloges',
      sv: '/kollektioner',
      da: '/kollektioner',
      fi: '/kokoelmat',
      lt: '/kolekcijos',
      lv: '/kolekcijas',
      sl: '/kolekcije',
      hr: '/kolekcije',
      mt: '/kollezzjonijiet',
    },
    '/collections/[handle]': {
      en: '/collections/[handle]',
      de: '/kollektionen/[handle]',
      et: '/kollektsioonid/[handle]',
      fr: '/collections/[handle]',
      ru: '/kollektsii/[handle]',
      pt: '/colecoes/[handle]',
      es: '/colecciones/[handle]',
      it: '/collezioni/[handle]',
      nl: '/collecties/[handle]',
      pl: '/kolekcje/[handle]',
      cs: '/kolekce/[handle]',
      sk: '/kolekcie/[handle]',
      hu: '/kollekcio/[handle]',
      ro: '/colectii/[handle]',
      bg: '/kolektsii/[handle]',
      el: '/sylloges/[handle]',
      sv: '/kollektioner/[handle]',
      da: '/kollektioner/[handle]',
      fi: '/kokoelmat/[handle]',
      lt: '/kolekcijos/[handle]',
      lv: '/kolekcijas/[handle]',
      sl: '/kolekcije/[handle]',
      hr: '/kolekcije/[handle]',
      mt: '/kollezzjonijiet/[handle]',
    },
    '/cart': {
      en: '/cart',
      de: '/warenkorb',
      et: '/ostukorv',
      fr: '/panier',
      ru: '/korzina',
      pt: '/carrinho',
      es: '/carrito',
      it: '/carrello',
      nl: '/winkelwagen',
      pl: '/koszyk',
      cs: '/kosik',
      sk: '/kosik',
      hu: '/kosar',
      ro: '/cos',
      bg: '/koshnitsa',
      el: '/kalathi',
      sv: '/varukorg',
      da: '/kurv',
      fi: '/ostoskori',
      lt: '/krepselis',
      lv: '/grozs',
      sl: '/kosarica',
      hr: '/kosarica',
      mt: '/kartell',
    },
  },
});

// Helper to get localized product path
export function getLocalizedProductPath(locale: Locale, handle: string): string {
  const productsPath = localizedPaths.products[locale] || 'products';
  return `/${productsPath}/${handle}`;
}

// Helper to get localized collection path
export function getLocalizedCollectionPath(locale: Locale, handle: string): string {
  const collectionsPath = localizedPaths.collections[locale] || 'collections';
  return `/${collectionsPath}/${handle}`;
}

// Helper to get localized cart path
export function getLocalizedCartPath(locale: Locale): string {
  const cartPath = localizedPaths.cart[locale] || 'cart';
  return `/${cartPath}`;
}

// Pathnames type for type-safe navigation
export type Pathnames = keyof typeof routing.pathnames;
