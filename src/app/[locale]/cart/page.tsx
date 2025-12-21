import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function CartPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <CartContent />;
}

function CartContent() {
  const t = useTranslations();

  // Cart will be implemented with client-side state management
  // For now, show empty cart state

  return (
    <main className="min-h-screen bg-black">
      {/* Header */}
      <header className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-6 py-4 lg:px-8">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-xl font-bold text-white">
              {t("common.brand")}
            </Link>
            <nav className="flex gap-6">
              <Link href="/" className="text-sm text-gray-400 hover:text-white">
                {t("nav.home")}
              </Link>
              <Link href="/products" className="text-sm text-gray-400 hover:text-white">
                {t("nav.products")}
              </Link>
              <Link href="/cart" className="text-sm text-white font-medium">
                {t("nav.cart")}
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
        <h1 className="text-3xl font-bold text-white">{t("cart.title")}</h1>

        {/* Empty cart state */}
        <div className="mt-12 rounded-2xl border border-white/10 bg-gray-900/50 p-12 text-center">
          <svg
            className="mx-auto h-16 w-16 text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
            />
          </svg>
          <h2 className="mt-4 text-lg font-medium text-white">{t("cart.empty")}</h2>
          <p className="mt-2 text-sm text-gray-400">
            Start shopping to add items to your cart.
          </p>
          <Link
            href="/products"
            className="mt-6 inline-block rounded-full bg-white px-8 py-3 text-sm font-semibold text-black hover:bg-gray-100 transition-colors"
          >
            {t("cart.continueShopping")}
          </Link>
        </div>

        {/* Cart implementation note */}
        <div className="mt-8 rounded-lg bg-purple-500/10 border border-purple-500/20 p-4">
          <p className="text-sm text-purple-300">
            Note: Full cart functionality with Shopify Checkout will be implemented using client-side state management.
          </p>
        </div>
      </div>
    </main>
  );
}
