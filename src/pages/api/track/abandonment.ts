/**
 * Form abandonment beacon endpoint — Astro + Cloudflare Workers.
 * Receives sendBeacon() payloads on pagehide and mirrors to GA4 MP.
 */

import type { APIRoute } from 'astro';
import { env as cfEnv } from 'cloudflare:workers';
import {
  checkRateLimit,
  corsPreflightResponse,
  deriveClientId,
  isAllowedOrigin,
  sendGA4MP,
} from '@/lib/tracking/server';
import { RATE_LIMIT_ABANDONMENT_MAX } from '@/lib/tracking/config';
import { ERROR_CODES, reportServerError } from '@/lib/errors/codes';

export const prerender = false;

const ALLOWED_ORIGINS = new Set<string>([
  'https://beautyflow.pro',
  'https://www.beautyflow.pro',
  'http://localhost:4321',
  'http://127.0.0.1:4321',
  'http://localhost:8788',
]);

const ALLOWED_KEYS = new Set([
  'event_id',
  'session_id',
  'form_name',
  'last_step',
  'last_field',
  'time_spent_seconds',
  'exit_page_path',
  'exit_page_title',
  'exit_page_url',
]);

/** GA4 client_id looks like "1234567890.1234567890". */
function validClientId(v: unknown): v is string {
  return typeof v === 'string' && /^\d+\.\d+$/.test(v);
}

interface AbandonmentPayload {
  form_name?: string;
  last_step?: string;
  last_field?: string;
  time_spent_seconds?: number;
  exit_page_path?: string;
  exit_page_title?: string;
  exit_page_url?: string;
}

function sanitize(input: unknown): AbandonmentPayload {
  if (!input || typeof input !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (typeof v === 'string') out[k] = v.slice(0, 500);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out as AbandonmentPayload;
}

function readEnv(): Record<string, string | undefined> {
  // Astro 6 / @astrojs/cloudflare v13: Worker env via `cloudflare:workers`.
  return cfEnv as Record<string, string | undefined>;
}

export const OPTIONS: APIRoute = async ({ request }) => {
  return corsPreflightResponse(request.headers.get('Origin'), ALLOWED_ORIGINS);
};

export const POST: APIRoute = async (context) => {
  const { request } = context;
  const origin = request.headers.get('Origin');

  if (!isAllowedOrigin(origin, ALLOWED_ORIGINS)) {
    return new Response(null, { status: 204 });
  }

  const ip = request.headers.get('CF-Connecting-IP') || '';
  if (!checkRateLimit(`abandon:${ip}`, RATE_LIMIT_ABANDONMENT_MAX)) {
    return new Response(null, { status: 429 });
  }

  try {
    const raw = (await request.json()) as unknown;
    const payload = sanitize(raw);

    // Prefer the real GA4 client_id the browser sent (from its _ga cookie)
    // so this hit joins the user's existing session and keeps its source.
    // Fall back to an IP+UA-derived id only when the browser couldn't read
    // the cookie — that path still produces an "Unassigned" phantom session.
    const rawClientId = (raw as { client_id?: unknown } | null)?.client_id;
    const ua = request.headers.get('User-Agent') || '';
    const clientId = validClientId(rawClientId)
      ? rawClientId
      : deriveClientId(`${ip}${ua}`.replace(/[^a-f0-9]/gi, '').padEnd(32, '0'));

    const env = readEnv();
    await sendGA4MP(env as Parameters<typeof sendGA4MP>[0], clientId, [
      {
        name: 'form_abandonment',
        // session_id (in params) ties the event to the browser session;
        // engagement_time_msec is required for GA4 to register engagement.
        params: { engagement_time_msec: 1, ...(payload as Record<string, unknown>) },
      },
    ]);
  } catch (err) {
    reportServerError({
      code: ERROR_CODES.TRACK_GA4_ABANDONMENT_FAILED,
      message: 'GA4 abandonment beacon forwarding failed',
      source: '/api/track/abandonment',
      request,
      cause: err,
    });
  }
  return new Response(null, { status: 204 });
};
