import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import type { Locale } from "@/i18n/routing";

// Force dynamic rendering to avoid static generation issues with useTranslations hook
export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function CartPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <CartContent locale={locale as Locale} />;
}

function CartContent({ locale }: { locale: Locale }) {
  const t = useTranslations();

  return (
    <main className="min-h-screen bg-white dark:bg-black transition-colors">
      <Navbar locale={locale} />

      {/* Content */}
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t("cart.title")}</h1>

        {/* Empty cart state */}
        <div className="mt-12 rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-gray-900/50 p-12 text-center">
          <svg
            className="mx-auto h-16 w-16 text-gray-400 dark:text-gray-600"
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
          <h2 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">{t("cart.empty")}</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Start shopping to add items to your cart.
          </p>
          <Link
            href="/products"
            className="mt-6 inline-block rounded-full bg-gray-900 dark:bg-white px-8 py-3 text-sm font-semibold text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
          >
            {t("cart.continueShopping")}
          </Link>
        </div>
      </div>
    </main>
  );
}
