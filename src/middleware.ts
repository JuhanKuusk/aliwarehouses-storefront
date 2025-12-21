/**
 * Middleware for locale-based routing with localized paths
 */

import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Match all pathnames except for:
  // - API routes (/api, /trpc)
  // - Next.js internals (/_next, /_vercel)
  // - Static files (files with extensions like .ico, .png, etc.)
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
