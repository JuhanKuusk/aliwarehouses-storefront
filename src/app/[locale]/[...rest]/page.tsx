import { notFound } from 'next/navigation';

/**
 * Catch-all page for unknown routes within locale segment
 * This ensures proper 404 handling for localized routes
 */
export default function CatchAllPage() {
  notFound();
}
