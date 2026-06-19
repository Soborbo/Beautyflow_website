/**
 * Meta Conversions API mirror — Astro + Cloudflare Workers.
 * Mirror of browser Meta Pixel events for dedup via `event_id`.
 */

import type { APIRoute } from 'astro';
import { env as cfEnv } from 'cloudflare:workers';
import {
  checkRateLimit,
  corsPreflightResponse,
  isAllowedOrigin,
  isValidConversionValue,
  isValidCurrency,
  isValidEventId,
  isValidEmail,
  isValidFbc,
  isValidFbp,
  metaCapiConsentAllowed,
  pickEventSourceUrl,
  sendMetaCapi,
  type MetaCapiEvent,
} from '@/lib/tracking/server';
import { DEFAULT_COUNTRY, RATE_LIMIT_CAPI_MAX } from '@/lib/tracking/config';
import { ERROR_CODES, reportServerError } from '@/lib/errors/codes';

export const prerender = false;

const ALLOWED_ORIGINS = new Set<string>([
  'https://beautyflow.pro',
  'https://www.beautyflow.pro',
  'http://localhost:4321',
  'http://127.0.0.1:4321',
  'http://localhost:8788',
]);

const ALLOWED_EVENTS = new Set(['Lead', 'Contact', 'ViewContent', 'InitiateCheckout']);

const EVENT_TIME_MIN_AGE_S = 24 * 60 * 60;
const EVENT_TIME_FUTURE_S = 5 * 60;

interface IncomingPayload {
  event_name?: string;
  event_id?: string;
  event_time?: number;
  event_source_url?: string;
  user_data?: Record<string, unknown>;
  custom_data?: Record<string, unknown>;
  consent_state?: Record<string, unknown>;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function clampEventTime(input: unknown): number {
  const now = Math.floor(Date.now() / 1000);
  if (typeof input !== 'number' || !Number.isFinite(input)) return now;
  if (input < now - EVENT_TIME_MIN_AGE_S) return now;
  if (input > now + EVENT_TIME_FUTURE_S) return now;
  return Math.floor(input);
}

function sanitizeCustomData(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (isValidConversionValue(input.value)) out.value = input.value;
  if (isValidCurrency(input.currency)) out.currency = input.currency;
  if (typeof input.content_name === 'string' && input.content_name.length <= 200) {
    out.content_name = input.content_name;
  }
  return out;
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
  if (!checkRateLimit(`capi:${ip}`, RATE_LIMIT_CAPI_MAX)) {
    return new Response(null, { status: 429 });
  }

  try {
    const body = (await request.json()) as IncomingPayload;

    if (!body || !isValidEventId(body.event_id)) {
      return new Response(JSON.stringify({ error: 'invalid event_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (typeof body.event_name !== 'string' || !ALLOWED_EVENTS.has(body.event_name)) {
      return new Response(JSON.stringify({ error: 'event_name not allowed' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!metaCapiConsentAllowed(body.consent_state)) {
      return new Response(null, { status: 204 });
    }

    const ua = request.headers.get('User-Agent') || undefined;
    const incomingUserData = isPlainObject(body.user_data) ? body.user_data : {};
    const incomingCustom = isPlainObject(body.custom_data) ? body.custom_data : {};

    const userData: NonNullable<MetaCapiEvent['user_data']> = {};
    if (isValidEmail(incomingUserData.email)) userData.email = incomingUserData.email as string;
    if (typeof incomingUserData.phone_number === 'string' && incomingUserData.phone_number.length <= 32) {
      userData.phone_number = incomingUserData.phone_number;
    }
    if (typeof incomingUserData.first_name === 'string' && incomingUserData.first_name.length <= 100) {
      userData.first_name = incomingUserData.first_name;
    }
    if (typeof incomingUserData.last_name === 'string' && incomingUserData.last_name.length <= 100) {
      userData.last_name = incomingUserData.last_name;
    }
    if (typeof incomingUserData.city === 'string' && incomingUserData.city.length <= 100) {
      userData.city = incomingUserData.city;
    }
    if (typeof incomingUserData.postal_code === 'string' && incomingUserData.postal_code.length <= 20) {
      userData.postal_code = incomingUserData.postal_code;
    }
    userData.country = typeof incomingUserData.country === 'string' && incomingUserData.country.length === 2
      ? incomingUserData.country
      : DEFAULT_COUNTRY;
    if (isValidFbp(incomingUserData.fbp)) userData.fbp = incomingUserData.fbp as string;
    if (isValidFbc(incomingUserData.fbc)) userData.fbc = incomingUserData.fbc as string;
    if (ua) userData.client_user_agent = ua.slice(0, 500);
    if (ip) userData.client_ip_address = ip;

    const event: MetaCapiEvent = {
      event_name: body.event_name,
      event_id: body.event_id,
      event_time: clampEventTime(body.event_time),
      action_source: 'website',
      user_data: userData,
      custom_data: sanitizeCustomData(incomingCustom),
    };
    const sourceUrl = pickEventSourceUrl(
      body.event_source_url,
      request.headers.get('Referer'),
      ALLOWED_ORIGINS,
    );
    if (sourceUrl) event.event_source_url = sourceUrl;

    const env = readEnv();
    await sendMetaCapi(env as Parameters<typeof sendMetaCapi>[0], [event], { countryCode: DEFAULT_COUNTRY });
  } catch (err) {
    reportServerError({
      code: ERROR_CODES.TRACK_META_CAPI_FAILED,
      message: 'Meta Conversions API mirror request failed',
      source: '/api/meta/capi',
      request,
      cause: err,
    });
  }

  return new Response(null, { status: 204 });
};
