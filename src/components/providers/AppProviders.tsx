"use client";

import { useState, useEffect, createContext, useContext } from "react";
import { CartProvider } from "@/context/cart-context";
import { ThemeProvider } from "@/context/theme-context";
import CartModal from "@/components/cart/CartModal";
import SearchModal from "@/components/search/SearchModal";

interface SearchContextType {
  isSearchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
}

const SearchContext = createContext<SearchContextType | undefined>(undefined);

export function useSearch() {
  const context = useContext(SearchContext);
  if (context === undefined) {
    throw new Error("useSearch must be used within AppProviders");
  }
  return context;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const openSearch = () => setIsSearchOpen(true);
  const closeSearch = () => setIsSearchOpen(false);

  // Global keyboard shortcut for search (/)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger if not in an input/textarea
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)
      ) {
        e.preventDefault();
        openSearch();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <ThemeProvider>
      <CartProvider>
        <SearchContext.Provider value={{ isSearchOpen, openSearch, closeSearch }}>
          {children}
          <CartModal />
          <SearchModal isOpen={isSearchOpen} onClose={closeSearch} />
        </SearchContext.Provider>
      </CartProvider>
    </ThemeProvider>
  );
}
