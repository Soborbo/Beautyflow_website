/**
 * Astro client-lib: BROWSER-side tracking dispatch to the Soborbo event-gateway.
 *
 * NINCS TURNSTILE EBBEN AZ UTBAN, ES NE IS EPITSD VISSZA.
 *
 * A gateway 2026 nyara ota NEM validal Turnstile-t (a secret a Cloudflare
 * teszt-kulcsa volt: minden tokenre `success:true`, mikozben valodi
 * konverziokat nyelt el). A bongeszo-ut kapuja a gateway Origin allow-listje
 * es a rate limit, SZERVER-oldalon. A high-value konverziokat (form/lead) a
 * site backendje kuldi a hitelesitett szerver-ingressen.
 *
 * Ami itt allt: minden dispatch elott `await getTurnstileToken()`, benne egy
 * 10 MASODPERCES timeouttal. A klikk-konverzio kritikus utjan ez pont akkor
 * varakoztat, amikor a latogato mar navigal (tel:/mailto:) — a beacon igy
 * elveszhet. A tokenert cserebe a gateway semmit nem adott.
 *
 * AZ URLAP-VEDELEM ETTOL FUGGETLEN es MARAD: a sajat, LATHATO widgeteket a
 * `src/lib/forms/turnstile-client.ts` rendereli az /api/contact es
 * /api/boranalizis vegpontokhoz, amiket a site maga validal.
 */

import { generateUUID } from './uuid';
import { hasAnalyticsConsent, hasMarketingConsent } from './consent';
import { report } from './observability';

declare global {
  interface Window {
    dataLayer: Record<string, unknown>[];
    fbq?: (...args: unknown[]) => void;
  }
}

export interface UserData {
  email?: string;
  phone_number?: string;
  first_name?: string;
  last_name?: string;
  city?: string;
  street?: string;
  postal_code?: string;
  country?: string;
  // Stable user/cookie identifier (Meta external_id → EMQ improvement). The Worker
  // hashes it; pass the same value to the browser Pixel too for deduplication.
  external_id?: string;
}

export type ConsentSignal = 'GRANTED' | 'DENIED' | 'UNSPECIFIED';

export interface ConsentState {
  ad_user_data?: ConsentSignal;
  ad_personalization?: ConsentSignal;
  ad_storage?: ConsentSignal;
  analytics_storage?: ConsentSignal;
}

export type AttributionParams = Record<string, string>;

export interface ConversionPayload {
  event_name: string;
  event_id: string;
  event_time: number;
  value?: number;
  currency?: string;
  source?: string;
  service?: string;
  user_data?: UserData;
  event_source_url?: string;
  consent?: ConsentState;
  attribution?: AttributionParams;
}


/**
 * KET DEGRADACIO, MERT KET KULONBOZO KERDES (kanonikus 6.6.4).
 *
 * Egy hibas percent-szekvencia (`%zz`, csonka `%E0`) `URIError`-t dob. A
 * SZERVER-labon ez a hiba mar orzott (`src/lib/tracking/gateway-dispatch.ts`
 * `readConsentFromCookie`) — ott a dobas 500-as valasz a bekuldott urlapra,
 * vagyis elveszett lead. A BONGESZO-labon a kovetkezmeny mas, de nem
 * artalmatlan: CSEND. A `getCookie` a dispatch utjan is fut (`_fbp`, `_fbc`,
 * `_ga`, `_gcl_aw`), es egy dobas a `sendToWorker` promise-at utasitja el — a
 * konverzio nemanan nem megy ki.
 *
 * A KAPU (jogalap) fail-closed: egy fel-dekodolt stringbol kiolvasott
 * „advertisement:yes" hamis jogalap lenne. Az AZONOSITO-olvasas a nyers ertekre
 * esik vissza: azok azonositok, nem dontesek.
 */
function safeDecodeCookieValue(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

function decodeCookieValueLossy(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function rawCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : undefined;
}

/** Azonosito-olvasas (`_fbp`, `_fbc`, `_ga`, `_gcl_aw`) — lossy, sosem dob. */
function getCookie(name: string): string | undefined {
  const raw = rawCookie(name);
  return raw === undefined ? undefined : decodeCookieValueLossy(raw);
}

/** Jogalap-olvasas (`cookieyes-consent`) — fail-closed, sosem dob. */
function getConsentCookie(name: string): string | undefined {
  const raw = rawCookie(name);
  return raw === undefined ? undefined : safeDecodeCookieValue(raw);
}

function extractGAClientId(gaCookie: string | undefined): string | undefined {
  if (!gaCookie) return undefined;
  const parts = gaCookie.split('.');
  return parts.length >= 4 ? `${parts[2]}.${parts[3]}` : undefined;
}

// GA4 session id from the `_ga_<STREAM>` cookie. Two formats must be handled:
//   GS1: `GS1.1.<session_id>.<...>`
//   GS2: `GS2.1.s<session_id>$o..$g..`  ← the default for new sessions since 2025-05-06
// In GS2 a literal `s` precedes the session_id. We handle the optional `s` and the
// multi-digit version/slot segments too. Without it the MP event does not show up
// properly in GA4 reports.
function extractGASessionId(): string | undefined {
  const match = document.cookie.match(/_ga_[A-Z0-9]+=GS\d+\.\d+\.s?(\d+)/);
  return match ? match[1] : undefined;
}

// Consent Mode v2 state. Source order:
//   1) window.__trackingConsent (explicit override, e.g. for testing)
//   2) CookieYes `cookieyes-consent` cookie (CMP loaded from GTM)
// If absent → undefined → the Worker decides based on SiteConfig.require_consent
// (on EEA set require_consent:true → fail-closed when the cookie/decision is missing).
//
// CookieYes cookie format:
//   consentid:..,consent:yes,necessary:yes,functional:yes,analytics:yes,
//   performance:yes,advertisement:yes,other:yes   (:no when rejected)
// Consent Mode v2 mapping (CookieYes official):
//   advertisement → ad_storage + ad_user_data + ad_personalization
//   analytics     → analytics_storage
function getConsentState(): ConsentState | undefined {
  if (typeof window === 'undefined') return undefined;

  const override = (window as unknown as { __trackingConsent?: ConsentState }).__trackingConsent;
  if (override && typeof override === 'object') return override;

  const raw = getConsentCookie('cookieyes-consent');
  if (!raw) return undefined;

  const map: Record<string, string> = {};
  for (const part of raw.split(',')) {
    const idx = part.indexOf(':');
    if (idx > 0) map[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  // If there is no category key, it's not a CookieYes cookie → don't guess.
  if (map.advertisement === undefined && map.analytics === undefined) return undefined;

  const sig = (yes: boolean): ConsentSignal => (yes ? 'GRANTED' : 'DENIED');
  const adGranted = map.advertisement === 'yes';
  return {
    ad_user_data: sig(adGranted),
    ad_personalization: sig(adGranted),
    ad_storage: sig(adGranted),
    analytics_storage: sig(map.analytics === 'yes')
  };
}

// ── Universal attribution collection ────────────────────────────────────────
// All common click IDs + UTMs, from the URL + a `_gcl_aw` cookie fallback,
// persisted in localStorage (the conversion often happens on a different page
// than the landing). Last-touch wins for click IDs/UTMs; the landing context
// (landing_page, referrer) is first-touch.
const ATTR_STORAGE_KEY = '__sb_attribution';
const ATTR_CLICK_PARAMS = [
  'gclid',
  'gbraid',
  'wbraid',
  'gclsrc',
  'gad_source',
  'dclid',
  'fbclid',
  'msclkid',
  'ttclid',
  'li_fat_id',
  'twclid'
];
const ATTR_UTM_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'utm_source_platform',
  'utm_creative_format',
  'utm_marketing_tactic'
];

function readStoredAttribution(): AttributionParams {
  try {
    const raw = localStorage.getItem(ATTR_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AttributionParams) : {};
  } catch {
    return {};
  }
}

function writeStoredAttribution(a: AttributionParams): void {
  try {
    localStorage.setItem(ATTR_STORAGE_KEY, JSON.stringify(a));
  } catch {
    // localStorage blocked (privacy mode) — best-effort, silently skip.
  }
}

// gclid from the `_gcl_aw` cookie (format: GCL.<ts>.<gclid>) — fallback when the
// URL no longer has a gclid (e.g. the user converts on an internal page).
function gclidFromCookie(): string | undefined {
  const c = getCookie('_gcl_aw');
  if (!c) return undefined;
  const parts = c.split('.');
  return parts.length >= 3 ? parts.slice(2).join('.') : undefined;
}

// Google click IDs are MUTUALLY EXCLUSIVE: one click yields gclid OR gbraid OR wbraid,
// never several. This store merged per key, so a returning paid visitor kept the
// PREVIOUS click's ID alongside the new one and the conversion payload carried two IDs
// from two different clicks — which the offline upload rejects. So: as soon as the fresh
// source carries ANY Google click ID, its siblings are dropped. `fbclid`/`msclkid` are
// other networks and stay untouched.
const GOOGLE_CLICK_KEYS = ['gclid', 'gbraid', 'wbraid'] as const;

function dropStaleGoogleClickIds(
  stored: AttributionParams,
  fresh: AttributionParams,
): AttributionParams {
  if (!GOOGLE_CLICK_KEYS.some((k) => fresh[k])) {
    // No fresh Google click ID. A legacy store may still hold several from the
    // buggy era — keep `gclid` (the dominant, non-iOS form) and drop the siblings.
    const present = GOOGLE_CLICK_KEYS.filter((k) => stored[k]);
    if (present.length < 2) return stored;
    const keep = present.includes('gclid') ? 'gclid' : present[0];
    const healed = { ...stored };
    for (const k of GOOGLE_CLICK_KEYS) if (k !== keep) delete healed[k];
    return healed;
  }
  const cleaned = { ...stored };
  for (const k of GOOGLE_CLICK_KEYS) if (!fresh[k]) delete cleaned[k];
  return cleaned;
}

/**
 * A friss forrásból determinisztikusan EGY Google klikk-ID marad (gclid > gbraid > wbraid).
 * HELYBEN módosít: a hívó `fresh` objektuma `const`, és a felesleges kulcsokat TÖRÖLNI kell.
 */
function keepSingleGoogleClickId(fresh: AttributionParams): void {
  const present = GOOGLE_CLICK_KEYS.filter((k) => fresh[k]);
  if (present.length < 2) return;
  const keep = present.includes('gclid') ? 'gclid' : present[0];
  for (const k of GOOGLE_CLICK_KEYS) if (k !== keep) delete fresh[k];
}

export function collectAttribution(): AttributionParams {
  const stored = readStoredAttribution();
  const fresh: AttributionParams = {};

  // Ad-consent gate: click IDs are ad identifiers → we ONLY collect/store/send
  // them with ad consent (ePrivacy/TCF). UTM/landing is analytics metadata.
  //
  // Consent-source consistency: getConsentState() reads the CookieYes COOKIE, while
  // the rest of the lib gates on the CookieYes JS API (hasMarketingConsent). If the
  // cookie isn't present yet but the JS API already says marketing is granted, the
  // old code stripped all click IDs from the server-side payload even though the
  // user consented. Fall back to the JS API when the cookie/override is absent so
  // the two channels agree. (When the cookie IS present we respect its signals,
  // including an explicit DENIED.) Fail-closed when neither source grants.
  const consent = getConsentState();
  const adGranted = consent
    ? consent.ad_user_data === 'GRANTED' || consent.ad_storage === 'GRANTED'
    : hasMarketingConsent();

  try {
    const params = new URLSearchParams(window.location.search);
    if (adGranted) {
      for (const k of ATTR_CLICK_PARAMS) {
        const v = params.get(k);
        if (v) fresh[k] = v;
      }
    }
    for (const k of ATTR_UTM_PARAMS) {
      const v = params.get(k);
      if (v) fresh[k] = v;
    }
  } catch {
    // no-op
  }

  // Only ONE Google click ID may leave this function. Two guards, in order:
  //  1. The URL itself can carry several (redirect / tag-manager artefact) — collapse to one.
  //  2. The `_gcl_aw` cookie fallback must NOT fire when the URL already brought a Google
  //     click ID. Otherwise a returning visitor landing on ?gbraid=… with an old gclid
  //     cookie gets BOTH marked fresh, `dropStaleGoogleClickIds` keeps both (it only
  //     prunes `stored`), and the payload carries two IDs from two different clicks —
  //     exactly the rejection this module exists to prevent.
  keepSingleGoogleClickId(fresh);
  if (adGranted && !GOOGLE_CLICK_KEYS.some((k) => fresh[k])) {
    const g = gclidFromCookie();
    if (g) fresh.gclid = g;
  }

  // Last-touch: the fresh URL signals override the stored ones. A fresh Google click
  // ID also EVICTS its stored siblings (see dropStaleGoogleClickIds).
  const merged: AttributionParams = { ...dropStaleGoogleClickIds(stored, fresh), ...fresh };

  // Ad-consent revoked/missing → drop the previously stored click IDs too
  // (don't persist/send an ad identifier without consent).
  if (!adGranted) {
    for (const k of ATTR_CLICK_PARAMS) delete merged[k];
  }

  // First-touch landing context (don't overwrite if already present).
  if (!merged.landing_page) merged.landing_page = window.location.href;
  if (!merged.referrer && document.referrer) merged.referrer = document.referrer;

  writeStoredAttribution(merged);
  return merged;
}

/**
 * A BONGESZO-UTON ATENGEDETT EVENTEK.
 *
 * A gateway a high-value konverziokat (form/lead/purchase) a bongeszo-utrol
 * 403-mal dobja (TRK-400-017): azokat a site BACKENDJE kuldi a hitelesitett
 * `/api/event/conversion-server` ingressen, per-site tokennel. Az Origin
 * curl-bol hamisithato, ezert ez nem kozmetika.
 *
 * MIERT KELL EZ A LISTA MOST. Eddig a Turnstile-kapu vegezte ezt a munkat is,
 * mellekhatáskent: token nelkul CSAK ezt a harom klikk-eventet engedte at, a
 * tobbit kihagyta. A kapu kivezetesevel ez a felezes elveszne — a magas
 * kockazatu eventek garantalt-403 beacont termelnenek. Ezert a felosztas most
 * KIMONDOTT, nem egy mellekhatas: ugyanaz a harom event megy at, mint eddig.
 */
const BROWSER_GATEWAY_EVENTS: ReadonlySet<string> = new Set([
  'phone_conversion',
  'email_conversion',
  'whatsapp_conversion'
]);

export async function sendToWorker(payload: ConversionPayload): Promise<boolean> {
  if (!BROWSER_GATEWAY_EVENTS.has(payload.event_name)) {
    // HANGOS diagnosztika, nem nema kihagyas: ha egy hivo ide teved, azt latni
    // kell — kulonben a konverzio ugy tunik el, hogy a dispatch "sikeres" volt.
    report('GATEWAY_SERVER_INGRESS_ONLY', { event_name: payload.event_name });
    return false;
  }

  const fbp = getCookie('_fbp');
  const fbc = getCookie('_fbc');
  const clientId = extractGAClientId(getCookie('_ga'));
  const sessionId = extractGASessionId();

  const body = JSON.stringify({
    ...payload,
    fbp,
    fbc,
    client_id: clientId,
    session_id: sessionId,
    consent: payload.consent || getConsentState(),
    attribution: payload.attribution || collectAttribution(),
    event_source_url: payload.event_source_url || location.href
  });

  if (typeof navigator.sendBeacon === 'function') {
    try {
      const blob = new Blob([body], { type: 'application/json' });
      const queued = navigator.sendBeacon('/api/event/conversion', blob);
      if (queued) { report('GATEWAY_OK', { event_name: payload.event_name, transport: 'beacon' }); return true; }
      report('GATEWAY_BEACON_FALLBACK', { event_name: payload.event_name });
    } catch {
      report('GATEWAY_BEACON_FALLBACK', { event_name: payload.event_name });
    }
  }

  try {
    await fetch('/api/event/conversion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true
    });
    report('GATEWAY_OK', { event_name: payload.event_name, transport: 'fetch' });
    return true;
  } catch (err) {
    report('GATEWAY_NETWORK_FAIL', { event_name: payload.event_name, error: String(err) });
    return false;
  }
}

/**
 * @deprecated Prefer the consent-safe entry points in `index.ts`
 * (`trackLeadSubmit` / `trackServerEvent` / `trackPhoneConversion` …). This
 * low-level helper is kept for direct/advanced use. It is now CONSENT-GATED to
 * match the skill's consent matrix: the dataLayer push needs analytics consent,
 * the gateway dispatch needs marketing consent. Without either it is a no-op.
 */
export async function trackConversion(
  eventName: string,
  params: {
    event_id?: string;
    value?: number;
    currency?: string;
    source?: string;
    service?: string;
    user_data?: UserData;
    consent?: ConsentState;
  } = {}
): Promise<void> {
  const analytics = hasAnalyticsConsent();
  const marketing = hasMarketingConsent();
  if (!analytics && !marketing) return; // no consent → don't push or dispatch

  const eventId = params.event_id || generateUUID();
  const eventTime = Math.floor(Date.now() / 1000);

  // 1. Client GTM dataLayer push (for Meta Pixel browser-side dedup) — analytics consent.
  // PII does NOT go into the dataLayer.
  if (analytics && typeof window !== 'undefined') {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: eventName,
      event_id: eventId,
      ...(params.value !== undefined && { value: params.value }),
      ...(params.currency && { currency: params.currency }),
      ...(params.source && { source: params.source }),
      ...(params.service && { service: params.service })
    });
  }

  // 2. Server-side Worker dispatch (PII in the body, hashed in the Worker) — marketing consent.
  if (marketing) {
    await sendToWorker({
      event_name: eventName,
      event_id: eventId,
      event_time: eventTime,
      value: params.value,
      currency: params.currency,
      source: params.source,
      service: params.service,
      user_data: params.user_data,
      consent: params.consent
    });
  }
}
