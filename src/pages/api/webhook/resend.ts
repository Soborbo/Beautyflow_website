/**
 * Resend webhook — bounce/complaint láthatóság.
 *
 * Miért létezik: a Resend 200-as válasza CSAK annyit jelent, hogy elfogadta a
 * levelet a saját sorába — NEM azt, hogy a fogadó MTA kézbesítette. A
 * /api/contact `sendAdminEmail` legje ilyenkor resolve-ol, nem fut
 * `reportServerError`, és minden log sikeres submitet mutat, miközben a szalon
 * semmit nem kapott. 2026-07-13-án pontosan ez történt: a `Konzultáció -
 * Farkas Vera` értesítőt az MXroute `550 High scoring spam message has been
 * dropped`-dal eldobta, a lead a CRM-ben ott volt, a szalon postafiókjában nem.
 *
 * Ez az endpoint azt a különbséget teszi láthatóvá: a bounce ugyanoda fut be,
 * ahova az összes többi pipeline-hiba (soborbo-error-pipeline Tail Worker).
 *
 * Beállítás:
 *   - Resend dashboard → Webhooks → endpoint: https://beautyflow.pro/api/webhook/resend
 *     események: email.bounced, email.complained
 *   - `wrangler secret put RESEND_WEBHOOK_SECRET` (a `whsec_…` signing secret)
 *
 * A jelentés a leadet a TÁRGYBÓL azonosíthatóan írja ki (`Konzultáció - {név}`),
 * mert a Resend bounce-payload nem tartalmaz custom headert — csak email_id /
 * message_id / to / subject / bounce / tags —, így az `X-Entity-Ref-ID` alapú
 * összekötés nem járható.
 */

import type { APIRoute } from 'astro';
import { env as cfEnv } from 'cloudflare:workers';
import { Resend } from 'resend';
import { ERROR_CODES, reportServerError } from '@/lib/errors/codes';

export const prerender = false;

/** A /api/contact admin-értesítőjének címzettje. */
const ADMIN_TO = 'info@beautyflow.pro';

const MAX_BODY_BYTES = 64_000;

interface WebhookEnv {
  RESEND_API_KEY?: string;
  RESEND_WEBHOOK_SECRET?: string;
}

function readEnv(): WebhookEnv {
  const fromRuntime = cfEnv as Record<string, unknown>;
  const pick = (key: string): string | undefined =>
    (fromRuntime[key] as string | undefined) ||
    (typeof process !== 'undefined' && process.env ? process.env[key] : undefined) ||
    (import.meta.env as Record<string, string | undefined>)[key];
  return {
    RESEND_API_KEY: pick('RESEND_API_KEY'),
    RESEND_WEBHOOK_SECRET: pick('RESEND_WEBHOOK_SECRET'),
  };
}

// ---- Payload shape (csak amit használunk) ------------------------------

interface BounceDetail {
  message?: string;
  subType?: string;
  type?: string;
}
interface EmailEventData {
  email_id?: string;
  message_id?: string;
  created_at?: string;
  from?: string;
  to?: string[];
  subject?: string;
  bounce?: BounceDetail;
}
interface WebhookPayload {
  type?: string;
  created_at?: string;
  data?: EmailEventData;
}

// ---- Handler -----------------------------------------------------------

export const POST: APIRoute = async ({ request }) => {
  const env = readEnv();

  if (!env.RESEND_WEBHOOK_SECRET) {
    reportServerError({
      code: ERROR_CODES.WEBHOOK_RESEND_CONFIG_MISSING,
      message: 'RESEND_WEBHOOK_SECRET not configured — bounce events cannot be verified',
      source: '/api/webhook/resend',
      request,
    });
    // 503 → a Resend újrapróbálja, amint a secret bekerül.
    return new Response('webhook not configured', { status: 503 });
  }

  const contentLength = Number(request.headers.get('Content-Length') || '0');
  if (contentLength > MAX_BODY_BYTES) {
    return new Response('payload too large', { status: 413 });
  }

  // Az aláírás a NYERS bytefolyamra megy — parse csak utána.
  const raw = await request.text();
  const h = request.headers;
  const id = h.get('svix-id') || h.get('webhook-id');
  const timestamp = h.get('svix-timestamp') || h.get('webhook-timestamp');
  const signature = h.get('svix-signature') || h.get('webhook-signature');
  if (!id || !timestamp || !signature) {
    return new Response('missing signature headers', { status: 400 });
  }

  let payload: WebhookPayload;
  try {
    const resend = new Resend(env.RESEND_API_KEY);
    payload = resend.webhooks.verify({
      payload: raw,
      headers: { id, timestamp, signature },
      webhookSecret: env.RESEND_WEBHOOK_SECRET,
    }) as WebhookPayload;
  } catch {
    // Nem jelentjük hibaként: egy hamisított POST nem a mi üzemzavarunk.
    return new Response('invalid signature', { status: 401 });
  }

  const type = payload.type;
  if (type !== 'email.bounced' && type !== 'email.complained') {
    return new Response('ignored', { status: 200 });
  }

  const data = payload.data ?? {};
  const recipients = data.to ?? [];
  const subject = data.subject ?? '';
  const isAdminNotification = recipients.some(
    (r) => r.toLowerCase().trim() === ADMIN_TO,
  );

  const code =
    type === 'email.complained'
      ? ERROR_CODES.WEBHOOK_RESEND_COMPLAINED
      : isAdminNotification
        ? ERROR_CODES.WEBHOOK_RESEND_ADMIN_BOUNCED
        : ERROR_CODES.WEBHOOK_RESEND_USER_BOUNCED;

  reportServerError({
    code,
    message:
      type === 'email.complained'
        ? `Recipient marked "${subject}" as spam`
        : `Delivery FAILED for "${subject}" — Resend accepted it, the receiving MTA did not`,
    source: '/api/webhook/resend',
    request,
    context: {
      emailId: data.email_id || data.message_id || 'unknown',
      to: recipients.join(', '),
      // A tárgy tartalmazza a lead nevét (`Konzultáció - {vezetéknév} {keresztnév}`),
      // ez a kapocs a CRM-beli lead felé.
      subject,
      bounce: data.bounce
        ? `${data.bounce.type ?? '?'}/${data.bounce.subType ?? '?'}: ${data.bounce.message ?? ''}`
        : '(no bounce detail)',
      isAdminNotification,
    },
    fingerprint: `${code}:${isAdminNotification ? 'admin' : 'user'}`,
  });

  return new Response('ok', { status: 200 });
};
