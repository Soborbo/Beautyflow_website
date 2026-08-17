/**
 * Bőranalízis kvíz API — a kontakt KAPU beküldését kezeli.
 *
 * Pipeline:
 *   1. Rate limit (per-IP) + honeypot + Content-Length cap
 *   2. Zod safeParse (szerveroldali validáció)
 *   3. Cloudflare Turnstile (fail closed)
 *   4. Ajánló-motor: recommend(answers)  →  profil + irány + flagek
 *   5. KV-be mentés (cross-device eredmény, best-effort)
 *   6. Resend → szalon értesítés (profil/kezelés/ársáv/flagek/válaszok)
 *   7. Resend → vendég visszaigazolás az eredmény-linkkel (Fanni hangján)
 *   8. Google Sheets „Boranalizis" fül (best-effort)
 *
 * Env (Cloudflare dashboard / wrangler secret put):
 *   RESEND_API_KEY, TURNSTILE_SECRET_KEY  — kötelező
 *   GOOGLE_SHEETS_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY — opcionális
 *   QUIZ_RESULTS (KV binding) — opcionális (cross-device eredmény-link)
 */

import type { APIRoute } from 'astro';
import { env as cfEnv } from 'cloudflare:workers';
import { z } from 'zod';
import { Resend } from 'resend';
import { verifyTurnstile } from '@/lib/forms/turnstile';
import { escapeHtml, escapeSubject } from '@/lib/forms/sanitize';
import { ERROR_CODES, reportServerError } from '@/lib/errors/codes';
import { sendEmail, classifyEmailFailure, classifySheetsFailure } from '@/lib/errors/classify';
import {
  sendGatewayConversion,
  readConsentFromCookie,
  isGatewayConfigured,
  type GatewayEnv,
} from '@/lib/tracking/gateway-dispatch';
import { checkRateLimit, RATE_LIMIT_CONTACT_MAX } from '@/lib/forms/rate-limit';
import { getGoogleAccessToken, getSheetGid, insertRowAtTop } from '@/lib/forms/google-sheets';
import { recommend } from '@/quiz/lib/recommendation';
import { SECTIONS } from '@/quiz/config/questions';
import { salonLabel, type SalonId } from '@/quiz/config/treatments';
import { generateResultHash, resultEmailUrl } from '@/quiz/lib/hash';
import { computeBaumannCode, type BaumannResult } from '@/quiz/lib/baumann';
import { baumannByCode } from '@/data/baumannTypes';
import type { Recommendation } from '@/quiz/lib/types';

export const prerender = false;

const ADMIN_TO = 'info@beautyflow.pro';
const ADMIN_FROM = 'Beautyflow <info@beautyflow.pro>';
const USER_FROM_HU = 'Kónya Fanni - Beautyflow <info@beautyflow.pro>';
const PHONE = '+36 1 300 9414';
const KV_TTL_SECONDS = 60 * 60 * 24 * 60; // 60 nap
const MAX_BODY_BYTES = 60_000;

// ---- Zod séma ----------------------------------------------------------

const answerValue = z.union([z.string().max(200), z.array(z.string().max(100)).max(20)]);

const QuizSchema = z
  .object({
    answers: z.record(z.string().max(60), answerValue),
    firstName: z.string().trim().min(2, 'Kérjük add meg a keresztneved.').max(100),
    phone: z.string().trim().max(32).optional().default(''),
    email: z.string().trim().max(320).optional().default(''),
    consentHealth: z.literal(true, {
      message: 'Az egészségügyi adatok kezeléséhez való hozzájárulás kötelező.',
    }),
    consentMarketing: z.boolean().optional().default(false), // hírlevél — OPCIONÁLIS
    consentAt: z.string().max(40).optional().default(''),
    website: z.string().max(200).optional().default(''), // honeypot
    turnstileToken: z.string().max(4000).optional().default(''),
    // The browser-minted conversion id for THIS submit — the same id the Meta Pixel
    // gets via trackLeadSubmit. Meta dedupes the Pixel and CAPI legs on the
    // (event_name, event_id) pair, so a second id would double-count the Lead
    // rather than add one (CLAUDE.md #16).
    event_id: z.string().max(200).optional().default(''),
    gclid: z.string().max(200).optional().default(''),
    fbclid: z.string().max(200).optional().default(''),
    gbraid: z.string().max(200).optional().default(''),
    wbraid: z.string().max(200).optional().default(''),
    msclkid: z.string().max(200).optional().default(''),
    fbc: z.string().max(200).optional().default(''),
    fbp: z.string().max(200).optional().default(''),
    utm_source: z.string().max(200).optional().default(''),
    utm_medium: z.string().max(200).optional().default(''),
    utm_campaign: z.string().max(200).optional().default(''),
    utm_content: z.string().max(200).optional().default(''),
    utm_term: z.string().max(200).optional().default(''),
  })
  .refine((d) => d.phone.length > 0 || d.email.length > 0, {
    message: 'Telefonszám vagy email kötelező.',
    path: ['email'],
  })
  .refine((d) => d.email === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email), {
    message: 'Érvénytelen email cím.',
    path: ['email'],
  });

type QuizData = z.infer<typeof QuizSchema>;

// ---- Válasz-címke lookup (Sheets + email humanizálás) ------------------

const Q_LABEL: Record<string, string> = {};
const OPT_LABEL: Record<string, string> = {}; // `${qid}::${value}` → label
for (const s of SECTIONS) {
  for (const q of s.questions) {
    Q_LABEL[q.id] = q.question;
    for (const o of q.options) OPT_LABEL[`${q.id}::${o.value}`] = o.label;
  }
}

function answerText(qid: string, value: string | string[]): string {
  const vals = Array.isArray(value) ? value : [value];
  return vals.map((v) => OPT_LABEL[`${qid}::${v}`] || v).join(', ');
}

function salonFromAnswers(answers: QuizData['answers']): SalonId {
  const s = answers['szalon'];
  const v = Array.isArray(s) ? s[0] : s;
  if (v === 'szalon-buda') return 'buda';
  if (v === 'szalon-pest') return 'pest';
  return 'barmely';
}

function formatTimestamp(): string {
  return new Date().toLocaleString('hu-HU', {
    timeZone: 'Europe/Budapest',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

// ---- Env ---------------------------------------------------------------

/** Minimális KV felület — nem támaszkodunk a globális KVNamespace típusra. */
interface QuizKV {
  get(key: string, type: 'json'): Promise<unknown>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

interface QuizEnv {
  RESEND_API_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  GOOGLE_SHEETS_ID?: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
  GOOGLE_PRIVATE_KEY?: string;
  SITE_URL?: string;
  QUIZ_RESULTS?: QuizKV;
  CRM_WEBHOOK_URL?: string;
  CRM_WEBHOOK_SECRET?: string;
}

function readEnv(): QuizEnv {
  // Astro 6 / @astrojs/cloudflare v13: Worker env via `cloudflare:workers`.
  const fromRuntime = cfEnv as Record<string, unknown>;
  const pick = (key: string): string | undefined =>
    (fromRuntime[key] as string | undefined) ||
    (typeof process !== 'undefined' && process.env ? process.env[key] : undefined) ||
    (import.meta.env as Record<string, string | undefined>)[key];
  return {
    RESEND_API_KEY: pick('RESEND_API_KEY'),
    TURNSTILE_SECRET_KEY: pick('TURNSTILE_SECRET_KEY'),
    GOOGLE_SHEETS_ID: pick('GOOGLE_SHEETS_ID'),
    GOOGLE_SERVICE_ACCOUNT_EMAIL: pick('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
    GOOGLE_PRIVATE_KEY: pick('GOOGLE_PRIVATE_KEY'),
    SITE_URL: pick('SITE_URL') || pick('PUBLIC_SITE_URL') || 'https://beautyflow.pro',
    QUIZ_RESULTS: fromRuntime['QUIZ_RESULTS'] as QuizKV | undefined,
    CRM_WEBHOOK_URL: pick('CRM_WEBHOOK_URL'),
    CRM_WEBHOOK_SECRET: pick('CRM_WEBHOOK_SECRET'),
  };
}

/**
 * Best-effort forward of the bőranalízis quiz lead to the CRM (/api/webhook/lead).
 * The quiz is a genuine lead source (firstName + phone/email + health consent).
 */
/** Olvasható „Baumann-kód — magyar név" (vagy csak a kód, ha ismeretlen). */
function baumannLabel(b: BaumannResult): string {
  const t = baumannByCode[b.code];
  return t ? `${b.code} — ${t.displayName}` : b.code;
}

/** Az összes ismert kvíz-válasz humanizálva, soronként „Kérdés: válasz". */
function answersSummary(answers: QuizData['answers']): string {
  const lines = Object.entries(answers)
    .filter(([qid]) => Q_LABEL[qid])
    .map(([qid, val]) => `${Q_LABEL[qid]}: ${answerText(qid, val)}`);
  const allergia = answers['allergia-reszletek'];
  if (allergia) lines.push(`Allergia részletek: ${String(allergia)}`);
  return lines.join('\n');
}

// Visszatérés: a CRM belső lead-azonosítója (a webhook `{ success, id }`
// válaszából), ha megvan és a gateway lead_id-formátumának megfelel — a
// gateway-dispatch lead_id-je, hogy a ledger a /lead-status offline-loophoz
// joinolható legyen. Hiányában undefined (a NULL detektálható).
async function forwardToCrm(
  data: QuizData, rec: Recommendation, baumann: BaumannResult, env: QuizEnv,
): Promise<string | undefined> {
  const url = env.CRM_WEBHOOK_URL;
  const secret = env.CRM_WEBHOOK_SECRET;
  if (!url || !secret) return;

  // A sales számára releváns, stabil, származtatott válaszok strukturáltan a CRM
  // lead_submissions-be (form_key: beautyflow_consult) — a ~20 nyers kvíz-válasz a
  // message-ben marad. A concern/salon value-i 1:1 a kvíz opció-value-ival.
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const concern = first(data.answers['fo-panasz']);
  const salon = first(data.answers['szalon']);
  const answers: Record<string, unknown> = {
    baumann: baumannLabel(baumann).slice(0, 120),
    skinProfile: rec.profile.label,
    recommended: treatmentsLine(rec),
  };
  if (concern) answers.concern = concern;
  if (salon === 'szalon-buda' || salon === 'szalon-pest') answers.salon = salon;

  const body = {
    name: data.firstName,
    phone: data.phone || undefined,
    email: data.email || undefined,
    need_type: `Bőranalízis ${baumann.code}: ${treatmentsLine(rec)}`.slice(0, 100),
    message:
      `Baumann-bőrtípus: ${baumannLabel(baumann)}\n` +
      `Bőrprofil: ${rec.profile.label}\n` +
      `Javasolt irány: ${treatmentsLine(rec)}\n\n` +
      `Kvíz-válaszok:\n${answersSummary(data.answers)}`,
    source_type: 'form' as const,
    consent_given: true,
    marketing_consent: data.consentMarketing,
    form_key: 'beautyflow_consult',
    answers,
    attribution: {
      utm_source: data.utm_source || undefined,
      utm_medium: data.utm_medium || undefined,
      utm_campaign: data.utm_campaign || undefined,
      utm_content: data.utm_content || undefined,
      utm_term: data.utm_term || undefined,
      gclid: data.gclid || undefined,
      fbclid: data.fbclid || undefined,
      gbraid: data.gbraid || undefined,
      wbraid: data.wbraid || undefined,
      msclkid: data.msclkid || undefined,
      fbc: data.fbc || undefined,
      fbp: data.fbp || undefined,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${secret}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`CRM webhook ${res.status}`);
  try {
    const resBody = (await res.json()) as { id?: unknown };
    const rawId =
      typeof resBody?.id === 'string' ? resBody.id
      : typeof resBody?.id === 'number' && Number.isFinite(resBody.id) ? String(resBody.id)
      : undefined;
    if (rawId && /^[a-zA-Z0-9_-]{8,64}$/.test(rawId)) return rawId;
  } catch {
    // non-JSON válasz → lead id nélkül megyünk tovább
  }
  return undefined;
}

// ---- Emailek -----------------------------------------------------------

function treatmentsLine(rec: Recommendation): string {
  return rec.treatments.map((t) => t.name).join(' + ') || '(nincs)';
}

async function sendSalonEmail(
  resend: Resend, data: QuizData, rec: Recommendation, baumann: BaumannResult, salon: SalonId, resultUrl: string,
): Promise<void> {
  const ts = formatTimestamp();
  const contact = [data.phone, data.email].filter(Boolean).join(' · ');
  const answerRows = Object.entries(data.answers)
    .filter(([qid]) => Q_LABEL[qid]) // csak ismert kérdések (a szabad szöveg külön)
    .map(([qid, val]) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;color:#666;">${escapeHtml(Q_LABEL[qid])}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${escapeHtml(answerText(qid, val))}</td></tr>`)
    .join('');
  const freeText = data.answers['allergia-reszletek'];
  const flags = rec.flags.length ? rec.flags.map((f) => `<li>${escapeHtml(f)}</li>`).join('') : '<li>—</li>';

  const html = `
<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#333;line-height:1.6;max-width:640px;margin:0 auto;">
  <h2 style="color:#c53f75;">Új bőranalízis kvíz lead</h2>
  <p style="color:#666;font-size:13px;">${escapeHtml(ts)} · Szalon: ${escapeHtml(salonLabel(salon))}</p>
  <table style="width:100%;border-collapse:collapse;margin:12px 0;">
    <tr><td style="padding:6px 8px;border-bottom:1px solid #eee;font-weight:bold;width:140px;">Név</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${escapeHtml(data.firstName)}</td></tr>
    <tr><td style="padding:6px 8px;border-bottom:1px solid #eee;font-weight:bold;">Elérhetőség</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${escapeHtml(contact)}</td></tr>
    <tr><td style="padding:6px 8px;border-bottom:1px solid #eee;font-weight:bold;">Baumann-bőrtípus</td><td style="padding:6px 8px;border-bottom:1px solid #eee;"><strong>${escapeHtml(baumann.code)}</strong> — ${escapeHtml(baumannByCode[baumann.code]?.displayName || '')}</td></tr>
    <tr><td style="padding:6px 8px;border-bottom:1px solid #eee;font-weight:bold;">Bőrprofil</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${escapeHtml(rec.profile.label)}</td></tr>
    <tr><td style="padding:6px 8px;border-bottom:1px solid #eee;font-weight:bold;">Javasolt irány</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${escapeHtml(treatmentsLine(rec))}</td></tr>
    <tr><td style="padding:6px 8px;border-bottom:1px solid #eee;font-weight:bold;">Kezelés ára</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${escapeHtml(rec.arSav?.formatted || '—')}</td></tr>
    <tr><td style="padding:6px 8px;border-bottom:1px solid #eee;font-weight:bold;">Útvonal</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${escapeHtml(rec.utvonal)}${rec.safe ? '' : ' (biztonsági felülbírálás)'}</td></tr>
    <tr><td style="padding:6px 8px;border-bottom:1px solid #eee;font-weight:bold;">Hírlevél</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${data.consentMarketing ? '✅ feliratkozott' : '— nem'}</td></tr>
  </table>
  <h3 style="color:#c53f75;margin-top:18px;">⚠️ Kozmetikusnak (felkészüléshez)</h3>
  <ul style="font-size:14px;">${flags}</ul>
  ${freeText ? `<p style="font-size:14px;"><strong>Allergia részletek:</strong> ${escapeHtml(String(freeText))}</p>` : ''}
  <h3 style="color:#c53f75;margin-top:18px;">Kvíz válaszok</h3>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">${answerRows}</table>
  <p style="margin-top:18px;font-size:13px;">Eredmény-oldal: <a href="${escapeHtml(resultUrl)}">${escapeHtml(resultUrl)}</a></p>
  <p style="color:#999;font-size:12px;margin-top:18px;border-top:1px solid #eee;padding-top:10px;">Automatikus üzenet a beautyflow.pro bőranalízis kvízből.</p>
</body></html>`.trim();

  await sendEmail(resend, {
    from: ADMIN_FROM,
    replyTo: data.email || undefined,
    to: ADMIN_TO,
    subject: escapeSubject(`Bőranalízis kvíz – ${data.firstName} · ${baumann.code} (${salonLabel(salon)})`),
    headers: { 'X-Entity-Ref-ID': `quiz-admin-${Date.now()}-${Math.random().toString(36).slice(2, 9)}` },
    html,
  });
}

async function sendUserEmail(resend: Resend, data: QuizData, rec: Recommendation, resultUrl: string): Promise<void> {
  if (!data.email) return; // csak email esetén küldünk vendég-visszaigazolást
  const name = escapeHtml(data.firstName);
  const direction = rec.safe
    ? `<p style="margin:12px 0 4px;"><strong>A te problémádra valószínűleg ez az irány:</strong></p>
       <p style="color:#c53f75;font-size:16px;font-weight:bold;">${escapeHtml(treatmentsLine(rec))}</p>`
    : `<p style="margin:12px 0;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px;font-size:14px;">${escapeHtml(rec.routeMessage || '')}</p>`;

  const html = `
<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#333;line-height:1.6;max-width:600px;margin:0 auto;">
  <p>Kedves ${name}!</p>
  <p>Köszönjük, hogy kitöltötted a Beautyflow ingyenes online bőranalízisét. Íme a személyre szabott bőrprofilod:</p>
  <p style="background:#fdf2f8;border-radius:10px;padding:14px;font-size:16px;"><strong>A bőröd profilja:</strong> ${escapeHtml(rec.profile.label)}</p>
  ${direction}
  ${rec.arSav ? `<p style="font-size:14px;color:#666;">A kezelés ára: <strong>${escapeHtml(rec.arSav.formatted)}</strong> (az érvényes árlista szerint).</p>` : ''}
  <p style="font-size:13px;color:#666;background:#f8f8f8;border-left:3px solid #c53f75;padding:10px 12px;">
    A pontos kezelési tervet csak személyesen, fényben és tapintással végzett vizsgálat után tudjuk megadni.
    Ez az eredmény kozmetikai konzultációs irány, nem orvosi diagnózis.
  </p>
  <p style="text-align:center;margin:22px 0;">
    <a href="${escapeHtml(resultUrl)}" style="display:inline-block;background:#c53f75;color:#fff;text-decoration:none;padding:12px 26px;border-radius:999px;font-weight:bold;">Megnézem a részletes eredményem</a>
  </p>
  <h3 style="color:#c53f75;">A következő lépés: bőrdiagnosztika</h3>
  <p style="font-size:14px;">A szalonban géppel felmérjük a bőröd valós állapotát, és személyre szabott kezelési tervet kapsz, otthoni termékajánlóval. 60 perc, 10 000 Ft — amit <strong>levonunk az első kezelésed árából</strong>, így ha nálunk folytatod, gyakorlatilag ingyen van. Kizárólag a Beautyflow Pest szalonban. Hamarosan vissza is hívunk a megadott elérhetőségen.</p>
  <p style="text-align:center;margin:18px 0;"><a href="https://beautyflow.pro/bordiagnosztika" style="display:inline-block;background:#c53f75;color:#fff;text-decoration:none;padding:12px 26px;border-radius:999px;font-weight:bold;">Kérem a bőrdiagnosztikát</a></p>
  <p style="margin-top:18px;">Sürgős esetben hívj minket: <a href="tel:+3613009414" style="color:#c53f75;">${PHONE}</a></p>
  <p style="margin-top:20px;">Szeretettel,<br><strong>Kónya Fanni</strong><br><span style="color:#c53f75;">a Beautyflow alapítója</span></p>
</body></html>`.trim();

  await sendEmail(resend, {
    from: USER_FROM_HU,
    replyTo: ADMIN_TO,
    to: data.email,
    subject: 'A személyre szabott bőrprofilod – Beautyflow',
    headers: { 'X-Entity-Ref-ID': `quiz-user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}` },
    html,
  });
}

// ---- Sheets ------------------------------------------------------------

async function writeToSheet(
  env: QuizEnv, data: QuizData, rec: Recommendation, baumann: BaumannResult, salon: SalonId, hash: string,
): Promise<void> {
  if (!env.GOOGLE_SHEETS_ID || !env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY) return;
  const token = await getGoogleAccessToken(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY);
  const gid = await getSheetGid(env.GOOGLE_SHEETS_ID, token, 'Boranalizis');

  const utm = [data.utm_source, data.utm_medium, data.utm_campaign].filter(Boolean).join(' / ');
  // Oszlopok (A→…) — fejléchez lásd a wrangler.jsonc TODO-t / DEPLOY-jegyzetet.
  const row: string[] = [
    formatTimestamp(),                                  // A időbélyeg
    hash,                                               // B eredmény-hash
    data.firstName,                                     // C keresztnév
    data.phone,                                         // D telefon
    data.email,                                         // E email
    salonLabel(salon),                                  // F szalon
    rec.profile.label,                                  // G bőrprofil
    treatmentsLine(rec),                                // H javasolt irány
    rec.arSav?.formatted || '',                         // I kezelés ára
    rec.utvonal + (rec.safe ? '' : ' (felülbírálva)'),  // J útvonal
    rec.flags.join(' | '),                              // K kozmetikus flagek
    answerText('fo-panasz', data.answers['fo-panasz'] || ''),     // L fő panasz
    answerText('cel', data.answers['cel'] || ''),                 // M cél
    answerText('surgosseg', data.answers['surgosseg'] || ''),     // N sürgősség
    answerText('eletkor', data.answers['eletkor'] || ''),         // O életkor
    String(data.answers['allergia-reszletek'] || ''),  // P allergia részletek
    data.consentAt,                                     // Q egészségügyi hozzájárulás időbélyeg
    data.gclid,                                         // R gclid
    data.fbclid,                                        // S fbclid
    utm,                                                // T utm
    JSON.stringify(data.answers),                       // U összes nyers válasz (audit)
    baumannLabel(baumann),                              // V Baumann-bőrtípus (kód — név)
    data.consentMarketing ? 'igen' : 'nem',             // W hírlevél feliratkozás
  ];
  await insertRowAtTop(env.GOOGLE_SHEETS_ID, token, gid, row);
}

// ---- Handler -----------------------------------------------------------

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ success: false, error }), { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * Pushes the quiz conversion to the event-gateway from the server, so it survives
 * the browser losing the race against the hard navigation to /bortipus/<slug>.
 *
 * Consent comes from the SAME CookieYes cookie the browser lib reads (it rides
 * along with this POST), so the two legs cannot disagree. beautyflow's gateway
 * config sets `require_consent: true` — without forwarding consent the gateway
 * would accept and ledger every event and then send Meta nothing at all.
 */
async function dispatchGatewayConversion(
  data: z.infer<typeof QuizSchema>,
  request: Request,
  value: number,
  leadId?: string,
): Promise<void> {
  const raw = cfEnv as unknown as Record<string, unknown>;
  const gatewayEnv: GatewayEnv = {
    GATEWAY: raw.GATEWAY as GatewayEnv['GATEWAY'],
    TRACKING_GATEWAY_TOKEN: raw.TRACKING_GATEWAY_TOKEN as string | undefined,
    SITE_URL: raw.SITE_URL as string | undefined,
    TRACKING_TEST_LEAD_EMAIL: raw.TRACKING_TEST_LEAD_EMAIL as string | undefined,
    TRACKING_TEST_EVENT_CODE: raw.TRACKING_TEST_EVENT_CODE as string | undefined,
  };

  if (!data.event_id) {
    reportServerError({
      code: ERROR_CODES.GATEWAY_NO_EVENT_ID,
      message: 'Gateway conversion skipped — client sent no event_id (no Pixel dedup key)',
      source: '/api/boranalizis',
      request,
    });
    return;
  }
  if (!isGatewayConfigured(gatewayEnv)) {
    reportServerError({
      code: ERROR_CODES.GATEWAY_NOT_CONFIGURED,
      message: 'Gateway conversion skipped — gateway not configured (binding/token/SITE_URL)',
      source: '/api/boranalizis',
      request,
    });
    return;
  }

  try {
    const res = await sendGatewayConversion(gatewayEnv, {
      // A többlépéses bőranalízis-kvíz a lead-kalkulátor: a gateway ezt Meta
      // Lead-re képezi (a kontakt-űrlap marad contact_form_submitted → Contact).
      // Üzleti döntés (2026-07-15): kvíz = Lead, kontakt-oldali űrlap = Contact.
      eventName: 'quote_calculator_submitted',
      eventId: data.event_id,
      // A CRM lead-kulcsa: enélkül a gateway ledger sora lead_id=NULL, és a
      // /lead-status offline-loop sosem joinolható vissza a konverzióhoz.
      leadId,
      value,
      currency: 'HUF',
      source: 'server',
      userData: {
        email: data.email || undefined,
        phone_number: data.phone || undefined,
        first_name: data.firstName,
        country: request.headers.get('CF-IPCountry') || 'HU',
      },
      // Meta browser IDs from the client's _fbp/_fbc cookies (POSTed with the
      // quiz) — plain, top-level; the gateway's CAPI leg needs them for EMQ.
      fbp: data.fbp || undefined,
      fbc: data.fbc || undefined,
      attribution: {
        gclid: data.gclid || undefined,
        fbclid: data.fbclid || undefined,
        gbraid: data.gbraid || undefined,
        wbraid: data.wbraid || undefined,
        msclkid: data.msclkid || undefined,
        utm_source: data.utm_source || undefined,
        utm_medium: data.utm_medium || undefined,
        utm_campaign: data.utm_campaign || undefined,
      },
      consent: readConsentFromCookie(request.headers.get('Cookie')),
      eventSourceUrl: request.headers.get('Referer') || undefined,
      clientIpAddress: request.headers.get('CF-Connecting-IP') || undefined,
      clientUserAgent: request.headers.get('User-Agent') || undefined,
    });

    if (!res.ok) {
      reportServerError({
        code: ERROR_CODES.GATEWAY_DISPATCH_FAILED,
        message: `Gateway conversion dispatch failed (${res.error})`,
        source: '/api/boranalizis',
        request,
        context: { status: res.status, attempts: res.attempts, retriable: res.retriable },
      });
    }
  } catch (cause) {
    reportServerError({
      code: ERROR_CODES.GATEWAY_DISPATCH_FAILED,
      message: 'Gateway conversion dispatch threw',
      source: '/api/boranalizis',
      request,
      cause,
    });
  }
}

export const POST: APIRoute = async (context) => {
  const { request, locals } = context;
  try {
    const ip = request.headers.get('CF-Connecting-IP') || '';
    if (!checkRateLimit(`boranalizis:${ip}`, RATE_LIMIT_CONTACT_MAX)) {
      return jsonError(429, 'Túl sok kérés. Kérjük várj egy percet, majd próbáld újra.');
    }
    if (Number(request.headers.get('Content-Length') || '0') > MAX_BODY_BYTES) {
      return jsonError(413, 'A kérés túl nagy.');
    }

    let raw: unknown;
    try { raw = await request.json(); } catch { return jsonError(400, 'Érvénytelen kérés formátum.'); }

    // Honeypot — silently succeed
    if (raw && typeof raw === 'object' && (raw as { website?: string }).website) {
      return new Response(JSON.stringify({ success: true, hash: generateResultHash() }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const parsed = QuizSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return jsonError(400, first?.message || 'Hiányzó vagy érvénytelen adatok.');
    }
    const data = parsed.data;

    const env = readEnv();

    // Turnstile — fail closed
    if (!env.TURNSTILE_SECRET_KEY) {
      reportServerError({ code: ERROR_CODES.QUIZ_CONFIG_TURNSTILE_MISSING, message: 'TURNSTILE_SECRET_KEY not configured — rejecting quiz submits', source: '/api/boranalizis', request });
      return jsonError(503, `A küldés átmenetileg nem elérhető. Kérjük hívj minket: ${PHONE}`);
    }
    {
      const r = await verifyTurnstile(data.turnstileToken || '', env.TURNSTILE_SECRET_KEY, ip || undefined);
      if (!r.success) {
        reportServerError({ code: ERROR_CODES.QUIZ_TURNSTILE_REJECTED, message: 'Turnstile rejected quiz submit', source: '/api/boranalizis', request, context: { errors: r.errors } });
        // Granular: distinguish a network failure to the verify API from a
        // genuine token rejection so the pipeline routes them differently.
        const turnNetwork = (r.errors || []).includes('network-error');
        reportServerError({
          code: turnNetwork ? 'TURN-VERIFY-003' : 'TURN-VERIFY-001',
          message: turnNetwork ? 'Turnstile verify API unreachable' : 'Turnstile server verification failed',
          source: '/api/boranalizis', request,
          context: { errorCodes: r.errors ?? [], errorMessage: (r.errors ?? []).join(', ') },
        });
        return jsonError(400, 'Robot-ellenőrzés sikertelen. Kérjük frissítsd az oldalt és próbáld újra.');
      }
    }

    if (!env.RESEND_API_KEY) {
      reportServerError({ code: ERROR_CODES.QUIZ_CONFIG_RESEND_MISSING, message: 'RESEND_API_KEY not configured', source: '/api/boranalizis', request });
      return jsonError(500, `Email szolgáltatás nem elérhető. Kérjük hívj minket: ${PHONE}`);
    }

    // --- Ajánló-motor (tiszta függvény) ---
    const rec = recommend(data.answers);
    const baumann = computeBaumannCode(data.answers); // 16 publikus oldal célpontja
    const salon = salonFromAnswers(data.answers);
    const hash = generateResultHash();
    const resultUrl = resultEmailUrl(hash, env.SITE_URL || 'https://beautyflow.pro');

    // --- KV mentés (best-effort, cross-device eredmény) ---
    if (env.QUIZ_RESULTS) {
      // Astro 6 / @astrojs/cloudflare v13: the ExecutionContext moved from
      // locals.runtime.ctx to locals.cfContext.
      const cfCtx = (locals as { cfContext?: { waitUntil?: (p: Promise<unknown>) => void } }).cfContext;
      const put = env.QUIZ_RESULTS.put(hash, JSON.stringify(rec), { expirationTtl: KV_TTL_SECONDS }).catch((e) => {
        reportServerError({ code: ERROR_CODES.QUIZ_KV_STORE_FAILED, message: 'KV result store failed', source: '/api/boranalizis', request, cause: e });
        reportServerError({ code: 'KV-WRITE-001', message: 'KV.put() threw', source: '/api/boranalizis', request, cause: e, context: { key: hash, errorMessage: e instanceof Error ? e.message : String(e) } });
      });
      if (cfCtx?.waitUntil) cfCtx.waitUntil(put); else await put;
    }

    const resend = new Resend(env.RESEND_API_KEY);
    const results = await Promise.allSettled([
      sendSalonEmail(resend, data, rec, baumann, salon, resultUrl),
      sendUserEmail(resend, data, rec, resultUrl),
      writeToSheet(env, data, rec, baumann, salon, hash),
      forwardToCrm(data, rec, baumann, env), // CRM lead-webhook (best-effort; sosem buktatja a kvízt)
    ]);

    const [adminR, userR, sheetR] = results;
    const bothEmailsFailed = adminR.status === 'rejected' && userR.status === 'rejected';

    if (bothEmailsFailed) {
      reportServerError({
        code: ERROR_CODES.QUIZ_EMAIL_BOTH_FAILED, message: 'Quiz salon AND user emails failed — lead may be lost',
        source: '/api/boranalizis', request, cause: (adminR as PromiseRejectedResult).reason,
        context: { lead: { name: data.firstName, email: data.email, phone: data.phone }, adminReason: String((adminR as PromiseRejectedResult).reason), userReason: String((userR as PromiseRejectedResult).reason) },
        fingerprint: ERROR_CODES.QUIZ_EMAIL_BOTH_FAILED,
      });
    } else {
      if (adminR.status === 'rejected') reportServerError({ code: ERROR_CODES.QUIZ_EMAIL_ADMIN_FAILED, message: 'Quiz salon email failed', source: '/api/boranalizis', request, cause: adminR.reason });
      if (userR.status === 'rejected') reportServerError({ code: ERROR_CODES.QUIZ_EMAIL_USER_FAILED, message: 'Quiz user email failed', source: '/api/boranalizis', request, cause: userR.reason });
    }
    // Granular provider classification (the "why" behind a channel failure).
    // Fingerprint defaults to the code, so admin+user failing for the same
    // root cause (e.g. auth) dedupe to one pipeline notification.
    if (adminR.status === 'rejected') {
      const c = classifyEmailFailure(adminR.reason, 'salon');
      reportServerError({ code: c.code, message: 'Quiz salon email — Resend failure', source: '/api/boranalizis', request, cause: adminR.reason, context: c.context });
    }
    if (userR.status === 'rejected') {
      const c = classifyEmailFailure(userR.reason, 'user');
      reportServerError({ code: c.code, message: 'Quiz user email — Resend failure', source: '/api/boranalizis', request, cause: userR.reason, context: c.context });
    }
    if (sheetR.status === 'rejected') {
      reportServerError({ code: ERROR_CODES.QUIZ_SHEETS_APPEND_FAILED, message: 'Quiz Sheets append failed', source: '/api/boranalizis', request, cause: sheetR.reason, context: { lead: { name: data.firstName, email: data.email, phone: data.phone } } });
      const c = classifySheetsFailure(sheetR.reason);
      reportServerError({ code: c.code, message: 'Quiz Sheets — API failure', source: '/api/boranalizis', request, cause: sheetR.reason, context: c.context });
    }

    if (bothEmailsFailed) {
      return jsonError(500, `Email küldési hiba. Kérjük próbáld újra később, vagy hívj minket: ${PHONE}`);
    }

    // ── Server-side conversion → Soborbo event-gateway ───────────────────────
    // Success path only, mirroring the browser's trackLeadSubmit: a 500 makes the
    // user retry, and a retry mints a fresh event_id — firing here too would book
    // two Leads for one guest. Never throws; the result is already earned.
    // Value = the midpoint of the quiz's own price band, so both legs agree.
    const quizValue = rec.arSav ? Math.round((rec.arSav.min + rec.arSav.max) / 2) : 5000;
    // A CRM lead-kulcsa (a webhook válaszából) → gateway lead_id (ledger↔CRM join).
    const crmLeadId =
      results[3].status === 'fulfilled' ? (results[3].value as string | undefined) : undefined;
    await dispatchGatewayConversion(data, request, quizValue, crmLeadId);

    // A vendég akkor is megkapja az eredményt, ha a Sheets/KV elbukott
    // (a kliens localStorage-be is menti a result objektumot).
    return new Response(JSON.stringify({ success: true, hash, result: rec, arSav: rec.arSav, baumann }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    reportServerError({ code: ERROR_CODES.QUIZ_UNHANDLED, message: err instanceof Error ? err.message : 'Unknown error', source: '/api/boranalizis', request, cause: err });
    return jsonError(500, `Hiba történt a küldés közben. Kérjük próbáld újra később, vagy hívj minket: ${PHONE}`);
  }
};
