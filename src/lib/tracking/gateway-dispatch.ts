/**
 * Server-to-server conversion dispatch to the Soborbo event-gateway Worker.
 *
 * WHY THIS EXISTS. Until now the ONLY thing that told the gateway about a lead was
 * the browser (`trackLeadSubmit` → `/api/event/conversion`). That leg dies quietly
 * whenever the browser does: a Turnstile hiccup, the hard navigation to /koszonjuk
 * winning the race against sendBeacon, an ad-blocker. The lead itself still lands
 * (email + Sheets + CRM), so the business sees leads while Meta sees nothing — the
 * exact failure that cost Painless every server-side conversion for two weeks.
 *
 * This module is the backstop: the lead chokepoints (`/api/contact`,
 * `/api/boranalizis`) push the conversion straight from the server, authenticated
 * with a per-site token. Both legs carry the SAME `event_id`, so Meta dedupes them
 * into ONE Lead rather than counting two (CLAUDE.md #16).
 *
 * CONSENT. beautyflow's gateway site-config sets `require_consent: true`, so the
 * gateway sends Meta/Google Ads ONLY on an explicit `ad_user_data: GRANTED`. We
 * therefore forward the user's Consent Mode state, read from the very same
 * CookieYes cookie the browser lib reads (see `readConsentFromCookie`) — the cookie
 * rides along with the form POST, so the two legs cannot disagree. Without this the
 * server leg would be accepted, ledgered, and then silently drop Meta on every
 * single lead: a server-side leg that looks alive and delivers nothing.
 */

/** Minimal shape of the Cloudflare service binding to the gateway Worker. */
export interface GatewayFetcher {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
}

export interface GatewayEnv {
  /**
   * Service binding to the event-gateway Worker (wrangler.jsonc `services`).
   * REQUIRED — a plain fetch() to https://beautyflow.pro/api/event/* would NOT
   * reach the gateway: that URL is a Worker route on our OWN zone, and Cloudflare
   * does not let a Worker subrequest re-enter another Worker route on the same zone
   * (loop protection). It would be short-circuited, and the conversion would vanish
   * with the lead endpoint still answering 200.
   */
  GATEWAY?: GatewayFetcher;
  /** Plaintext per-site token; its SHA-256 is `crm_token_sha256` in the gateway KV. */
  TRACKING_GATEWAY_TOKEN?: string;
  SITE_URL?: string;
  /** Synthetic-lead smoke test — see `resolveTestEventCode`. */
  TRACKING_TEST_LEAD_EMAIL?: string;
  TRACKING_TEST_EVENT_CODE?: string;
}

export type ConsentSignal = 'GRANTED' | 'DENIED';

export interface ConsentState {
  ad_user_data: ConsentSignal;
  ad_personalization: ConsentSignal;
  ad_storage: ConsentSignal;
  analytics_storage: ConsentSignal;
}

/** Canonical gateway event names (Serverside `src/events.json`). */
export type GatewayEventName = 'contact_form_submitted' | 'quote_calculator_submitted';

export interface GatewayUserData {
  email?: string;
  phone_number?: string;
  first_name?: string;
  last_name?: string;
  city?: string;
  postal_code?: string;
  country?: string;
}

export interface GatewayConversionInput {
  eventName: GatewayEventName;
  /**
   * MUST be the id the browser used for this same conversion. A different id does
   * not "add" a conversion — it DOUBLE-COUNTS the Lead, because Meta dedupes on the
   * (event_name, event_id) pair.
   */
  eventId: string;
  leadId?: string;
  value?: number;
  currency?: string;
  source?: string;
  userData?: GatewayUserData;
  /**
   * Meta browser IDs, PLAIN (never hashed — CLAUDE.md #1). The client reads
   * them from the _fbp/_fbc cookies and POSTs them with the form; forwarding
   * them here lets the gateway's Meta CAPI leg carry the same identifiers as
   * the Pixel leg (EMQ + attribution). Top-level in the gateway payload —
   * the gateway reads `payload.fbp` / `payload.fbc`, not user_data.
   */
  fbp?: string;
  fbc?: string;
  attribution?: Record<string, string | undefined>;
  consent?: ConsentState;
  eventSourceUrl?: string;
  /** The REAL end-user's IP/UA — without them the gateway would attribute the
   * conversion to our own Worker's egress IP/UA (wrong geo, worse Meta EMQ). */
  clientIpAddress?: string;
  clientUserAgent?: string;
  testEventCode?: string;
}

export interface GatewayResult {
  ok: boolean;
  status?: number;
  error?: string;
  retriable?: boolean;
  attempts: number;
}

// Short on purpose: this runs inside the lead request, so a sick gateway must not
// keep the user staring at a spinner. A genuinely lost event is caught by the
// gateway's own zero-conversion alert, not by hammering here.
const DEFAULT_RETRY_DELAYS_MS = [400, 1200];
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function gatewayBaseUrl(env: GatewayEnv): string | undefined {
  const raw = env.SITE_URL;
  return raw ? raw.replace(/\/+$/, '') : undefined;
}

export function isGatewayConfigured(env: GatewayEnv): boolean {
  return Boolean(env.TRACKING_GATEWAY_TOKEN && env.GATEWAY && gatewayBaseUrl(env));
}

/**
 * Consent Mode v2 state from the CookieYes cookie — the SAME source, and the same
 * mapping, the browser lib uses (tracking-kit/lib/gateway.ts `getConsentState`).
 * Reading it server-side means the two legs always agree about the user's choice.
 *
 * CookieYes format:
 *   consentid:..,consent:yes,necessary:yes,analytics:yes,advertisement:yes,...
 * Mapping (CookieYes official):
 *   advertisement → ad_storage + ad_user_data + ad_personalization
 *   analytics     → analytics_storage
 *
 * Returns undefined when the cookie is absent or is not a CookieYes cookie — we do
 * NOT guess. The gateway then applies `require_consent` and fails closed, which is
 * the correct GDPR posture.
 */
export function readConsentFromCookie(cookieHeader: string | null): ConsentState | undefined {
  if (!cookieHeader) return undefined;

  let raw: string | undefined;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === 'cookieyes-consent') {
      raw = decodeURIComponent(part.slice(idx + 1).trim());
      break;
    }
  }
  if (!raw) return undefined;

  const map: Record<string, string> = {};
  for (const part of raw.split(',')) {
    const idx = part.indexOf(':');
    if (idx > 0) map[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  if (map.advertisement === undefined && map.analytics === undefined) return undefined;

  const sig = (yes: boolean): ConsentSignal => (yes ? 'GRANTED' : 'DENIED');
  const adGranted = map.advertisement === 'yes';
  return {
    ad_user_data: sig(adGranted),
    ad_personalization: sig(adGranted),
    ad_storage: sig(adGranted),
    analytics_storage: sig(map.analytics === 'yes'),
  };
}

/**
 * Returns the Meta test-event code iff this lead is the designated synthetic one.
 * Keyed on the lead's address rather than a global "test mode" flag: a global flag
 * (or the gateway's KV `meta.test_event_code`) also catches every REAL lead that
 * arrives while it is on, quietly routing paying conversions into Meta's Test
 * stream. Keyed this way, a real lead can never be diverted.
 */
export function resolveTestEventCode(env: GatewayEnv, email?: string): string | undefined {
  const marker = env.TRACKING_TEST_LEAD_EMAIL?.trim().toLowerCase();
  const code = env.TRACKING_TEST_EVENT_CODE?.trim();
  if (!marker || !code || !email) return undefined;
  return email.trim().toLowerCase() === marker ? code : undefined;
}

/** Drops undefined/empty entries so we never ship blank PII fields. */
function compact(obj: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return out;
}

export function buildGatewayPayload(input: GatewayConversionInput): Record<string, unknown> {
  // CLAUDE.md #3: never send `value: 0` — Meta logs it as a real value and it skews
  // ROAS. Omit value AND currency together when there is no money value.
  const hasValue =
    typeof input.value === 'number' && Number.isFinite(input.value) && input.value > 0;

  const userData = input.userData ? compact(input.userData) : undefined;
  const attribution = input.attribution ? compact(input.attribution) : undefined;

  return compact({
    event_name: input.eventName,
    event_id: input.eventId,
    event_time: Math.floor(Date.now() / 1000),
    lead_id: input.leadId,
    ...(hasValue ? { value: input.value, currency: input.currency || 'HUF' } : {}),
    source: input.source,
    // Meta browser IDs — top-level, PLAIN (the gateway maps them onto the CAPI
    // user_data.fbp/fbc itself; hashing or nesting them here would break dedup).
    fbp: input.fbp,
    fbc: input.fbc,
    user_data: userData && Object.keys(userData).length > 0 ? userData : undefined,
    attribution: attribution && Object.keys(attribution).length > 0 ? attribution : undefined,
    consent: input.consent,
    event_source_url: input.eventSourceUrl,
    client_ip_address: input.clientIpAddress,
    client_user_agent: input.clientUserAgent,
    test_event_code: input.testEventCode,
    // NOTE: no `turnstile_token`. There is no browser in this call path; the
    // per-site X-Admin-Token is what authorises us past the Turnstile gate.
  });
}

export async function sendGatewayConversion(
  env: GatewayEnv,
  input: GatewayConversionInput,
  opts: {
    fetchImpl?: GatewayFetcher['fetch'];
    sleepImpl?: (ms: number) => Promise<void>;
    retryDelaysMs?: number[];
  } = {},
): Promise<GatewayResult> {
  const base = gatewayBaseUrl(env);
  if (!env.TRACKING_GATEWAY_TOKEN || !base || (!env.GATEWAY && !opts.fetchImpl)) {
    return { ok: false, error: 'gateway_not_configured', retriable: false, attempts: 0 };
  }

  const fetchImpl = opts.fetchImpl ?? ((url, init) => env.GATEWAY!.fetch(url, init));
  const sleepImpl = opts.sleepImpl ?? defaultSleep;
  const delays = opts.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;

  // NOT `/api/event/conversion` — that is the BROWSER path, and the one the zone's
  // WAF rate-limiting rule matches. Server-side conversions all leave from a single
  // Worker egress IP, so an IP-keyed limit would throttle exactly the conversions
  // that carry money. The gateway refuses this route without a valid per-site token.
  //
  // We still address the SITE's own hostname (through the service binding): the
  // gateway resolves the tenant from the request hostname (CLAUDE.md #14).
  const url = `${base}/api/event/conversion-server`;
  const body = JSON.stringify(
    buildGatewayPayload({
      ...input,
      testEventCode: input.testEventCode ?? resolveTestEventCode(env, input.userData?.email),
    }),
  );
  const headers = {
    'content-type': 'application/json',
    'x-admin-token': env.TRACKING_GATEWAY_TOKEN,
  };

  let attempts = 0;
  let lastError = 'unknown';
  let lastStatus: number | undefined;

  for (let i = 0; i <= delays.length; i++) {
    attempts++;
    try {
      const res = await fetchImpl(url, { method: 'POST', headers, body });
      lastStatus = res.status;

      // The gateway answers 204 on every accepted event (CLAUDE.md #12).
      if (res.status >= 200 && res.status < 300) {
        return { ok: true, status: res.status, attempts };
      }

      // 400/401/403/404 are OUR misconfiguration (invalid payload — the gateway
      // Run 6 óta 400-at ad hitelesített hívónak —, bad token, no KV site-config),
      // not a transient fault. Retrying cannot fix them — fail loud instead.
      if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) {
        return {
          ok: false,
          status: res.status,
          error: `gateway_rejected_${res.status}`,
          retriable: false,
          attempts,
        };
      }
      lastError = `gateway_status_${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    if (i < delays.length) await sleepImpl(delays[i]);
  }

  return { ok: false, status: lastStatus, error: lastError, retriable: true, attempts };
}
