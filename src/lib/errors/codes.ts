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
 */

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

  // ---- /api/meta/capi ---------------------------------------------------
  /** Meta Conversions API mirror request threw — pixel still fires client-side. */
  TRACK_META_CAPI_FAILED: 'TRACK-META-CAPI-001',

  // ---- /api/track/abandonment ------------------------------------------
  /** GA4 Measurement Protocol abandonment beacon failed to forward. */
  TRACK_GA4_ABANDONMENT_FAILED: 'TRACK-GA4-ABANDON-001',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

interface ReportServerErrorInput {
  code: ErrorCode;
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

/**
 * Emit one structured log line that the soborbo-error-pipeline Tail Worker
 * recognises. Shape matches the notifier's expected schema — server-only
 * fields (userAgent, viewport, …) are sent as empty strings.
 */
export function reportServerError(input: ReportServerErrorInput): void {
  const { code, message, source, request, context, cause, fingerprint } = input;
  console.error(
    JSON.stringify({
      __pipeline: 'error',
      code,
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
    }),
  );
}
