/**
 * Hírlevél feliratkozás API — a NewsletterModal beküldését kezeli.
 *
 * Pipeline:
 *   1. Rate limit (per-IP) + Content-Length cap
 *   2. JSON parse + honeypot (némán „sikerül")
 *   3. Könnyű validáció (keresztnév ≥2, érvényes email, kiválasztott szalon)
 *   4. EmailOctopus v2 API → kontakt létrehozása a kiválasztott szalon listáján
 *
 * Szalonválasztás: a modalban a látogató EGY szalont választ (rádiógomb), és
 * annak a listájába kerül. Két külön EmailOctopus lista („Budai vendégek" /
 * „Pesti vendégek"), mert a kampányok is onnan mennek.
 *
 * Env (Cloudflare dashboard / wrangler):
 *   EMAILOCTOPUS_API_KEY      — v2 API kulcs (SECRET, `wrangler secret put`) [kötelező]
 *   EMAILOCTOPUS_LIST_ID_BUDA — a budai lista azonosítója (nem titok)        [kötelező]
 *   EMAILOCTOPUS_LIST_ID_PEST — a pesti lista azonosítója (nem titok)        [kötelező]
 *
 * A modal 18 mp után jön fel, és honeypot + rate limit véd a botok ellen —
 * ehhez a form-hoz NEM kérünk Turnstile-t (alacsony súrlódású feliratkozás).
 */

import type { APIRoute } from 'astro';
import { env as cfEnv } from 'cloudflare:workers';
import { reportServerError } from '@/lib/errors/codes';
import { checkRateLimit, RATE_LIMIT_CONTACT_MAX } from '@/lib/forms/rate-limit';
import { subscribeContact } from '@/lib/forms/emailoctopus';

export const prerender = false;

const MAX_BODY_BYTES = 8_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A választható szalonok — a modal ugyanezeket a kulcsokat küldi. */
const SALONS = ['buda', 'pest'] as const;
type Salon = (typeof SALONS)[number];

const SALON_LABEL: Record<Salon, string> = {
  buda: 'Beautyflow Buda',
  pest: 'Beautyflow Pest',
};

interface NewsletterEnv {
  EMAILOCTOPUS_API_KEY?: string;
  EMAILOCTOPUS_LIST_ID_BUDA?: string;
  EMAILOCTOPUS_LIST_ID_PEST?: string;
}

function readEnv(): NewsletterEnv {
  const fromRuntime = cfEnv as Record<string, unknown>;
  const pick = (key: string): string | undefined =>
    (fromRuntime[key] as string | undefined) ||
    (typeof process !== 'undefined' && process.env ? process.env[key] : undefined) ||
    (import.meta.env as Record<string, string | undefined>)[key];
  return {
    EMAILOCTOPUS_API_KEY: pick('EMAILOCTOPUS_API_KEY'),
    EMAILOCTOPUS_LIST_ID_BUDA: pick('EMAILOCTOPUS_LIST_ID_BUDA'),
    EMAILOCTOPUS_LIST_ID_PEST: pick('EMAILOCTOPUS_LIST_ID_PEST'),
  };
}

function listIdFor(env: NewsletterEnv, salon: Salon): string | undefined {
  return salon === 'buda' ? env.EMAILOCTOPUS_LIST_ID_BUDA : env.EMAILOCTOPUS_LIST_ID_PEST;
}

function json(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ok = (extra: Record<string, unknown> = {}) => json(200, { success: true, ...extra });
const fail = (status: number, error: string) => json(status, { success: false, error });

export const POST: APIRoute = async ({ request }) => {
  try {
    const ip = request.headers.get('CF-Connecting-IP') || '';
    if (!checkRateLimit(`newsletter:${ip}`, RATE_LIMIT_CONTACT_MAX)) {
      reportServerError({
        code: 'HTTP-429-001',
        message: 'Newsletter rate limit hit',
        source: '/api/newsletter',
        request,
        context: { endpoint: '/api/newsletter', ip },
      });
      return fail(429, 'Túl sok próbálkozás. Kérjük várj egy percet, majd próbáld újra.');
    }

    if (Number(request.headers.get('Content-Length') || '0') > MAX_BODY_BYTES) {
      return fail(413, 'A kérés túl nagy.');
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'Érvénytelen kérés formátum.');
    }
    const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

    // Honeypot — láthatatlan mező; ha ki van töltve, némán „sikerül".
    if (typeof b.website === 'string' && b.website.trim() !== '') {
      return ok();
    }

    const firstName = String(b.firstName ?? '').trim();
    const email = String(b.email ?? '').trim().toLowerCase();

    if (firstName.length < 2) {
      return fail(400, 'Kérjük add meg a keresztneved.');
    }
    if (!email || email.length > 320 || !EMAIL_RE.test(email)) {
      return fail(400, 'Kérjük adj meg egy érvényes email címet.');
    }

    // Szalonválasztás — pontosan egy. A `salons` tömb csak a régi, cache-elt
    // modal-JS miatt van itt (akkor még checkbox volt): az elsőt vesszük belőle.
    const rawSalon = typeof b.salon === 'string'
      ? b.salon
      : Array.isArray(b.salons)
        ? String(b.salons[0] ?? '')
        : '';
    const salon = SALONS.find((s) => s === rawSalon);

    if (!salon) {
      return fail(400, 'Kérjük válaszd ki, melyik szalon híreire szeretnél feliratkozni.');
    }

    const env = readEnv();
    const missingVar = !env.EMAILOCTOPUS_API_KEY
      ? 'EMAILOCTOPUS_API_KEY'
      : !listIdFor(env, salon)
        ? `EMAILOCTOPUS_LIST_ID_${salon.toUpperCase()}`
        : null;

    if (missingVar) {
      reportServerError({
        code: 'SRV-ENV-001',
        message: 'EmailOctopus env not configured (API key / list id missing)',
        source: '/api/newsletter',
        request,
        context: { varName: missingVar, functionPath: '/api/newsletter' },
      });
      return fail(503, 'A feliratkozás átmenetileg nem elérhető. Kérjük próbáld újra később.');
    }

    const result = await subscribeContact({
      apiKey: env.EMAILOCTOPUS_API_KEY as string,
      listId: listIdFor(env, salon) as string,
      email,
      firstName: firstName.slice(0, 100),
    });

    if (!result.ok) {
      reportServerError({
        code: 'HTTP-500-002',
        message: `EmailOctopus subscribe failed (${SALON_LABEL[salon]})`,
        source: '/api/newsletter',
        request,
        context: {
          endpoint: '/api/newsletter',
          dependency: 'emailoctopus',
          depError: `${salon} ${result.status} ${result.code || ''} ${result.message}`.trim(),
        },
      });
      return fail(502, 'A feliratkozás most nem sikerült. Kérjük próbáld újra később.');
    }

    return ok({ salon, alreadySubscribed: result.alreadySubscribed });
  } catch (err) {
    reportServerError({
      code: 'SRV-FUNC-001',
      message: err instanceof Error ? err.message : 'Unknown newsletter error',
      source: '/api/newsletter',
      request,
      cause: err,
      context: { functionPath: '/api/newsletter', errorMessage: err instanceof Error ? err.message : String(err) },
    });
    return fail(500, 'Hiba történt a feliratkozás közben. Kérjük próbáld újra később.');
  }
};
