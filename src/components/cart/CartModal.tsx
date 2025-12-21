"use client";

import { useCart } from "@/context/cart-context";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";

export default function CartModal() {
  const { cart, isCartOpen, closeCart, updateItem, removeItem, isLoading } = useCart();
  const t = useTranslations();
  const modalRef = useRef<HTMLDivElement>(null);

  // Close modal on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCart();
    };

    if (isCartOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isCartOpen, closeCart]);

  // Close modal on click outside
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      closeCart();
    }
  };

  if (!isCartOpen) return null;

  const cartItems = cart?.lines.edges.map((edge) => edge.node) || [];
  const subtotal = cart?.cost.subtotalAmount;
  const total = cart?.cost.totalAmount;
  const checkoutUrl = cart?.checkoutUrl;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="absolute right-0 top-0 h-full w-full max-w-md bg-white dark:bg-gray-900 shadow-xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-white/10 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t("cart.title")} ({cart?.totalQuantity || 0})
          </h2>
          <button
            onClick={closeCart}
            className="rounded-lg p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {cartItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <svg className="h-16 w-16 text-gray-400 dark:text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              <p className="text-gray-600 dark:text-gray-400 mb-4">{t("cart.empty")}</p>
              <button
                onClick={closeCart}
                className="text-purple-600 dark:text-purple-400 hover:text-purple-500 dark:hover:text-purple-300 text-sm font-medium"
              >
                {t("cart.continueShopping")}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {cartItems.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-4 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-gray-800/50 p-4"
                >
                  {/* Product Image */}
                  <Link
                    href={`/products/${item.merchandise.product.handle}`}
                    onClick={closeCart}
                    className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800"
                  >
                    {item.merchandise.product.featuredImage ? (
                      <Image
                        src={item.merchandise.product.featuredImage.url}
                        alt={item.merchandise.product.featuredImage.altText || item.merchandise.product.title}
                        fill
                        className="object-cover"
                        sizes="80px"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-gray-400 dark:text-gray-600">
                        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </Link>

                  {/* Product Info */}
                  <div className="flex flex-1 flex-col">
                    <Link
                      href={`/products/${item.merchandise.product.handle}`}
                      onClick={closeCart}
                      className="text-sm font-medium text-gray-900 dark:text-white hover:text-purple-600 dark:hover:text-purple-400 line-clamp-2"
                    >
                      {item.merchandise.product.title}
                    </Link>

                    {/* Variant Options */}
                    {item.merchandise.selectedOptions.length > 0 &&
                      item.merchandise.title !== "Default Title" && (
                        <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                          {item.merchandise.selectedOptions
                            .map((opt) => opt.value)
                            .join(" / ")}
                        </p>
                      )}

                    {/* Price */}
                    <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                      {parseFloat(item.cost.totalAmount.amount).toFixed(2)}{" "}
                      {item.cost.totalAmount.currencyCode}
                    </p>

                    {/* Quantity Controls */}
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex items-center rounded-lg border border-gray-300 dark:border-white/10">
                        <button
                          onClick={() => updateItem(item.id, Math.max(0, item.quantity - 1))}
                          disabled={isLoading}
                          className="px-2 py-1 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-50"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                          </svg>
                        </button>
                        <span className="px-3 py-1 text-sm text-gray-900 dark:text-white min-w-[40px] text-center">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateItem(item.id, item.quantity + 1)}
                          disabled={isLoading}
                          className="px-2 py-1 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-50"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      </div>

                      <button
                        onClick={() => removeItem(item.id)}
                        disabled={isLoading}
                        className="ml-auto text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-50"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {cartItems.length > 0 && (
          <div className="border-t border-gray-200 dark:border-white/10 px-6 py-4">
            {/* Subtotal */}
            <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
              <span>{t("cart.subtotal")}</span>
              <span>
                {subtotal ? `${parseFloat(subtotal.amount).toFixed(2)} ${subtotal.currencyCode}` : "-"}
              </span>
            </div>

            {/* Total */}
            <div className="flex items-center justify-between text-lg font-semibold text-gray-900 dark:text-white mb-4">
              <span>{t("cart.total")}</span>
              <span>
                {total ? `${parseFloat(total.amount).toFixed(2)} ${total.currencyCode}` : "-"}
              </span>
            </div>

            {/* Checkout Button */}
            <a
              href={checkoutUrl}
              className="block w-full rounded-full bg-gradient-to-r from-purple-500 to-blue-500 px-6 py-3 text-center text-sm font-semibold text-white shadow-lg hover:from-purple-600 hover:to-blue-600 transition-all"
            >
              {t("cart.checkout")}
            </a>

            {/* Continue Shopping */}
            <button
              onClick={closeCart}
              className="mt-3 w-full text-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              {t("cart.continueShopping")}
            </button>
          </div>
        )}

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent"></div>
          </div>
        )}
      </div>
    </div>
  );
}
