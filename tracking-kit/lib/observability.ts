/**
 * Observability — STABLE diagnostic codes.
 *
 * Tracking fails silently and expensively: a broken dispatch or a leaked PII key
 * is invisible until conversions quietly drop days later. So every notable
 * condition is reported with a stable code, three ways:
 *   1. console (error/warn always; info only in diag-debug) — visible in the browser
 *   2. a ring buffer at `window.__sbTrackingDiag` (last 50) — scrape it from a probe
 *   3. a DOM CustomEvent `sb-tracking-diagnostic` — forward to your error pipeline
 *      (e.g. the `error-pipeline` skill → Tail Worker → throttled email)
 *
 * If a future change breaks a leg, the matching code fires and you SEE it.
 */

export type DiagSeverity = 'info' | 'warn' | 'error';

interface CodeDef { code: string; severity: DiagSeverity; message: string }

export const TRACKING_CODES = {
  // 1xxx — gateway / worker connection
  GATEWAY_OK:              { code: 'TRK-1000', severity: 'info',  message: 'Gateway dispatch sent' },
  GATEWAY_NETWORK_FAIL:    { code: 'TRK-1002', severity: 'error', message: 'Gateway POST failed (network/transport)' },
  GATEWAY_BEACON_FALLBACK: { code: 'TRK-1003', severity: 'info',  message: 'sendBeacon unavailable/failed; used fetch keepalive' },
  // A gateway ezt az eventet a bongeszo-utrol 403-mal dobna (TRK-400-017) — a
  // site backendjenek kell kuldenie a hitelesitett szerver-ingressen. Hangos,
  // mert kulonben a konverzio ugy vesz el, hogy a dispatch sikeresnek latszik.
  GATEWAY_SERVER_INGRESS_ONLY: { code: 'TRK-1005', severity: 'warn', message: 'Event is server-ingress-only; the browser leg must not dispatch it' },
  // 3xxx — data integrity
  PII_IN_DATALAYER:        { code: 'TRK-3001', severity: 'error', message: 'PII-shaped key blocked from a dataLayer push' },
} as const satisfies Record<string, CodeDef>;

export type TrackingCodeKey = keyof typeof TRACKING_CODES;
export type TrackingCode = (typeof TRACKING_CODES)[TrackingCodeKey]['code'];

export interface TrackingDiagnostic {
  code: TrackingCode;
  severity: DiagSeverity;
  message: string;
  context?: Record<string, unknown>;
  ts: number;
}

const RING_MAX = 50;
const DIAG_EVENT = 'sb-tracking-diagnostic';
let diagDebug = false;

/** Turn on info-level console output for diagnostics (enabled by ?debugTracking=1). */
export function enableDiagDebug(): void { diagDebug = true; }

function ring(): TrackingDiagnostic[] {
  const w = window as unknown as { __sbTrackingDiag?: TrackingDiagnostic[] };
  if (!w.__sbTrackingDiag) w.__sbTrackingDiag = [];
  return w.__sbTrackingDiag;
}

/**
 * A konzol-ag KULON FUGGVENY, es a `severity` PARAMETERKENT erkezik.
 *
 * Miert: a Turnstile-kodok kivezetesevel (2026-08-28) elfogyott az utolso
 * 'warn' bejegyzes a tablabol, es a literal-union leszukulesetol a warn-ag
 * „lehetetlen osszehasonlitas" tipushibat adna. A helyes valasz NEM az ag
 * torlese — az a kovetkezo warn-kodot csendben a diag-debug moge rejtene —,
 * hanem hogy a dontes a szeles `DiagSeverity`-n tortenjen. Egy parameter nem
 * szukul a kezdoertekere, egy `const` viszont igen.
 */
function logToConsole(severity: DiagSeverity, line: string, context?: Record<string, unknown>): void {
  if (severity === 'error') console.error(line, context ?? '');
  else if (severity === 'warn') console.warn(line, context ?? '');
  else if (diagDebug) console.log(line, context ?? '');
}

/** Emit a coded diagnostic. Returns the record (handy in tests). */
export function report(key: TrackingCodeKey, context?: Record<string, unknown>): TrackingDiagnostic {
  const def = TRACKING_CODES[key];
  const diag: TrackingDiagnostic = {
    code: def.code, severity: def.severity, message: def.message, context,
    ts: typeof Date !== 'undefined' ? Date.now() : 0,
  };

  // 1) console — errors/warnings always; info only under diag-debug.
  logToConsole(def.severity, `[tracking] ${def.code} ${def.message}`, context);

  if (typeof window !== 'undefined') {
    // 2) ring buffer (bounded)
    const buf = ring();
    buf.push(diag);
    if (buf.length > RING_MAX) buf.splice(0, buf.length - RING_MAX);
    // 3) CustomEvent for the site's error pipeline — only for real problems
    //    (info is throughput heartbeat; don't spam the pipeline with it).
    if (def.severity !== 'info') {
      try { window.dispatchEvent(new CustomEvent(DIAG_EVENT, { detail: diag })); } catch { /* */ }
    }
  }
  return diag;
}

/** Read the recent diagnostics ring (newest last). */
export function getDiagnostics(): TrackingDiagnostic[] {
  return typeof window !== 'undefined' ? [...ring()] : [];
}

/** Clear the diagnostics ring. */
export function clearDiagnostics(): void {
  if (typeof window !== 'undefined') (window as unknown as { __sbTrackingDiag?: TrackingDiagnostic[] }).__sbTrackingDiag = [];
}

// ── PII guard (data integrity) ──────────────────────────────────────
// Name-based guard: PII must never reach the dataLayer (it goes to the hidden
// side-channel instead). This is the defense-in-depth net behind events.ts —
// if a future change pushes a PII-shaped key, it's stripped AND reported (TRK-3001).
export const PII_DATALAYER_KEYS: ReadonlySet<string> = new Set([
  'email', 'phone', 'phone_number', 'user_provided_data', 'user_data',
  'first_name', 'last_name', 'name', 'street', 'city', 'postal_code', 'postcode',
  // Meta Advanced Matching short codes
  'em', 'ph', 'fn', 'ln',
]);

/** Delete any PII-shaped keys from `data` IN PLACE; return the names removed. */
export function redactPii(data: Record<string, unknown>): string[] {
  const leaked = Object.keys(data).filter((k) => PII_DATALAYER_KEYS.has(k));
  for (const k of leaked) delete data[k];
  return leaked;
}
