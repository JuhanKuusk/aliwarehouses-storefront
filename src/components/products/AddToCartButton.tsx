"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useCart } from "@/context/cart-context";

interface AddToCartButtonProps {
  variantId: string;
  availableForSale: boolean;
  className?: string;
}

export default function AddToCartButton({
  variantId,
  availableForSale,
  className = "",
}: AddToCartButtonProps) {
  const t = useTranslations();
  const { addItem, isLoading } = useCart();
  const [isAdding, setIsAdding] = useState(false);
  const [quantity, setQuantity] = useState(1);

  const handleAddToCart = async () => {
    if (!availableForSale || isAdding) return;

    setIsAdding(true);
    try {
      await addItem(variantId, quantity);
    } catch (error) {
      console.error("Failed to add to cart:", error);
    } finally {
      setIsAdding(false);
    }
  };

  const isDisabled = !availableForSale || isAdding || isLoading;

  return (
    <div className="flex gap-4">
      {/* Quantity Selector */}
      <div className="flex items-center rounded-full border border-white/20">
        <button
          onClick={() => setQuantity(Math.max(1, quantity - 1))}
          className="px-4 py-4 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          disabled={quantity <= 1 || isDisabled}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <span className="min-w-[40px] text-center text-white font-medium">{quantity}</span>
        <button
          onClick={() => setQuantity(quantity + 1)}
          className="px-4 py-4 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          disabled={isDisabled}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Add to Cart Button */}
      <button
        onClick={handleAddToCart}
        disabled={isDisabled}
        className={`flex-1 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 px-8 py-4 text-sm font-semibold text-white hover:from-purple-600 hover:to-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${className}`}
      >
        {isAdding ? (
          <>
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
            Adding...
          </>
        ) : availableForSale ? (
          <>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            {t("product.addToCart")}
          </>
        ) : (
          t("product.outOfStock")
        )}
      </button>
    </div>
  );
}
