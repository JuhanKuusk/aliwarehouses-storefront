"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { ShopifyCart } from "@/lib/shopify";

interface CartContextType {
  cart: ShopifyCart | null;
  isLoading: boolean;
  isCartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  addItem: (merchandiseId: string, quantity?: number) => Promise<void>;
  updateItem: (lineId: string, quantity: number) => Promise<void>;
  removeItem: (lineId: string) => Promise<void>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_ID_KEY = "aliwarehouses-cart-id";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<ShopifyCart | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Initialize cart on mount
  useEffect(() => {
    const initCart = async () => {
      const cartId = localStorage.getItem(CART_ID_KEY);

      if (cartId) {
        try {
          const response = await fetch(`/api/cart?cartId=${cartId}`);
          const data = await response.json();

          if (data.cart) {
            setCart(data.cart);
          } else {
            // Cart expired or invalid, clear it
            localStorage.removeItem(CART_ID_KEY);
          }
        } catch (error) {
          console.error("Failed to fetch cart:", error);
          localStorage.removeItem(CART_ID_KEY);
        }
      }

      setIsLoading(false);
    };

    initCart();
  }, []);

  const openCart = useCallback(() => setIsCartOpen(true), []);
  const closeCart = useCallback(() => setIsCartOpen(false), []);

  const addItem = useCallback(async (merchandiseId: string, quantity = 1) => {
    setIsLoading(true);

    try {
      const cartId = localStorage.getItem(CART_ID_KEY);

      const response = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          cartId,
          merchandiseId,
          quantity,
        }),
      });

      const data = await response.json();

      if (data.cart) {
        setCart(data.cart);
        localStorage.setItem(CART_ID_KEY, data.cart.id);
        setIsCartOpen(true);
      }
    } catch (error) {
      console.error("Failed to add item to cart:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateItem = useCallback(async (lineId: string, quantity: number) => {
    setIsLoading(true);

    try {
      const cartId = localStorage.getItem(CART_ID_KEY);

      if (!cartId) {
        throw new Error("No cart found");
      }

      const response = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          cartId,
          lineId,
          quantity,
        }),
      });

      const data = await response.json();

      if (data.cart) {
        setCart(data.cart);
      }
    } catch (error) {
      console.error("Failed to update cart item:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const removeItem = useCallback(async (lineId: string) => {
    setIsLoading(true);

    try {
      const cartId = localStorage.getItem(CART_ID_KEY);

      if (!cartId) {
        throw new Error("No cart found");
      }

      const response = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "remove",
          cartId,
          lineId,
        }),
      });

      const data = await response.json();

      if (data.cart) {
        setCart(data.cart);
      }
    } catch (error) {
      console.error("Failed to remove cart item:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <CartContext.Provider
      value={{
        cart,
        isLoading,
        isCartOpen,
        openCart,
        closeCart,
        addItem,
        updateItem,
        removeItem,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);

  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }

  return context;
}
