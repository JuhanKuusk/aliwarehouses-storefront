/**
 * Proxy for locale-based routing with localized paths
 * (Renamed from middleware.ts for Next.js 16 compatibility)
 */

import createMiddleware from 'next-intl/middleware';
import { NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const handleI18nRouting = createMiddleware(routing);

export function proxy(request: NextRequest) {
  return handleI18nRouting(request);
}

export const config = {
  // Match all pathnames except for:
  // - API routes (/api, /trpc)
  // - Next.js internals (/_next, /_vercel)
  // - Static files (files with extensions like .ico, .png, etc.)
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
