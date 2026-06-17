// src/lib/errors/classify.ts
//
// Maps low-level failures (Resend API, Google Sheets, …) to the granular
// catalogue codes (RESEND-*, SHEETS-*) so the error pipeline shows *why* a
// channel failed, not just *that* it failed. Pure functions + typed errors;
// no import from ./codes (would be circular — codes.ts imports the catalogue,
// the report sites import both).

import type { CreateEmailOptions, CreateEmailResponse, Resend } from 'resend';

/** A classified failure: which catalogue code to emit + the context to attach.
 *  The context always carries every key any candidate code lists in its
 *  `requiredContext`, so reportServerError's dev validator never warns. */
export interface ClassifiedReport {
  code: string;
  context: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Email (Resend)
// ---------------------------------------------------------------------------

/** Shape of Resend's `{ error }` response (SDK v6 ErrorResponse). */
interface ResendErrorResponse {
  message: string;
  statusCode: number | null;
  name: string;
}

/**
 * Thrown by `sendEmail()` on ANY send failure. Crucially this includes the
 * case the Resend SDK does NOT throw on: a 4xx/5xx is returned as
 * `{ data: null, error }`, so a bare `await resend.emails.send()` resolves
 * and the failure is invisible to Promise.allSettled. `sendEmail()` converts
 * that into a rejection.
 */
export class EmailSendError extends Error {
  /** Present when Resend returned `{ error }`; absent on a network/throw. */
  readonly resendError?: ResendErrorResponse;
  readonly retryAfter?: string;
  readonly fromAddress?: string;
  constructor(
    message: string,
    opts: { resendError?: ResendErrorResponse; retryAfter?: string; fromAddress?: string; cause?: unknown } = {},
  ) {
    super(message);
    this.name = 'EmailSendError';
    this.resendError = opts.resendError;
    this.retryAfter = opts.retryAfter;
    this.fromAddress = opts.fromAddress;
    if (opts.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause;
  }
}

/**
 * Sends an email and throws on failure — including Resend's non-throwing
 * `{ error }` path. Drop-in for `resend.emails.send(payload)` inside a
 * Promise.allSettled batch.
 */
export async function sendEmail(resend: Resend, payload: CreateEmailOptions): Promise<void> {
  const fromAddress = typeof payload.from === 'string' ? payload.from : undefined;
  let res: CreateEmailResponse;
  try {
    res = await resend.emails.send(payload);
  } catch (err) {
    // Network error / unexpected throw — no structured Resend error.
    throw new EmailSendError(err instanceof Error ? err.message : 'Resend send threw', { fromAddress, cause: err });
  }
  if (res.error) {
    const e = res.error as ResendErrorResponse;
    throw new EmailSendError(e.message || 'Resend API error', {
      resendError: e,
      retryAfter: res.headers?.['retry-after'],
      fromAddress,
    });
  }
}

/** Resend ErrorResponse.name → catalogue code. */
function resendNameToCode(name: string, status: number | null): string {
  switch (name) {
    case 'missing_api_key':
    case 'invalid_api_key':
    case 'restricted_api_key':
    case 'invalid_access':
      return 'RESEND-AUTH-001';
    case 'invalid_from_address':
      return 'RESEND-DOM-002';
    case 'rate_limit_exceeded':
      return 'RESEND-RATE-001';
    case 'daily_quota_exceeded':
    case 'monthly_quota_exceeded':
      return 'RESEND-RATE-002';
    case 'internal_server_error':
    case 'application_error':
      return 'RESEND-SRV-001';
    case 'validation_error':
    case 'invalid_parameter':
    case 'missing_required_field':
    case 'invalid_attachment':
    case 'invalid_idempotency_key':
    case 'invalid_idempotent_request':
    case 'invalid_region':
    case 'not_found':
    case 'method_not_allowed':
    case 'concurrent_idempotent_requests':
    case 'security_error':
      return 'RESEND-PAY-001';
  }
  // Unknown name — fall back on the HTTP status.
  if (status === 401 || status === 403) return 'RESEND-AUTH-001';
  if (status === 429) return 'RESEND-RATE-001';
  if (status != null && status >= 500) return 'RESEND-SRV-001';
  if (status != null && status >= 400) return 'RESEND-PAY-001';
  return 'RESEND-SEND-001';
}

/**
 * Classify an email send rejection (from sendEmail) into a RESEND-* code.
 * `channel` is added to context for triage (admin/user/salon notification).
 */
export function classifyEmailFailure(reason: unknown, channel: 'admin' | 'user' | 'salon'): ClassifiedReport {
  const message = reason instanceof Error ? reason.message : String(reason);
  // Superset context — covers requiredContext of every RESEND-* code we emit.
  const context: Record<string, unknown> = {
    channel,
    statusCode: null,
    attempt: 1,
    errorName: null,
    errorBody: message,
    errorMessage: message,
    keyPrefix: '',
    retryAfter: null,
    fromAddress: null,
    dailySent: null,
  };

  if (reason instanceof EmailSendError) {
    context.fromAddress = reason.fromAddress ?? null;
    context.retryAfter = reason.retryAfter ?? null;
    if (reason.resendError) {
      const { name, statusCode, message: msg } = reason.resendError;
      context.statusCode = statusCode ?? null;
      context.errorName = name;
      context.errorBody = msg;
      context.errorMessage = msg;
      return { code: resendNameToCode(name, statusCode), context };
    }
    // EmailSendError without resendError → network/transport throw.
    return { code: 'RESEND-NET-001', context };
  }

  // Non-EmailSendError rejection — treat as transport failure.
  return { code: 'RESEND-NET-001', context };
}

// ---------------------------------------------------------------------------
// Google Sheets
// ---------------------------------------------------------------------------

/** Thrown by the Sheets helpers, carrying the HTTP status so the failure can
 *  be classified (auth vs not-found vs rate-limit vs Google 5xx). */
export class SheetsCallError extends Error {
  readonly status?: number;
  readonly phase: 'token' | 'metadata' | 'write';
  constructor(message: string, phase: 'token' | 'metadata' | 'write', status?: number) {
    super(message);
    this.name = 'SheetsCallError';
    this.phase = phase;
    this.status = status;
  }
}

/** Classify a Sheets failure into a SHEETS-* code. */
export function classifySheetsFailure(reason: unknown): ClassifiedReport {
  const status = reason instanceof SheetsCallError ? reason.status : undefined;
  const message = reason instanceof Error ? reason.message : String(reason);
  const context: Record<string, unknown> = {
    statusCode: status ?? null,
    sheetId: '',
    sheetName: '',
    errorMessage: message,
    retryAfter: null,
  };
  if (status === 401 || status === 403) return { code: 'SHEETS-AUTH-001', context };
  if (status === 404) return { code: 'SHEETS-API-003', context };
  if (status === 429) return { code: 'SHEETS-API-004', context };
  if (status === 400) return { code: 'SHEETS-API-001', context };
  if (status != null && status >= 500) return { code: 'SHEETS-API-005', context };
  return { code: 'SHEETS-WRITE-001', context };
}
