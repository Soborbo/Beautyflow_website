/**
 * Error code registry for beautyflow-website.
 *
 * Codes are consumed by the centralised `soborbo-error-pipeline` notifier
 * (Tail Worker). The notifier resolves severity, throttling, and email
 * routing from the `code` field on each structured log line.
 *
 * Producer-side responsibility is limited to:
 *   1. Defining stable codes here.
 *   2. Emitting `console.error(JSON.stringify({ __pipeline: 'error', code, ... }))`
 *      via `reportServerError()` at known error conditions.
 *
 * Uncaught exceptions are captured automatically by Cloudflare Workers and
 * do not need explicit codes.
 *
 * Code shape: `<DOMAIN>-<SUBJECT>-NNN`
 *   DOMAIN  — coarse category (CONTACT, EMAIL, CONFIG, TRACK, …)
 *   SUBJECT — specific subsystem or failure mode
 *   NNN     — incrementing sequence within the (DOMAIN, SUBJECT) pair
 *
 * Severity + requiredContext for each emitted code live in the catalogue
 * (`./catalogue` → PROJECT_CODES). reportServerError() resolves severity from
 * there and, in dev, warns when a code's requiredContext keys are missing.
 */

import type { ErrorCodeDef, Severity } from './types';
import { ALL_CODES } from './catalogue';

export const ERROR_CODES = {
  // ---- /api/contact -----------------------------------------------------
  /** Resend admin notification email rejected by Resend API. */
  CONTACT_EMAIL_ADMIN_FAILED: 'CONTACT-EMAIL-ADMIN-001',
  /** Resend user confirmation email rejected (admin still got the lead). */
  CONTACT_EMAIL_USER_FAILED: 'CONTACT-EMAIL-USER-001',
  /** Both admin AND user emails failed — lead may be lost. CRITICAL. */
  CONTACT_EMAIL_BOTH_FAILED: 'CONTACT-EMAIL-BOTH-001',
  /** Google Sheets append failed (lead in email + logs, sheet out of sync). */
  CONTACT_SHEETS_APPEND_FAILED: 'CONTACT-SHEETS-001',
  /** RESEND_API_KEY missing at runtime — every submit returns 500. CRITICAL. */
  CONTACT_CONFIG_RESEND_MISSING: 'CONTACT-CONFIG-RESEND-001',
  /** TURNSTILE_SECRET_KEY missing — accepting submits without bot check. */
  CONTACT_CONFIG_TURNSTILE_MISSING: 'CONTACT-CONFIG-TURNSTILE-001',
  /** Turnstile verification rejected a submit (real bot or token expired). */
  CONTACT_TURNSTILE_REJECTED: 'CONTACT-TURNSTILE-001',
  /** Top-level catch in POST handler — bug / unexpected failure path. */
  CONTACT_UNHANDLED: 'CONTACT-UNHANDLED-001',

  // ---- Server-side conversion → Soborbo event-gateway --------------------
  // These are the "leads arrive, Meta sees nothing" codes. They must be loud:
  // every one of them means a delivered lead produced NO conversion, which is
  // invisible in the business's inbox and only shows up as unexplained ad
  // underperformance weeks later.
  /** Gateway misconfigured (service binding / per-site token / SITE_URL missing). */
  GATEWAY_NOT_CONFIGURED: 'GATEWAY-CONFIG-001',
  /** Client sent no event_id — no dedup key, so we refuse to invent one. */
  GATEWAY_NO_EVENT_ID: 'GATEWAY-EVENTID-001',
  /** Gateway rejected or kept failing the conversion dispatch. */
  GATEWAY_DISPATCH_FAILED: 'GATEWAY-DISPATCH-001',

  // ---- /api/boranalizis (bőranalízis kvíz) ------------------------------
  /** TURNSTILE_SECRET_KEY missing — quiz submits rejected (fail closed). */
  QUIZ_CONFIG_TURNSTILE_MISSING: 'QUIZ-CONFIG-TURNSTILE-001',
  /** Turnstile verification rejected a quiz submit. */
  QUIZ_TURNSTILE_REJECTED: 'QUIZ-TURNSTILE-001',
  /** RESEND_API_KEY missing — quiz submits return 500. CRITICAL. */
  QUIZ_CONFIG_RESEND_MISSING: 'QUIZ-CONFIG-RESEND-001',
  /** Both salon AND user emails failed — quiz lead may be lost. CRITICAL. */
  QUIZ_EMAIL_BOTH_FAILED: 'QUIZ-EMAIL-BOTH-001',
  /** Salon notification email failed (user still got the lead + result). */
  QUIZ_EMAIL_ADMIN_FAILED: 'QUIZ-EMAIL-ADMIN-001',
  /** User confirmation/result email failed (salon still notified). */
  QUIZ_EMAIL_USER_FAILED: 'QUIZ-EMAIL-USER-001',
  /** Google Sheets append failed (lead in email + logs, sheet out of sync). */
  QUIZ_SHEETS_APPEND_FAILED: 'QUIZ-SHEETS-001',
  /** KV result store failed — result still in localStorage + email. */
  QUIZ_KV_STORE_FAILED: 'QUIZ-KV-001',
  /** Top-level catch in quiz POST handler — bug / unexpected path. */
  QUIZ_UNHANDLED: 'QUIZ-UNHANDLED-001',

  // ---- /api/meta/capi ---------------------------------------------------
  /** Meta Conversions API mirror request threw — pixel still fires client-side. */
  TRACK_META_CAPI_FAILED: 'TRACK-META-CAPI-001',

  // ---- /api/track/abandonment ------------------------------------------
  /** GA4 Measurement Protocol abandonment beacon failed to forward. */
  TRACK_GA4_ABANDONMENT_FAILED: 'TRACK-GA4-ABANDON-001',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

interface ReportServerErrorInput {
  /** A semantic ERROR_CODES value, or any catalogue code string (e.g. a
   *  classified `RESEND-*` / `SHEETS-*` code from ./classify). The `string`
   *  arm keeps ERROR_CODES autocomplete while allowing catalogue codes. */
  code: ErrorCode | (string & {});
  message: string;
  source: string;
  request?: Request;
  /** Free-form extra context (status codes, payload shape, etc.). */
  context?: Record<string, unknown>;
  /** The original thrown value, if any. */
  cause?: unknown;
  /** Optional fingerprint suffix; defaults to `code`. */
  fingerprint?: string;
}

function stackOf(cause: unknown): string {
  if (cause instanceof Error && typeof cause.stack === 'string') return cause.stack;
  return '';
}

/** Default when a code isn't in the catalogue (shouldn't happen for emitted
 *  codes, but we never want a missing entry to drop the report entirely). */
const DEFAULT_SEVERITY: Severity = 'ERROR';

/**
 * Dev-only guard: surface miswired call sites early. Warns if the code isn't
 * catalogued, or if any of its declared requiredContext keys are missing from
 * the passed context. Stripped from production builds via the import.meta.env
 * .DEV constant (Vite replaces it with `false`, so the block is dead-code
 * eliminated and never runs on Cloudflare).
 */
function assertContextInDev(
  code: string,
  def: ErrorCodeDef | undefined,
  context: Record<string, unknown> | undefined,
): void {
  if (!import.meta.env.DEV) return;
  if (!def) {
    console.warn(`[error-pipeline] code "${code}" is not in the catalogue (ALL_CODES).`);
    return;
  }
  const missing = def.requiredContext.filter((k) => !context || !(k in context));
  if (missing.length > 0) {
    console.warn(
      `[error-pipeline] ${code} reported without requiredContext: ${missing.join(', ')}`,
    );
  }
}

/**
 * Route the structured line to the console method matching its severity, so
 * Cloudflare Workers Observability tags each event with the correct `$level`
 * (queryable / alertable). The previous form sent everything through
 * console.error, which buried INFO/WARN codes in the error stream and made
 * level-based filtering impossible.
 *
 * The `__pipeline: 'error'` marker on the payload is what the
 * soborbo-error-pipeline Tail Worker keys on (level-agnostic), so changing the
 * console method here does not affect downstream email routing.
 */
function writeToObservability(severity: Severity, line: string): void {
  switch (severity) {
    case 'CRITICAL':
    case 'ERROR':
      console.error(line);
      break;
    case 'WARN':
      console.warn(line);
      break;
    case 'INFO':
      console.info(line);
      break;
  }
}

/**
 * Emit one structured log line into Cloudflare Workers Observability that the
 * soborbo-error-pipeline Tail Worker also recognises. Shape matches the
 * notifier's expected schema — server-only fields (userAgent, viewport, …) are
 * sent as empty strings.
 *
 * `severity` is resolved from the catalogue so the line is self-describing and
 * the Observability `$level` matches; the Tail Worker can still re-derive it
 * from `code`, this is additive.
 */
export function reportServerError(input: ReportServerErrorInput): void {
  const { code, message, source, request, context, cause, fingerprint } = input;
  const def = ALL_CODES[code];
  assertContextInDev(code, def, context);
  const severity = def?.severity ?? DEFAULT_SEVERITY;
  const line = JSON.stringify({
    __pipeline: 'error',
    code,
    severity,
    message,
    url: request?.url ?? '',
    source,
    context: context ?? {},
    stack: stackOf(cause),
    ts: new Date().toISOString(),
    requestId: crypto.randomUUID().slice(0, 12),
    fingerprint: fingerprint ?? code,
    pageLoadedAgo: 0,
    userAgent: request?.headers.get('User-Agent') ?? '',
    viewport: '',
    connection: '',
    sessionId: '',
  });
  writeToObservability(severity, line);
}
