/**
 * Contact API — handles both:
 *   - formType: 'consultation'  →  the 4-step calculator on /ingyenes-konzultacio
 *   - formType: 'location'      →  the per-salon contact form on Buda/Pest pages
 *
 * Pipeline:
 *   1. Parse + honeypot + time check (light validation)
 *   2. Cloudflare Turnstile (server-verified, fail closed)
 *   3. Field validation (email, phone, consent, etc.)
 *   4. Resend → admin notification (info@beautyflow.pro)
 *   5. Resend → user confirmation (Fanni's voice, HU/EN)
 *   6. Google Sheets append (best-effort, optional)
 *
 * Env vars (set on Cloudflare dashboard or via wrangler secret put):
 *   RESEND_API_KEY               — required
 *   TURNSTILE_SECRET_KEY         — required (Turnstile blocks all traffic without it)
 *   GOOGLE_SHEETS_ID             — optional
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL — optional
 *   GOOGLE_PRIVATE_KEY           — optional
 */

import type { APIRoute } from 'astro';
import { env as cfEnv } from 'cloudflare:workers';
import { Resend } from 'resend';
import { verifyTurnstile } from '@/lib/forms/turnstile';
import { escapeHtml, escapeSubject } from '@/lib/forms/sanitize';
import { ERROR_CODES, reportServerError } from '@/lib/errors/codes';
import { sendEmail, classifyEmailFailure, classifySheetsFailure, SheetsCallError } from '@/lib/errors/classify';
import { checkRateLimit } from '@/lib/tracking/server';
import { RATE_LIMIT_CONTACT_MAX } from '@/lib/tracking/config';

export const prerender = false;

// ---- Constants ---------------------------------------------------------

const ADMIN_TO = 'info@beautyflow.pro';
const ADMIN_FROM = 'Beautyflow <info@beautyflow.pro>';
const USER_FROM_HU = 'Kónya Fanni - Beautyflow <info@beautyflow.pro>';
const USER_FROM_EN = 'Fanni Kónya - Beautyflow <info@beautyflow.pro>';

const treatmentNamesHu: Record<string, string> = {
  lezer: 'Dióda Lézeres Szőrtelenítés',
  hydra: 'HydraBeauty Arckezelés',
  smink: 'Tartós Sminktetoválás',
  carbon: 'Carbon Peeling',
  tetovalas: 'Lézeres Tetoválás Eltávolítás',
  pigment: 'Pigmentfolt Eltávolítás',
};
const treatmentNamesEn: Record<string, string> = {
  lezer: 'Diode Laser Hair Removal',
  hydra: 'HydraBeauty Facial Treatment',
  smink: 'Permanent Makeup',
  carbon: 'Carbon Peeling',
  tetovalas: 'Laser Tattoo Removal',
  pigment: 'Pigmentation Removal',
};

// ---- Payload types -----------------------------------------------------

type FormType = 'consultation' | 'location';

interface BaseFormData {
  formType: FormType;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  consent: boolean;
  website?: string; // honeypot
  turnstileToken?: string;
  lang?: 'hu' | 'en';
  // tracking
  gclid?: string;
  fbclid?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

interface ConsultationFormData extends BaseFormData {
  formType: 'consultation';
  treatments: string[];
}

interface LocationFormData extends BaseFormData {
  formType: 'location';
  locationId: 'buda' | 'pest';
  locationLabel: string;
  message?: string;
}

type ContactFormData = ConsultationFormData | LocationFormData;

// ---- Validators --------------------------------------------------------

function isValidEmail(email: string): boolean {
  return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Server-side caps — the client `maxlength` attributes are advisory
 *  only; a hand-crafted JSON body bypasses them. Oversized fields flow
 *  into email bodies and the Sheets API, so reject early. */
const MAX_LENGTHS = {
  firstName: 100,
  lastName: 100,
  phone: 32,
  message: 2000,
  locationLabel: 50,
  treatmentId: 50,
} as const;
const MAX_TREATMENTS = 10;
const MAX_BODY_BYTES = 50_000;

function isValidPhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  return /^(\+36|06|36)?[0-9]{9}$/.test(cleaned);
}

function formatTimestamp(): string {
  return new Date().toLocaleString('hu-HU', {
    timeZone: 'Europe/Budapest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---- Env access (Workers + Pages compatible) --------------------------

interface RuntimeEnv {
  RESEND_API_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  GOOGLE_SHEETS_ID?: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
  GOOGLE_PRIVATE_KEY?: string;
}

function readEnv(): RuntimeEnv {
  // Astro 6 + @astrojs/cloudflare v13 expose Workers bindings/vars/secrets via
  // the `cloudflare:workers` module (the old locals.runtime.env throws now).
  const fromRuntime = cfEnv as Record<string, string | undefined>;

  // Fall back to process.env (Node dev) / import.meta.env (Vite build) so
  // local `astro dev` works without `wrangler dev`.
  const pickEnv = (key: keyof RuntimeEnv): string | undefined =>
    fromRuntime[key] ||
    (typeof process !== 'undefined' && process.env ? process.env[key] : undefined) ||
    (import.meta.env as Record<string, string | undefined>)[key];

  return {
    RESEND_API_KEY: pickEnv('RESEND_API_KEY'),
    TURNSTILE_SECRET_KEY: pickEnv('TURNSTILE_SECRET_KEY'),
    GOOGLE_SHEETS_ID: pickEnv('GOOGLE_SHEETS_ID'),
    GOOGLE_SERVICE_ACCOUNT_EMAIL: pickEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
    GOOGLE_PRIVATE_KEY: pickEnv('GOOGLE_PRIVATE_KEY'),
  };
}

// ---- Email senders -----------------------------------------------------

async function sendAdminEmail(resend: Resend, data: ContactFormData): Promise<void> {
  const lang = data.lang || 'hu';
  const langLabel = lang === 'en' ? 'EN' : 'HU';
  const timestamp = formatTimestamp();

  const fullName = `${data.lastName} ${data.firstName}`;
  let subject: string;
  let topic: string;

  if (data.formType === 'consultation') {
    subject = `Konzultáció - ${fullName}`;
    topic =
      data.treatments
        .map((t) => treatmentNamesHu[t] || t)
        .join(', ') || '(nincs megadva)';
  } else {
    subject = `Kapcsolat (${data.locationLabel}) - ${fullName}`;
    topic = data.message
      ? data.message
      : '(üzenet nélkül)';
  }

  const safeSubject = escapeSubject(subject);

  const sourcePage =
    data.formType === 'location' ? data.locationLabel : 'Ingyenes konzultáció kalkulátor';

  const utmString = [data.utm_source, data.utm_medium, data.utm_campaign]
    .filter(Boolean)
    .join(' / ');

  const textBody = `
Új érdeklődés érkezett!

Időpont: ${timestamp}
Nyelv: ${langLabel}
Forrás: ${sourcePage}

Érdeklődő adatai:
- Név: ${fullName}
- Telefon: ${data.phone}
- Email: ${data.email}

Tárgy:
${topic}

${utmString ? `Marketing: ${utmString}\n` : ''}${data.gclid ? `gclid: ${data.gclid}\n` : ''}${data.fbclid ? `fbclid: ${data.fbclid}\n` : ''}
---
Automatikus üzenet a beautyflow.pro weboldalról.
`.trim();

  const htmlBody = `
<!DOCTYPE html>
<html lang="hu">
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #c53f75;">Új érdeklődés érkezett</h2>
  <p style="color: #666; font-size: 13px;">${escapeHtml(timestamp)} · ${escapeHtml(langLabel)} · ${escapeHtml(sourcePage)}</p>
  <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; width: 120px;">Név</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(fullName)}</td></tr>
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Telefon</td><td style="padding: 8px; border-bottom: 1px solid #eee;"><a href="tel:${escapeHtml(data.phone)}">${escapeHtml(data.phone)}</a></td></tr>
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Email</td><td style="padding: 8px; border-bottom: 1px solid #eee;"><a href="mailto:${escapeHtml(data.email)}">${escapeHtml(data.email)}</a></td></tr>
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;vertical-align:top;">Tárgy</td><td style="padding: 8px; border-bottom: 1px solid #eee; white-space: pre-wrap;">${escapeHtml(topic)}</td></tr>
    ${utmString ? `<tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Marketing</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(utmString)}</td></tr>` : ''}
    ${data.gclid ? `<tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">gclid</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(data.gclid)}</td></tr>` : ''}
    ${data.fbclid ? `<tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">fbclid</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(data.fbclid)}</td></tr>` : ''}
  </table>
  <p style="color: #999; font-size: 12px; margin-top: 24px; border-top: 1px solid #eee; padding-top: 12px;">Automatikus üzenet a beautyflow.pro weboldalról.</p>
</body>
</html>
`.trim();

  await sendEmail(resend, {
    from: ADMIN_FROM,
    replyTo: data.email,
    to: ADMIN_TO,
    subject: safeSubject,
    headers: {
      'X-Entity-Ref-ID': `admin-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    },
    text: textBody,
    html: htmlBody,
  });
}

async function sendUserEmail(resend: Resend, data: ContactFormData): Promise<void> {
  const isEnglish = data.lang === 'en';
  const uniqueId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const firstNameSafe = escapeHtml(data.firstName);

  // Topic line we echo back so the user sees what we received
  let topicLine = '';
  if (data.formType === 'consultation') {
    const names = isEnglish ? treatmentNamesEn : treatmentNamesHu;
    const list = data.treatments.map((t) => names[t] || t).join(', ');
    topicLine = list
      ? isEnglish
        ? `Topic of interest: ${list}`
        : `Érdeklődés tárgya: ${list}`
      : '';
  } else {
    topicLine = isEnglish
      ? `Location: ${data.locationLabel}`
      : `Helyszín: ${data.locationLabel}`;
  }

  if (isEnglish) {
    await sendEmail(resend, {
      from: USER_FROM_EN,
      replyTo: ADMIN_TO,
      to: data.email,
      subject: 'We received your inquiry — Beautyflow',
      headers: { 'X-Entity-Ref-ID': uniqueId },
      text: `
Dear ${data.firstName},

Thank you for reaching out to Beautyflow. We received your message and we'll get back to you as soon as possible.

${topicLine}

Opening hours (Beautyflow Buda & Pest):
Mon–Fri: 08:00 – 20:00
Sat: 10:00 – 20:00
Sun: 10:00 – 19:00

If your matter is urgent, please call us at +36 1 300 9414.

Best regards,
Fanni Kónya
Founder of Beautyflow
`.trim(),
      html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto;">
  <p>Dear ${firstNameSafe},</p>
  <p>Thank you for reaching out to Beautyflow. We received your message and we'll get back to you as soon as possible.</p>
  ${topicLine ? `<p style="color:#666;">${escapeHtml(topicLine)}</p>` : ''}
  <h3 style="color:#c53f75; margin-top: 24px;">Opening hours</h3>
  <table style="font-size: 14px;">
    <tr><td style="padding-right: 12px;">Mon–Fri</td><td>08:00 – 20:00</td></tr>
    <tr><td style="padding-right: 12px;">Sat</td><td>10:00 – 20:00</td></tr>
    <tr><td style="padding-right: 12px;">Sun</td><td>10:00 – 19:00</td></tr>
  </table>
  <p style="margin-top: 20px;">If your matter is urgent, please call us at <a href="tel:+3613009414" style="color:#c53f75;">+36 1 300 9414</a>.</p>
  <p style="margin-top: 24px;">Best regards,<br><strong>Fanni Kónya</strong><br><span style="color:#c53f75;">Founder of Beautyflow</span></p>
</body>
</html>
`.trim(),
    });
    return;
  }

  await sendEmail(resend, {
    from: USER_FROM_HU,
    replyTo: ADMIN_TO,
    to: data.email,
    subject: 'Köszönjük a megkeresést – Beautyflow',
    headers: { 'X-Entity-Ref-ID': uniqueId },
    text: `
Kedves ${data.firstName}!

Köszönjük a megkeresést. Üzenetedet megkaptuk és igyekszünk mielőbb válaszolni.

${topicLine}

Nyitvatartás (Beautyflow Buda és Pest):
Hétfő–Péntek: 08:00 – 20:00
Szombat: 10:00 – 20:00
Vasárnap: 10:00 – 19:00

Sürgős ügyben hívj minket a +36 1 300 9414 számon.

Üdvözlettel,
Kónya Fanni
a Beautyflow alapítója
`.trim(),
    html: `
<!DOCTYPE html>
<html lang="hu">
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto;">
  <p>Kedves ${firstNameSafe}!</p>
  <p>Köszönjük a megkeresést. Üzenetedet megkaptuk és igyekszünk mielőbb válaszolni.</p>
  ${topicLine ? `<p style="color:#666;">${escapeHtml(topicLine)}</p>` : ''}
  <h3 style="color:#c53f75; margin-top: 24px;">Nyitvatartás</h3>
  <table style="font-size: 14px;">
    <tr><td style="padding-right: 12px;">Hétfő–Péntek</td><td>08:00 – 20:00</td></tr>
    <tr><td style="padding-right: 12px;">Szombat</td><td>10:00 – 20:00</td></tr>
    <tr><td style="padding-right: 12px;">Vasárnap</td><td>10:00 – 19:00</td></tr>
  </table>
  <p style="margin-top: 20px;">Sürgős ügyben hívj minket a <a href="tel:+3613009414" style="color:#c53f75;">+36 1 300 9414</a> számon.</p>
  <p style="margin-top: 24px;">Üdvözlettel,<br><strong>Kónya Fanni</strong><br><span style="color:#c53f75;">a Beautyflow alapítója</span></p>
</body>
</html>
`.trim(),
  });
}

// ---- Google Sheets (optional, best-effort) ----------------------------

interface GoogleEnv {
  sheetId?: string;
  serviceAccountEmail?: string;
  privateKey?: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < len ? bytes[i + 1] : 0;
    const b3 = i + 2 < len ? bytes[i + 2] : 0;
    result += chars[b1 >> 2];
    result += chars[((b1 & 3) << 4) | (b2 >> 4)];
    result += i + 1 < len ? chars[((b2 & 15) << 2) | (b3 >> 6)] : '=';
    result += i + 2 < len ? chars[b3 & 63] : '=';
  }
  return result;
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  let len = base64.length;
  if (base64[len - 1] === '=') len--;
  if (base64[len - 1] === '=') len--;
  const bytes = new Uint8Array((len * 3) >> 2);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const c1 = lookup[base64.charCodeAt(i)];
    const c2 = lookup[base64.charCodeAt(i + 1)];
    const c3 = i + 2 < len ? lookup[base64.charCodeAt(i + 2)] : 0;
    const c4 = i + 3 < len ? lookup[base64.charCodeAt(i + 3)] : 0;
    bytes[p++] = (c1 << 2) | (c2 >> 4);
    if (i + 2 < len) bytes[p++] = ((c2 & 15) << 4) | (c3 >> 2);
    if (i + 3 < len) bytes[p++] = ((c3 & 3) << 6) | c4;
  }
  return bytes;
}

function base64UrlEncode(str: string): string {
  return bytesToBase64(new TextEncoder().encode(str))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  return bytesToBase64(new Uint8Array(buffer))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function importPrivateKey(pemKey: string): Promise<CryptoKey> {
  const normalizedKey = pemKey.replace(/\\n/g, '\n').replace(/\\\\n/g, '\n').trim();
  const pemContents = normalizedKey
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/[\s\r\n]/g, '');
  const bytes = base64ToBytes(pemContents);
  return crypto.subtle.importKey(
    'pkcs8',
    bytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function createGoogleJWT(serviceAccountEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccountEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const key = await importPrivateKey(privateKey);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signatureInput),
  );
  return `${signatureInput}.${arrayBufferToBase64Url(signature)}`;
}

async function getGoogleAccessToken(serviceAccountEmail: string, privateKey: string): Promise<string> {
  const jwt = await createGoogleJWT(serviceAccountEmail, privateKey);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!response.ok) throw new SheetsCallError(`Token failed: ${await response.text()}`, 'token', response.status);
  return (await response.json() as { access_token: string }).access_token;
}

// Row 1 is a header; we insert new submissions at row 2 so newest stays on top.
// 0-indexed for the Sheets API → 1 means "before row 2 in 1-indexed view".
const INSERT_ROW_INDEX_ZERO_BASED = 1;

async function getSheetGid(sheetId: string, accessToken: string, tabName: string): Promise<number> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties(sheetId,title)`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new SheetsCallError(`Sheets metadata error: ${await response.text()}`, 'metadata', response.status);
  const body = (await response.json()) as {
    sheets?: { properties?: { sheetId?: number; title?: string } }[];
  };
  const sheet = body.sheets?.find((s) => s.properties?.title === tabName);
  if (!sheet?.properties?.sheetId && sheet?.properties?.sheetId !== 0) {
    throw new SheetsCallError(`Sheet tab "${tabName}" not found`, 'metadata', 404);
  }
  return sheet.properties.sheetId!;
}

async function writeToGoogleSheet(data: ContactFormData, env: GoogleEnv): Promise<void> {
  if (!env.sheetId || !env.serviceAccountEmail || !env.privateKey) {
    return;
  }
  const accessToken = await getGoogleAccessToken(env.serviceAccountEmail, env.privateKey);
  const langLabel = data.lang === 'en' ? 'EN' : 'HU';

  // Column B aligns with the booking system's "treatment" column:
  //   - consultation form → list of selected treatments
  //   - location form     → "Kapcsolat – <Helyszín>"  (e.g. "Kapcsolat – Beautyflow Buda")
  const treatmentCol =
    data.formType === 'consultation'
      ? data.treatments.map((t) => treatmentNamesHu[t] || t).join(', ')
      : `Kapcsolat – ${data.locationLabel}`;

  const message = data.formType === 'location' ? data.message || '' : '';
  const utm = [data.utm_source, data.utm_medium, data.utm_campaign].filter(Boolean).join(' / ');

  const rowValues: string[] = [
    formatTimestamp(),     // A
    treatmentCol,          // B
    data.lastName,         // C
    data.firstName,        // D
    data.phone,            // E
    data.email,            // F
    langLabel,             // G
    message,               // H
    data.gclid || '',      // I
    data.fbclid || '',     // J
    utm,                   // K
    data.utm_content || '',// L
    data.utm_term || '',   // M
  ];

  const gid = await getSheetGid(env.sheetId, accessToken, 'Sheet1');

  // Single atomic batchUpdate:
  //   1. insertDimension — shift everything down to make room at row 2
  //   2. updateCells     — fill the new row (stringValue ≈ RAW: no formula
  //                        evaluation, so user input starting with =/+/-/@
  //                        can't inject formulas)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.sheetId}:batchUpdate`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          insertDimension: {
            range: {
              sheetId: gid,
              dimension: 'ROWS',
              startIndex: INSERT_ROW_INDEX_ZERO_BASED,
              endIndex: INSERT_ROW_INDEX_ZERO_BASED + 1,
            },
            inheritFromBefore: false,
          },
        },
        {
          updateCells: {
            rows: [{
              values: rowValues.map((v) => ({
                userEnteredValue: { stringValue: String(v) },
              })),
            }],
            fields: 'userEnteredValue',
            start: {
              sheetId: gid,
              rowIndex: INSERT_ROW_INDEX_ZERO_BASED,
              columnIndex: 0,
            },
          },
        },
      ],
    }),
  });
  if (!response.ok) throw new SheetsCallError(`Sheets error: ${await response.text()}`, 'write', response.status);
}

// ---- Handler -----------------------------------------------------------

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async (context) => {
  const { request } = context;
  try {
    const ip = request.headers.get('CF-Connecting-IP') || '';

    // Per-IP rate limit (in-memory, per-isolate — see lib/tracking/server).
    // Turnstile is the primary bot gate; this caps raw request floods.
    if (!checkRateLimit(`contact:${ip}`, RATE_LIMIT_CONTACT_MAX)) {
      return jsonError(429, 'Túl sok kérés. Kérjük várj egy percet, majd próbáld újra.');
    }

    const contentLength = Number(request.headers.get('Content-Length') || '0');
    if (contentLength > MAX_BODY_BYTES) {
      return jsonError(413, 'A kérés túl nagy.');
    }

    let data: ContactFormData;
    try {
      data = (await request.json()) as ContactFormData;
    } catch {
      return jsonError(400, 'Érvénytelen kérés formátum.');
    }

    // Honeypot — silently succeed
    if (data.website) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const env = readEnv();

    // Turnstile — fail CLOSED: a missing secret means a misconfigured
    // deploy, and silently accepting unverified submissions would turn a
    // config mistake into an open spam channel. Local dev gets a
    // Turnstile test secret via .dev.vars.
    if (!env.TURNSTILE_SECRET_KEY) {
      reportServerError({
        code: ERROR_CODES.CONTACT_CONFIG_TURNSTILE_MISSING,
        message: 'TURNSTILE_SECRET_KEY not configured — rejecting all submits (fail closed)',
        source: '/api/contact',
        request,
      });
      return jsonError(503, 'A küldés átmenetileg nem elérhető. Kérjük hívj minket: +36 1 300 9414');
    }
    {
      const result = await verifyTurnstile(data.turnstileToken || '', env.TURNSTILE_SECRET_KEY, ip || undefined);
      if (!result.success) {
        reportServerError({
          code: ERROR_CODES.CONTACT_TURNSTILE_REJECTED,
          message: 'Turnstile verification rejected submit',
          source: '/api/contact',
          request,
          context: { errors: result.errors, formType: data.formType },
        });
        // Granular: network failure to the verify API vs genuine token reject.
        const turnNetwork = (result.errors || []).includes('network-error');
        reportServerError({
          code: turnNetwork ? 'TURN-VERIFY-003' : 'TURN-VERIFY-001',
          message: turnNetwork ? 'Turnstile verify API unreachable' : 'Turnstile server verification failed',
          source: '/api/contact',
          request,
          context: { errorCodes: result.errors ?? [], errorMessage: (result.errors ?? []).join(', ') },
        });
        return jsonError(400, 'Robot-ellenőrzés sikertelen. Kérjük frissítsd az oldalt és próbáld újra.');
      }
    }

    // Type-specific field requirements
    if (data.formType === 'consultation') {
      if (!Array.isArray(data.treatments) || data.treatments.length === 0) {
        return jsonError(400, 'Kérjük válassz legalább egy kezelést.');
      }
      if (
        data.treatments.length > MAX_TREATMENTS ||
        data.treatments.some((t) => typeof t !== 'string' || t.length > MAX_LENGTHS.treatmentId)
      ) {
        return jsonError(400, 'Érvénytelen kezelés lista.');
      }
    } else if (data.formType === 'location') {
      if (!data.locationId || !['buda', 'pest'].includes(data.locationId)) {
        return jsonError(400, 'Érvénytelen helyszín.');
      }
      if (typeof data.locationLabel !== 'string' || data.locationLabel.length > MAX_LENGTHS.locationLabel) {
        return jsonError(400, 'Érvénytelen helyszín megnevezés.');
      }
      if (data.message && (typeof data.message !== 'string' || data.message.length > MAX_LENGTHS.message)) {
        return jsonError(400, 'Az üzenet túl hosszú (legfeljebb 2000 karakter).');
      }
    } else {
      return jsonError(400, 'Ismeretlen űrlap típus.');
    }

    if (!data.firstName || data.firstName.trim().length < 2 || data.firstName.length > MAX_LENGTHS.firstName) {
      return jsonError(400, 'Kérjük add meg a keresztneved.');
    }
    if (!data.lastName || data.lastName.trim().length < 2 || data.lastName.length > MAX_LENGTHS.lastName) {
      return jsonError(400, 'Kérjük add meg a vezetékneved.');
    }
    if (typeof data.phone !== 'string' || data.phone.length > MAX_LENGTHS.phone || !isValidPhone(data.phone)) {
      return jsonError(400, 'Kérjük adj meg egy érvényes telefonszámot.');
    }
    if (!isValidEmail(data.email)) {
      return jsonError(400, 'Kérjük adj meg egy érvényes email címet.');
    }
    if (!data.consent) {
      return jsonError(400, 'Az adatvédelmi szabályzat elfogadása kötelező.');
    }

    if (!env.RESEND_API_KEY) {
      reportServerError({
        code: ERROR_CODES.CONTACT_CONFIG_RESEND_MISSING,
        message: 'RESEND_API_KEY not configured — every submit returns 500',
        source: '/api/contact',
        request,
      });
      return jsonError(500, 'Email szolgáltatás nem elérhető. Kérjük hívj minket: +36 1 300 9414');
    }
    const resend = new Resend(env.RESEND_API_KEY);

    const googleEnv: GoogleEnv = {
      sheetId: env.GOOGLE_SHEETS_ID,
      serviceAccountEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      privateKey: env.GOOGLE_PRIVATE_KEY,
    };

    const results = await Promise.allSettled([
      sendAdminEmail(resend, data),
      sendUserEmail(resend, data),
      writeToGoogleSheet(data, googleEnv),
    ]);

    const adminResult = results[0];
    const userResult = results[1];
    const sheetResult = results[2];

    const bothEmailsFailed =
      adminResult.status === 'rejected' && userResult.status === 'rejected';

    if (bothEmailsFailed) {
      reportServerError({
        code: ERROR_CODES.CONTACT_EMAIL_BOTH_FAILED,
        message: 'Resend admin AND user emails both failed — lead may be lost',
        source: '/api/contact',
        request,
        cause: (adminResult as PromiseRejectedResult).reason,
        context: {
          formType: data.formType,
          adminReason: String((adminResult as PromiseRejectedResult).reason),
          userReason: String((userResult as PromiseRejectedResult).reason),
          lead: {
            name: `${data.lastName} ${data.firstName}`,
            email: data.email,
            phone: data.phone,
          },
        },
        fingerprint: `${ERROR_CODES.CONTACT_EMAIL_BOTH_FAILED}:${data.formType}`,
      });
    } else {
      if (adminResult.status === 'rejected') {
        reportServerError({
          code: ERROR_CODES.CONTACT_EMAIL_ADMIN_FAILED,
          message: 'Resend admin notification email failed',
          source: '/api/contact',
          request,
          cause: adminResult.reason,
          context: { formType: data.formType },
        });
      }
      if (userResult.status === 'rejected') {
        reportServerError({
          code: ERROR_CODES.CONTACT_EMAIL_USER_FAILED,
          message: 'Resend user confirmation email failed',
          source: '/api/contact',
          request,
          cause: userResult.reason,
          context: { formType: data.formType },
        });
      }
    }

    // Granular provider classification (the "why" behind a channel failure).
    // Fingerprint defaults to the code, so admin+user failing for the same
    // root cause dedupe to one pipeline notification.
    if (adminResult.status === 'rejected') {
      const c = classifyEmailFailure(adminResult.reason, 'admin');
      reportServerError({ code: c.code, message: 'Contact admin email — Resend failure', source: '/api/contact', request, cause: adminResult.reason, context: c.context });
    }
    if (userResult.status === 'rejected') {
      const c = classifyEmailFailure(userResult.reason, 'user');
      reportServerError({ code: c.code, message: 'Contact user email — Resend failure', source: '/api/contact', request, cause: userResult.reason, context: c.context });
    }

    if (sheetResult.status === 'rejected') {
      reportServerError({
        code: ERROR_CODES.CONTACT_SHEETS_APPEND_FAILED,
        message: 'Google Sheets append failed — lead in email + logs only',
        source: '/api/contact',
        request,
        cause: sheetResult.reason,
        context: {
          formType: data.formType,
          lead: {
            name: `${data.lastName} ${data.firstName}`,
            email: data.email,
            phone: data.phone,
          },
        },
      });
      const c = classifySheetsFailure(sheetResult.reason);
      reportServerError({ code: c.code, message: 'Contact Sheets — API failure', source: '/api/contact', request, cause: sheetResult.reason, context: c.context });
    }

    if (bothEmailsFailed) {
      return jsonError(500, 'Email küldési hiba. Kérjük próbáld újra később, vagy hívj minket: +36 1 300 9414');
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    reportServerError({
      code: ERROR_CODES.CONTACT_UNHANDLED,
      message: err instanceof Error ? err.message : 'Unknown error',
      source: '/api/contact',
      request,
      cause: err,
    });
    // Generic message only — internal errors (e.g. Google API responses)
    // must not leak to the client; the details are in reportServerError.
    return jsonError(500, 'Hiba történt a küldés közben. Kérjük próbáld újra később, vagy hívj minket: +36 1 300 9414');
  }
};
