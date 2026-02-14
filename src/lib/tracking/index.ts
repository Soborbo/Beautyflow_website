/**
 * Beautyflow Unified Tracking
 * Zero-cost conversion tracking for lead generation
 */

// Re-exports
export {
  persistTrackingParams,
  getGclid,
  getFbclid,
  getAllTrackingData,
  getStoredData,
  clearTrackingData,
  type TrackingData
} from './gclid';

export {
  pushConversion,
  pushStepEvent,
  pushOptionEvent,
  type UserData,
  type ConversionParams
} from './dataLayer';

export {
  trackMetaLead,
  trackMetaPageView,
  trackMetaViewContent,
  type MetaEventParams
} from './zaraz';

export {
  hasMarketingConsent,
  hasAnalyticsConsent,
  canTrack,
  onConsentChange,
  waitForConsent,
  type ConsentCategory
} from './consent';

// Import for trackFullConversion
import { getGclid, getFbclid } from './gclid';
import { pushConversion } from './dataLayer';
import { trackMetaLead } from './zaraz';
import { hasMarketingConsent } from './consent';

export interface FullConversionParams {
  email: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  value?: number;
  currency?: string;
  transactionId?: string;
  contentName?: string;
}

export interface FullConversionResult {
  success: boolean;
  gclid: string | null;
  fbclid: string | null;
  consentBlocked: boolean;
}

/**
 * Full conversion tracking (GTM + Zaraz together)
 * Always pushes to dataLayer — GTM's Consent Mode handles ad_storage gating.
 * Blocking the push here was preventing conversions from ever reaching Google Ads.
 */
export function trackFullConversion(params: FullConversionParams): FullConversionResult {
  const gclid = getGclid();
  const fbclid = getFbclid();
  const hasConsent = hasMarketingConsent();

  if (!hasConsent) {
    console.info('[Tracking] Marketing consent not granted — GTM Consent Mode will gate ad tags');
  }

  // Always push to dataLayer. GTM's built-in consent settings (consentStatus: NEEDED
  // for ad_storage) will handle whether the Google Ads tag actually fires.
  // Blocking the push here meant conversions were silently dropped.
  pushConversion({
    email: params.email,
    phone: params.phone,
    firstName: params.firstName,
    lastName: params.lastName,
    value: params.value,
    currency: params.currency,
    transactionId: params.transactionId,
    gclid: gclid || undefined,
  });

  // Meta CAPI (server-side, consent handled by Zaraz)
  trackMetaLead({
    email: params.email,
    phone: params.phone,
    value: params.value,
    currency: params.currency,
    contentName: params.contentName,
  });

  return {
    success: true,
    gclid,
    fbclid,
    consentBlocked: !hasConsent,
  };
}
