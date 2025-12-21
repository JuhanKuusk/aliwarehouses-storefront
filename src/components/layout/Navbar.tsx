"use client";

import { Link } from "@/i18n/navigation";
import NextLink from "next/link";
import { usePathname as useNextPathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { localeNames, type Locale, priorityLocales, localizedPaths } from "@/i18n/routing";
import { useState, useRef, useCallback } from "react";
import { useCart } from "@/context/cart-context";
import { useTheme } from "@/context/theme-context";
import { useSearch } from "@/components/providers/AppProviders";
import MegaMenu from "./MegaMenu";

interface NavbarProps {
  locale: Locale;
}

export default function Navbar({ locale }: NavbarProps) {
  const t = useTranslations();
  const fullPathname = useNextPathname(); // Full path including locale
  const [isLocaleOpen, setIsLocaleOpen] = useState(false);
  const [isMegaMenuOpen, setIsMegaMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const megaMenuTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { cart, openCart } = useCart();
  const { theme, toggleTheme } = useTheme();
  const { openSearch } = useSearch();

  const handleMegaMenuEnter = useCallback(() => {
    if (megaMenuTimeoutRef.current) {
      clearTimeout(megaMenuTimeoutRef.current);
    }
    setIsMegaMenuOpen(true);
  }, []);

  const handleMegaMenuLeave = useCallback(() => {
    megaMenuTimeoutRef.current = setTimeout(() => {
      setIsMegaMenuOpen(false);
    }, 150);
  }, []);

  const navLinks = [
    { href: "/" as const, label: t("nav.home") },
    { href: "/products" as const, label: t("nav.products") },
  ];

  // Get the path without locale for locale switching
  const getPathForLocale = (newLocale: string) => {
    // Remove current locale prefix if present
    let pathWithoutLocale = fullPathname;
    for (const loc of priorityLocales) {
      if (fullPathname === `/${loc}` || fullPathname.startsWith(`/${loc}/`)) {
        pathWithoutLocale = fullPathname.slice(loc.length + 1) || '/';
        break;
      }
    }

    // Translate path segments
    const translatePath = (path: string, fromLocale: string, toLocale: string) => {
      let newPath = path;

      // Handle products path
      const fromProducts = localizedPaths.products[fromLocale as keyof typeof localizedPaths.products];
      const toProducts = localizedPaths.products[toLocale as keyof typeof localizedPaths.products];
      if (fromProducts && toProducts && newPath.includes(`/${fromProducts}`)) {
        newPath = newPath.replace(`/${fromProducts}`, `/${toProducts}`);
      }

      // Handle collections path
      const fromCollections = localizedPaths.collections[fromLocale as keyof typeof localizedPaths.collections];
      const toCollections = localizedPaths.collections[toLocale as keyof typeof localizedPaths.collections];
      if (fromCollections && toCollections && newPath.includes(`/${fromCollections}`)) {
        newPath = newPath.replace(`/${fromCollections}`, `/${toCollections}`);
      }

      // Handle cart path
      const fromCart = localizedPaths.cart[fromLocale as keyof typeof localizedPaths.cart];
      const toCart = localizedPaths.cart[toLocale as keyof typeof localizedPaths.cart];
      if (fromCart && toCart && newPath.includes(`/${fromCart}`)) {
        newPath = newPath.replace(`/${fromCart}`, `/${toCart}`);
      }

      return newPath;
    };

    const translatedPath = translatePath(pathWithoutLocale, locale, newLocale);

    // For default locale (en), don't add prefix
    if (newLocale === 'en') {
      return translatedPath;
    }
    return `/${newLocale}${translatedPath === '/' ? '' : translatedPath}`;
  };

  // Check if current path matches a nav link
  const isActiveLink = (href: string) => {
    if (href === '/') {
      return fullPathname === '/' || fullPathname === `/${locale}`;
    }
    // Check both localized and non-localized versions
    const localizedHref = href === '/products'
      ? `/${localizedPaths.products[locale as keyof typeof localizedPaths.products] || 'products'}`
      : href === '/collections'
      ? `/${localizedPaths.collections[locale as keyof typeof localizedPaths.collections] || 'collections'}`
      : href;

    return fullPathname === localizedHref ||
           fullPathname === `/${locale}${localizedHref}` ||
           fullPathname.startsWith(`${localizedHref}/`) ||
           fullPathname.startsWith(`/${locale}${localizedHref}/`);
  };

  const cartQuantity = cart?.totalQuantity || 0;

  return (
    <header
      className="sticky top-0 z-50 bg-white/80 dark:bg-black/80 backdrop-blur-xl transition-colors"
      onMouseLeave={() => setIsMegaMenuOpen(false)}
    >
      <div className="border-b border-gray-200 dark:border-white/10">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-blue-500">
              <span className="text-sm font-bold text-white">AW</span>
            </div>
            <span className="text-lg font-bold text-gray-900 dark:text-white">{t("common.brand")}</span>
          </Link>

          {/* Navigation */}
          <nav className="hidden items-center gap-6 md:flex">
            {navLinks.map((link) => {
              const isActive = isActiveLink(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm font-medium transition-colors ${
                    isActive
                      ? "text-gray-900 dark:text-white"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}

            {/* Categories Mega Menu Trigger */}
            <div
              className="relative"
              onMouseEnter={handleMegaMenuEnter}
              onMouseLeave={handleMegaMenuLeave}
            >
              <button
                className={`flex items-center gap-1 text-sm font-medium transition-colors ${
                  isMegaMenuOpen
                    ? "text-purple-600 dark:text-purple-400"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
                onClick={() => setIsMegaMenuOpen(!isMegaMenuOpen)}
              >
                {t("home.categories.title")}
                <svg
                  className={`h-4 w-4 transition-transform ${isMegaMenuOpen ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* Search Button */}
            <button
              onClick={openSearch}
              className="rounded-lg p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              aria-label={t("common.search")}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="rounded-lg p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? (
                // Sun icon for dark mode (click to switch to light)
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                // Moon icon for light mode (click to switch to dark)
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            {/* Locale Switcher */}
            <div className="relative">
              <button
                onClick={() => setIsLocaleOpen(!isLocaleOpen)}
                className="flex items-center gap-1 rounded-lg px-2 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                <span className="hidden sm:inline">{localeNames[locale]}</span>
                <span className="sm:hidden">{locale.toUpperCase()}</span>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isLocaleOpen && (
                <div className="absolute right-0 top-full mt-2 w-40 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-gray-900 py-2 shadow-xl z-50">
                  {priorityLocales.map((loc) => (
                    <NextLink
                      key={loc}
                      href={getPathForLocale(loc)}
                      onClick={() => setIsLocaleOpen(false)}
                      className={`block px-4 py-2 text-sm transition-colors ${
                        loc === locale
                          ? "text-purple-600 dark:text-purple-400"
                          : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                      }`}
                    >
                      {localeNames[loc]}
                    </NextLink>
                  ))}
                </div>
              )}
            </div>

            {/* Cart Icon */}
            <button
              onClick={openCart}
              className="relative rounded-lg p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              aria-label={`${t("nav.cart")} (${cartQuantity} items)`}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                />
              </svg>
              {cartQuantity > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-r from-purple-500 to-blue-500 text-xs font-bold text-white">
                  {cartQuantity > 99 ? "99+" : cartQuantity}
                </span>
              )}
            </button>

            {/* Mobile menu button */}
            <button
              className="rounded-lg p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white md:hidden"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {isMobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
        </div>
      </div>

      {/* Mega Menu */}
      <MegaMenu isOpen={isMegaMenuOpen} onClose={() => setIsMegaMenuOpen(false)} />

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="border-t border-gray-200 dark:border-white/10 bg-white dark:bg-gray-950 md:hidden">
          <div className="px-6 py-4 space-y-3">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className="block text-base font-medium text-gray-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/collections"
              onClick={() => setIsMobileMenuOpen(false)}
              className="block text-base font-medium text-gray-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400"
            >
              {t("home.categories.title")}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
