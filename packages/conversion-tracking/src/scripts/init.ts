/**
 * @leadgen/conversion-tracking - Auto-initialization Script
 *
 * Runs on every page load + View Transitions.
 */

if (typeof window === 'undefined') {
  throw new Error('@leadgen/conversion-tracking/init can only be used in browser');
}

import {
  initTracking,
  captureAttributionParams,
  hasMarketingConsent,
  initCrossDomain,
  initOfflineQueue,
  initDebugMode,
  initPlugins,
  notifyPageView,
  initIdentityTracking,
  initRemarketing,
  trackPageView,
  hasActiveSession,
  trackNewSession,
  trackPhoneClick,
} from '../client/index';

// Get config from window
const config = window.__TRACKING_CONFIG__;

// Check if this is a new session BEFORE creating it
const isNewSession = !hasActiveSession();

// Initialize core tracking
initTracking();

// Track new session for remarketing
if (isNewSession) {
  trackNewSession();
}

// Initialize plugins
initPlugins();

// Initialize cross-domain tracking if configured
if (config?.linkedDomains && config.linkedDomains.length > 0) {
  initCrossDomain(config.linkedDomains);
}

// Initialize offline queue if enabled
if (config?.enableOfflineQueue !== false) {
  initOfflineQueue();
}

// Initialize debug mode if enabled
if (config?.debug) {
  initDebugMode();
}

// Initialize identity tracking (anonymous session tracking)
initIdentityTracking();

// Initialize remarketing (engagement tracking, audience segmentation)
initRemarketing();

// Notify plugins of initial page view
notifyPageView(window.location.pathname);

// Re-initialize on Astro View Transitions
document.addEventListener('astro:page-load', () => {
  // Always re-capture attribution params — gclid/utm may be in the new URL
  captureAttributionParams();
  // Track page view for remarketing
  trackPageView();
  // Notify plugins
  notifyPageView(window.location.pathname);
});

document.addEventListener('astro:after-swap', () => {
  // Always re-capture — don't gate on consent, or gclid will be lost
  captureAttributionParams();
});

// =============================================================================
// Global tel: link tracking (event delegation)
// =============================================================================

function handleTelClick(e: Event) {
  const link = (e.target as Element)?.closest?.('a[href^="tel:"]') as HTMLAnchorElement | null;
  if (!link) return;

  const phone = link.getAttribute('href')?.replace('tel:', '') || undefined;
  trackPhoneClick({ phone });
}

document.addEventListener('click', handleTelClick);

export { initTracking };
