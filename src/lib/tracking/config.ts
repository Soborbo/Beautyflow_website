/**
 * Beautyflow tracking constants. Edit this file to retune the kit
 * for the project; every other module imports from here.
 */

// ---------------------------------------------------------------------------
// Per-project identity
// ---------------------------------------------------------------------------

export const STORAGE_PREFIX = 'bf' as const;

export const DEFAULT_CURRENCY = 'HUF' as const;

export const DEFAULT_COUNTRY: CountryCode = 'HU';

export const COUNTRY_DIAL_CODES = {
  GB: '+44',
  HU: '+36',
  DE: '+49',
  US: '+1',
  AT: '+43',
  RO: '+40',
} as const;

export type CountryCode = keyof typeof COUNTRY_DIAL_CODES;

// ---------------------------------------------------------------------------
// Upgrade-window timings
// ---------------------------------------------------------------------------

export const UPGRADE_WINDOW_MS = 60 * 60 * 1000;
export const LATE_CATCHUP_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Form abandonment
// ---------------------------------------------------------------------------

export const ABANDONMENT_MIN_DWELL_MS = 10 * 1000;

// ---------------------------------------------------------------------------
// PII retention
// ---------------------------------------------------------------------------

export const USER_DATA_TTL_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Server-side rate limit
// ---------------------------------------------------------------------------

export const RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const RATE_LIMIT_ABANDONMENT_MAX = 60;
export const RATE_LIMIT_CAPI_MAX = 20;

// ---------------------------------------------------------------------------
// Meta Graph API version
// ---------------------------------------------------------------------------

export const META_GRAPH_API_VERSION = 'v22.0';

// ---------------------------------------------------------------------------
// Storage keys & DOM ids
// ---------------------------------------------------------------------------

export const CONVERSION_STATE_KEY = `${STORAGE_PREFIX}_conversion_state`;
export const USER_DATA_STORAGE_KEY = `${STORAGE_PREFIX}_user_data`;
export const USER_DATA_ELEMENT_ID = `__${STORAGE_PREFIX}_user_data__`;
export const CONVERSION_STATE_CHANNEL = `${STORAGE_PREFIX}_conversion_state_v1`;
export const VIEW_CONTENT_FIRED_KEY = `${STORAGE_PREFIX}_view_content_fired`;

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

// Trailing slash required: astro.config `trailingSlash: 'always'` makes the
// slash form canonical for endpoints too. sendBeacon() does not follow
// redirects, so the beacon must hit the final URL directly (no 308 hop).
export const ABANDONMENT_BEACON_URL = '/api/track/abandonment/';
export const META_CAPI_ENDPOINT = '/api/meta/capi/';

// ---------------------------------------------------------------------------
// Internal-event → Meta-event name map
// ---------------------------------------------------------------------------

export const META_EVENT_NAMES: Record<string, string> = {
  primary_conversion: 'Lead',
  callback_conversion: 'Lead',
  contact_form_submit: 'Contact',
  phone_conversion: 'Contact',
  email_conversion: 'Contact',
  whatsapp_conversion: 'Contact',
  booking_click: 'InitiateCheckout',
  primary_first_view: 'ViewContent',
};
