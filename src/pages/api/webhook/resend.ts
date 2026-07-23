/**
 * Resend webhook — bounce/complaint visibility.
 *
 * Miért létezik: a Resend 200-as válasza CSAK annyit jelent, hogy elfogadta a
 * levelet a saját sorába — NEM azt, hogy a fogadó MTA kézbesítette. A
 * /api/contact `sendAdminEmail` legje ilyenkor resolve-ol, nem fut
 * `reportServerError`, és minden log sikeres submitet mutat, miközben a szalon
 * semmit nem kapott. 2026-07-13-án pontosan ez történt: a `Konzultáció -
 * Farkas Vera` értesítőt az MXroute `550 High scoring spam message has been
 * dropped`-dal eldobta, a lead a CRM-ben ott volt, a szalon postafiókjában nem.
 *
 * Ez az endpoint a hiányzó visszacsatolás:
 *   1. Aláírás-ellenőrzés (Standard Webhooks / svix) — enélkül bárki hamisíthat.
 *   2. `reportServerError` dedikált kóddal → a bounce ugyanoda fut be, ahova az
 *      összes többi pipeline-hiba (soborbo-error-pipeline Tail Worker).
 *   3. Jelzés a CRM lead timeline-ján (`lead_activities` note) → ott látszik,
 *      ahol a szalon ténylegesen dolgozik, nem csak a logban.
 *
 * Beállítás:
 *   - Resend dashboard → Webhooks → endpoint: https://beautyflow.pro/api/webhook/resend
 *     események: email.bounced, email.complained
 *   - `wrangler secret put RESEND_WEBHOOK_SECRET` (a `whsec_…` signing secret)
 *
 * Korreláció: a Resend `email.bounced` payload NEM tartalmazza a custom
 * headereket (csak email_id / message_id / to / subject / bounce / tags), így az
 * `X-Entity-Ref-ID` alapú összekötés nem járható. A leadet ezért a címzettből
 * vezetjük vissza: user-levélnél e-mail-egyezéssel (pontos), admin-értesítőnél a
 * tárgyban lévő névvel + időablakkal (heurisztika). Ha nem sikerül, a bounce
 * akkor is jelentve van — csak CRM-jelzés nélkül.
 */

import type { APIRoute } from 'astro';
import { env as cfEnv } from 'cloudflare:workers';
import { Resend } from 'resend';
import { ERROR_CODES, reportServerError } from '@/lib/errors/codes';

export const prerender = false;

/** A /api/contact admin-értesítőjének címzettje. */
const ADMIN_TO = 'info@beautyflow.pro';

/** Meddig keressük vissza a leadet a levél elküldésének idejétől. */
const LOOKUP_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

const MAX_BODY_BYTES = 64_000;

// ---- Minimal D1 surface (a repo nem húzza be a @cloudflare/workers-types-ot) ----

interface D1Result {
  results?: unknown[];
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<D1Result>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface WebhookEnv {
  RESEND_API_KEY?: string;
  RESEND_WEBHOOK_SECRET?: string;
  /** A beautyflow-crm D1 (uuid 4ce91cdf-…). Opcionális: ha nincs kötve, a
   *  bounce akkor is jelentve van, csak CRM-jelzés nélkül. */
  CRM_DB?: D1Database;
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
    CRM_DB: fromRuntime.CRM_DB as D1Database | undefined,
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

// ---- Helpers -----------------------------------------------------------

/** `escapeSubject` HTML-escape-eli a tárgyat küldéskor — itt visszabontjuk,
 *  hogy a `leads.name` összehasonlítás ne bukjon el egy aposztrófon. */
function unescapeHtml(input: string): string {
  return input
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Az admin-értesítő tárgyából kinyeri a lead nevét.
 *   `Konzultáció - Farkas Vera`              → `Farkas Vera`
 *   `Kapcsolat (Buda) - Farkas Vera`         → `Farkas Vera`
 * Az UTOLSÓ ` - ` mentén vágunk: a locationLabel tartalmazhat kötőjelet, a
 * `{vezetéknév} {keresztnév}` gyakorlatilag soha.
 */
function leadNameFromSubject(subject: string): string | undefined {
  const plain = unescapeHtml(subject).trim();
  const idx = plain.lastIndexOf(' - ');
  if (idx < 0) return undefined;
  const name = plain.slice(idx + 3).trim();
  return name.length >= 3 ? name : undefined;
}

/** A `leads` sor, amelyre a bounce vonatkozik — vagy undefined. */
async function resolveLead(
  db: D1Database,
  data: EmailEventData,
  isAdminNotification: boolean,
): Promise<{ id: string; name: string } | undefined> {
  const sentAt = data.created_at ? Date.parse(data.created_at) : Date.now();
  const since = new Date(
    (Number.isFinite(sentAt) ? sentAt : Date.now()) - LOOKUP_WINDOW_MS,
  )
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z');

  if (!isAdminNotification) {
    // User-visszaigazoló: a címzett MAGA a lead e-mail címe — pontos egyezés.
    const recipient = data.to?.[0];
    if (!recipient) return undefined;
    const row = await db
      .prepare(
        `SELECT id, name FROM leads
          WHERE lower(email) = lower(?1) AND created_at >= ?2
          ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(recipient, since)
      .first<{ id: string; name: string }>();
    return row ?? undefined;
  }

  // Admin-értesítő: a címzett mindig info@ — a tárgyban lévő névvel keresünk.
  const name = data.subject ? leadNameFromSubject(data.subject) : undefined;
  if (!name) return undefined;
  const row = await db
    .prepare(
      `SELECT id, name FROM leads
        WHERE name = ?1 AND source_type = 'form' AND created_at >= ?2
        ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(name, since)
    .first<{ id: string; name: string }>();
  return row ?? undefined;
}

/** Note a lead timeline-jára. Idempotens: a Resend újraküldi a webhookot. */
async function flagLeadInCrm(
  db: D1Database,
  leadId: string,
  emailId: string,
  note: string,
  happenedAt: string,
): Promise<void> {
  const already = await db
    .prepare(
      `SELECT id FROM lead_activities
        WHERE lead_id = ?1 AND type = 'note' AND note LIKE '%' || ?2 || '%'
        LIMIT 1`,
    )
    .bind(leadId, emailId)
    .first<{ id: string }>();
  if (already) return;

  await db
    .prepare(
      `INSERT INTO lead_activities (id, lead_id, type, happened_at, note)
       VALUES (?1, ?2, 'note', ?3, ?4)`,
    )
    .bind(crypto.randomUUID(), leadId, happenedAt, note)
    .run();
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
  const emailId = data.email_id || data.message_id || 'unknown';
  const recipients = data.to ?? [];
  const subject = data.subject ?? '';
  const isAdminNotification = recipients.some(
    (r) => r.toLowerCase().trim() === ADMIN_TO,
  );
  const happenedAt = (payload.created_at || new Date().toISOString()).replace(
    /\.\d{3}Z$/,
    'Z',
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
      emailId,
      to: recipients.join(', '),
      subject,
      bounce: data.bounce
        ? `${data.bounce.type ?? '?'}/${data.bounce.subType ?? '?'}: ${data.bounce.message ?? ''}`
        : '(no bounce detail)',
      isAdminNotification,
    },
    fingerprint: `${code}:${isAdminNotification ? 'admin' : 'user'}`,
  });

  // CRM-jelzés — best effort. A webhookot soha nem buktatjuk el emiatt, mert egy
  // 5xx-re a Resend újraküld, és a hibajelentés fentebb már megtörtént.
  if (env.CRM_DB) {
    try {
      const lead = await resolveLead(env.CRM_DB, data, isAdminNotification);
      if (lead) {
        const note =
          type === 'email.complained'
            ? `⚠️ A címzett spamnek jelölte a kiküldött levelet ("${subject}"). Resend id: ${emailId}`
            : isAdminNotification
              ? `🚨 A SZALON ÉRTESÍTŐJE NEM ÉRKEZETT MEG. A fogadó levelezőszerver visszautasította ("${subject}") — ezt a leadet e-mailben senki nem látta, csak itt. Ok: ${data.bounce?.message ?? 'ismeretlen'} Resend id: ${emailId}`
              : `⚠️ Az érdeklődőnek küldött visszaigazoló nem kézbesíthető ("${subject}") — lehet elgépelt e-mail cím. Ok: ${data.bounce?.message ?? 'ismeretlen'} Resend id: ${emailId}`;
        await flagLeadInCrm(env.CRM_DB, lead.id, emailId, note, happenedAt);
      } else {
        reportServerError({
          code: ERROR_CODES.WEBHOOK_RESEND_LEAD_UNRESOLVED,
          message: 'Bounce received but no matching lead found in CRM',
          source: '/api/webhook/resend',
          request,
          context: { emailId, subject },
        });
      }
    } catch (err) {
      reportServerError({
        code: ERROR_CODES.WEBHOOK_RESEND_LEAD_UNRESOLVED,
        message: 'CRM flagging failed for a bounced email',
        source: '/api/webhook/resend',
        request,
        cause: err,
        context: { emailId, subject },
      });
    }
  }

  return new Response('ok', { status: 200 });
};
