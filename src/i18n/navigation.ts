/**
 * Navigation utilities for type-safe localized routing
 */

import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Create navigation functions that work with localized pathnames
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
