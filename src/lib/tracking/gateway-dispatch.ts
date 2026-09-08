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
  /**
   * A site AKTUÁLIS consent-policy verziója (a böngésző-oldali
   * `PUBLIC_TRACKING_POLICY_VERSION` párja, pl. `2026-08-a`). CSAK a saját CMP-t
   * futtató (`provider: sbo`) site-on van szerepe.
   *
   * MIÉRT KELL BEÁLLÍTANI: enélkül a szerver-láb elfogadna egy olyan „igen"-t,
   * amit egy KORÁBBI tájékoztató-szövegre adtak, miközben a böngésző-láb
   * ugyanattól a sütitől újrakérdez — a két láb ugyanarról a látogatóról mást
   * gondolna. Hiánya nem hiba (CookieYes alatt nincs is értelme), de sbo-ra
   * váltáskor nyitva hagy egy csendes eltérést.
   */
  TRACKING_POLICY_VERSION?: string;
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
  /**
   * Fazis D telemetria -- lasd `buildConsentSources`. CSAK diagnosztika: semmilyen
   * kaput nem befolyasol. A hivo adja at: `buildConsentSources(cookieHeader)`.
   */
  consentSources?: ConsentSourcesPayload;
  /**
   * CMP Fázis 2: a döntés-lánc azonosítója (`readSboConsentCookieHeader`
   * `.consentId`) → `consent_receipts.consent_id`. Az offline/replay ág ezen
   * keresztül oldja fel a `consent_log` AKTUÁLIS állapotát. CookieYes alatt a
   * süti nem létezik → `undefined`, a mező ki sem megy (a receipten NULL).
   */
  consentId?: string;
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
 * ── A SÜTI-DEKÓDOLÁS KÉT DEGRADÁCIÓJA ────────────────────────────────────────
 * Ugyanaz a hibás percent-kódolás két HELYEN mást kell jelentsen. Egy dobás
 * bármelyik ágon 500-as választ adna a beküldött űrlapra — vagyis elveszett
 * leadet egy elrontott süti miatt.
 *
 *   KAPU (`readConsentFromCookie`, `readSboConsentCookieHeader`)
 *       „Milyen hozzájárulásra HIVATKOZHATUNK?" Egy sérült stringből engedélyt
 *       kiolvasni találgatás. Ezért `undefined`/`null` → a gateway a
 *       `require_consent`-re esik vissza és FAIL CLOSED.
 *
 *   TELEMETRIA (`buildConsentSources`)
 *       „MIT LÁTTUNK?" Itt az eldobás információt semmisít meg: egy hosszú süti
 *       egyetlen hibás escape-je miatt elveszne a mellette álló, tökéletesen
 *       olvasható `advertisement:yes`. A dekódolatlan string RENDSZERINT
 *       ugyanúgy parse-olható, ezért a telemetria a NYERS értékre esik vissza.
 */
function safeDecodeCookieValue(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

/** A TELEMETRIA dekódolója: hibás kódolásra a NYERS értéket adja, nem dob és nem ejt. */
function decodeCookieValueLossy(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export interface SboCookieConsent {
  consentId: string;
  analytics: boolean;
  marketing: boolean;
  revision: number;
  decidedAtSec: number;
  /** MELYIK tájékoztató-szöveghez adta a hozzájárulást (v2 mező). */
  policyVersion: string;
}

/**
 * A süti maximális kora másodpercben — a böngésző-lib `SBO_CONSENT_MAX_AGE_S`
 * tükörértéke (180 nap, ICO-ajánlás). A max-age a böngészőben él; egy kézzel
 * visszaírt vagy átvitt süti attól még „frissnek" látszana a szerveren.
 */
export const SBO_CONSENT_MAX_AGE_S = 180 * 24 * 60 * 60;

export interface SboCookieReadOptions {
  /**
   * Ha megadod, a süti policy-verziójának EGYEZNIE kell vele — különben `null`
   * (nincs döntés). A site a saját `PUBLIC_TRACKING_POLICY_VERSION`-jét adja át.
   */
  expectedPolicyVersion?: string;
  /** Tesztelhetőség; alapból a jelen. */
  nowSec?: number;
}

/**
 * CMP Fázis 2 — a saját `sbo_consent` süti szerveroldali olvasata a form-POST
 * Cookie headeréből.
 *
 * ── MIÉRT KÉZZEL DUPLIKÁLT, ÉS MIÉRT HIÁNYZOTT ───────────────────────────────
 * Ez a modul SITE-fájl, önállóan másolódik, tehát nem importálhatja a
 * böngésző-lib `tracking-kit/lib/consent-sbo-state.ts`-ét — kézzel duplikált
 * párja annak. A fork-migráció után a böngésző-láb BITRE KANONIKUS lett és
 * ismeri az `sbo_consent` sütit; ez a szerver-láb viszont EGYÁLTALÁN NEM
 * ismerte, csak a `cookieyes-consent`-et.
 *
 * Következmény a `PUBLIC_TRACKING_CONSENT_PROVIDER=sbo` átállítás NAPJÁN: a
 * böngésző `sbo_consent`-et ír, a CookieYes sütije eltűnik, a szerver-láb
 * SEMMILYEN döntést nem talál → `require_consent: true` mellett fail-closed
 * kihagyja a hirdetési platformokat — némán, MINDEN form-POST konverzión.
 *
 * Négy szabályban kell egyeznie a böngésző-libbel: (1) v2 formátum,
 * (2) policy-verzió egyezés, (3) LEJÁRAT, (4) decision↔kategória konzisztencia.
 * A `tracking-kit/tests/consent-backend-parity.test.ts` UGYANAZON a
 * fixture-táblán futtatja a két parsert, tehát a szétcsúszás nem ismételhető
 * meg némán.
 *
 * A `v1`-es sütit SZÁNDÉKOSAN elutasítjuk — pont úgy, ahogy a böngésző-lib.
 */
export function readSboConsentCookieHeader(
  cookieHeader: string | null | undefined,
  opts: SboCookieReadOptions = {}
): SboCookieConsent | null {
  if (!cookieHeader) return null;
  let raw: string | undefined;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === 'sbo_consent') {
      raw = safeDecodeCookieValue(part.slice(idx + 1).trim());
      break;
    }
  }
  if (!raw) return null;
  const p = raw.split('.');
  if (p.length !== 8 || p[0] !== 'v2') return null;
  if ((p[1] !== '0' && p[1] !== '1') || (p[2] !== '0' && p[2] !== '1')) return null;
  const revision = parseInt(p[3], 10);
  if (!Number.isInteger(revision) || revision < 1 || revision > 10_000 || String(revision) !== p[3]) {
    return null;
  }
  if (!['accept_all', 'reject_all', 'custom', 'withdrawn'].includes(p[4])) return null;
  if (!/^[A-Za-z0-9_:-]{8,64}$/.test(p[5])) return null;
  const decidedAtSec = parseInt(p[6], 10);
  if (!Number.isInteger(decidedAtSec) || decidedAtSec <= 0 || String(decidedAtSec) !== p[6]) {
    return null;
  }
  if (!/^[A-Za-z0-9_:-]{1,64}$/.test(p[7])) return null;
  const policyVersion = p[7];
  // A policy-verzió eltérése NEM „régi, de jó" döntés: más szöveghez adták.
  if (opts.expectedPolicyVersion !== undefined && policyVersion !== opts.expectedPolicyVersion) {
    return null;
  }
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  if (now - decidedAtSec > SBO_CONSENT_MAX_AGE_S) return null;
  const analytics = p[1] === '1';
  const marketing = p[2] === '1';
  // A decision és a kategóriák egymásból következnek — az ellentmondó sütit
  // eldobjuk, ugyanazzal az elvvel, ahogy a gateway 400-at ad rá.
  const matches =
    p[4] === 'accept_all'
      ? analytics && marketing
      : p[4] === 'custom'
        ? analytics !== marketing
        : !analytics && !marketing;
  if (!matches) return null;
  return { consentId: p[5], analytics, marketing, revision, decidedAtSec, policyVersion };
}

/**
 * Consent Mode v2 state — the SAME source, and the same
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
export function readConsentFromCookie(
  cookieHeader: string | null,
  opts: SboCookieReadOptions = {}
): ConsentState | undefined {
  if (!cookieHeader) return undefined;

  // CMP Fázis 2: ha a kérésen ott a SAJÁT `sbo_consent` süti (provider='sbo'),
  // az a döntés forrása — a párhuzamos mérési ablakban a CookieYes sütije is
  // jelen lehet, de a site-ot már a saját CMP hajtja. CookieYes alatt a süti nem
  // létezik → az ág bitre a mai.
  const sbo = readSboConsentCookieHeader(cookieHeader, opts);
  if (sbo) {
    const sig = (yes: boolean): ConsentSignal => (yes ? 'GRANTED' : 'DENIED');
    return {
      ad_user_data: sig(sbo.marketing),
      ad_personalization: sig(sbo.marketing),
      ad_storage: sig(sbo.marketing),
      analytics_storage: sig(sbo.analytics),
    };
  }

  let raw: string | undefined;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === 'cookieyes-consent') {
      raw = safeDecodeCookieValue(part.slice(idx + 1).trim());
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

/**
 * A SZERVER-LAB verzioja, ahogy a ledgernek jelentjuk.
 *
 * MIERT CSAK A SZERVER-LAB. A bongeszo-lab a VENDOROLT `tracking-kit/`-ben el,
 * es a §3.3 szerint a vendorolt fajlba irt site-patch garantaltan elveszik --
 * oda a verzio-jelentes a fork-migracioval jon (a kit `package.json`-je 5.0.0-t
 * mond, mikozben 6.4.x-korabeli kodot visz, es a sodrodas KETIRANYU). EZ A FAJL
 * viszont SITE-fajl (`src/lib/tracking/`), nem a kit resze -- ide biztonsagos.
 *
 * MIERT NEM SIMA SEMVER. Kanonikus semvert (`6.6.5`) irni ide ugyanaz a
 * hazugsag lenne, ami a kit `package.json`-jet merhetetlenne teszi. A `6.6.4`
 * elotag azt allitja, ameddig ez a SZERVER-lab atvezetest kapott (a hibas
 * consent-suti ne 500-azza a lead-vegpontot, #66) -- semmi tobbet.
 *
 * MIERT `-` ES NEM `+`. A gateway KET uton olvas verziot:
 *
 *   routes/conversion.ts -> parseConsentSources()  ELNEZO (32 karakterre vag)
 *   routes/consent.ts    -> parseConsentPayload()  SZIGORU, es a
 *                           `VERSION_RE = /^[A-Za-z0-9_.-]{1,64}$/` NEM engedi
 *                           a `+`-t -> a bejegyzest ELDOBJA
 *
 * Ma csak az elso uton kuldunk, tehat a `+` atmenne -- a sajat CMP-re valo
 * atallas utan viszont CSENDBEN veszne el a consent-log.
 *
 * MIERT NEM `0.0.0-…`. Az `isClientLibVersionBelow` `[0,0,0]`-t olvasna ki ->
 * MINDEN receiptre tuzelne a TRK-910-006. Ez MERT teny: a painless atmeneti
 * `0.0.0-painless-fork` jelolese adta a TRK-910-006 EGYETLEN tuzeleset 30 nap
 * alatt (5 talalat), mig a trapez `6.6.4-trapezlemezes-fork`-ja ures
 * `finding_codes`-szal erkezik.
 */
export const BACKEND_LIB_VERSION = '6.6.8-beautyflow-fork';

/** Egy consent-forras pillanatkepe. `null` = a forras NEM volt elerheto. */
export interface ConsentSourceSnapshot {
  analytics: boolean | null;
  marketing: boolean | null;
}

export interface ConsentSourcesPayload {
  cookie: ConsentSourceSnapshot;
  api: ConsentSourceSnapshot;
  source_used: 'cookieyes_cookie' | 'sbo_cookie' | 'none';
  client_lib_version: string;
  /** A döntés kora másodpercben — CSAK `sbo_consent` alatt (a süti timestampet hordoz). */
  consent_age_s?: number;
}

/**
 * Fazis D consent-telemetria a SZERVER-labon.
 *
 * Az `api` snapshot itt MINDIG „nem elerheto", es ez nem hiany: nincs bongeszo
 * ebben a hivasi utban, tehat a CookieYes JS API-jat fogalmilag nem lehet
 * olvasni. A `null` ezt mondja ki -- a `false` azt allitana, hogy az API nemet
 * mondott, ami hazugsag lenne.
 *
 * Diagnosztika, nem kapu: SEMMILYEN dontest nem befolyasol. Sosem dob, es a
 * dekodolasa LOSSY -- a KAPU (`readConsentFromCookie`) ugyanarra a sutire
 * fail-closed marad. Egy telemetria-mezo nem buktathat leadet.
 */
export function buildConsentSources(
  cookieHeader: string | null,
  opts: SboCookieReadOptions = {}
): ConsentSourcesPayload {
  const unavailable: ConsentSourceSnapshot = { analytics: null, marketing: null };

  // CMP Fázis 2: `sbo_consent` alatt a döntést a saját süti hajtja (source_used
  // + consent_age_s), de a CookieYes-snapshot VÁLTOZATLANUL kitöltődik, ha a
  // sütije jelen van — a párhuzamos mérési ablak receipt-oldali evidenciája.
  const sbo = readSboConsentCookieHeader(cookieHeader, opts);
  const sboAge = sbo
    ? Math.max(0, Math.floor(Date.now() / 1000) - sbo.decidedAtSec)
    : undefined;

  let raw: string | undefined;
  if (cookieHeader) {
    for (const part of cookieHeader.split(';')) {
      const idx = part.indexOf('=');
      if (idx < 0) continue;
      if (part.slice(0, idx).trim() !== 'cookieyes-consent') continue;
      raw = decodeCookieValueLossy(part.slice(idx + 1).trim());
      break;
    }
  }

  if (!raw) {
    return {
      cookie: unavailable,
      api: unavailable,
      source_used: sbo ? 'sbo_cookie' : 'none',
      client_lib_version: BACKEND_LIB_VERSION,
      consent_age_s: sboAge,
    };
  }

  const map: Record<string, string> = {};
  for (const part of raw.split(',')) {
    const idx = part.indexOf(':');
    if (idx > 0) map[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  const cookie: ConsentSourceSnapshot = {
    analytics: map.analytics === undefined ? null : map.analytics === 'yes',
    marketing: map.advertisement === undefined ? null : map.advertisement === 'yes',
  };
  const present = cookie.analytics !== null || cookie.marketing !== null;

  return {
    cookie,
    api: unavailable,
    source_used: sbo ? 'sbo_cookie' : present ? 'cookieyes_cookie' : 'none',
    client_lib_version: BACKEND_LIB_VERSION,
    consent_age_s: sboAge,
  };
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
    consent_sources: input.consentSources,
    // CMP Fázis 2: a consent-lánc azonosítója → consent_receipts.consent_id.
    consent_id: input.consentId,
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
