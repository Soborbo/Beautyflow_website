/**
 * /api/boranalizis + /api/contact — üzleti elfogadás vs. értesítés.
 *
 * Minden külső fogadó MOCK (Resend, CRM-fetch, Turnstile, gateway); élesbe
 * semmi nem megy ki. A két review-lelet regressziója:
 *   1. csak telefonszámos kvíz + minden üzleti fogadó hibázik → korábban
 *      `success: true` (a kimaradó ügyféllevél „fulfilled" volt) + konverzió;
 *   2. CRM elfogadta, de mindkét levél elbukott → korábban HTTP 500, és a retry
 *      újra a CRM-be küldött.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  failEmailTo: new Set<string>(),
  emailsSent: [] as { to: string; subject: string }[],
  crm: { mode: 'ok' as 'ok' | 'fail' | 'success-false', calls: 0 },
  gatewayCalls: 0,
  reported: [] as string[],
}));

vi.mock('cloudflare:workers', () => ({ env: h.env }));
vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: async (p: { to: string; subject: string }) => {
        if (h.failEmailTo.has(p.to)) return { data: null, error: { name: 'application_error', message: 'mock outage', statusCode: 500 } };
        h.emailsSent.push({ to: p.to, subject: p.subject });
        return { data: { id: 'mock-email' }, error: null };
      },
    };
  },
}));
vi.mock('@/lib/forms/turnstile', () => ({ verifyTurnstile: async () => ({ success: true }) }));
vi.mock('@/lib/tracking/gateway-dispatch', () => ({
  sendGatewayConversion: async () => { h.gatewayCalls++; return { ok: true }; },
  buildConsentSources: () => undefined,
  readConsentFromCookie: () => undefined,
  readSboConsentCookieHeader: () => undefined,
  isGatewayConfigured: () => true,
}));
vi.mock('@/lib/errors/codes', async (orig) => {
  const real = await orig<typeof import('@/lib/errors/codes')>();
  return { ...real, reportServerError: (e: { code: string }) => { h.reported.push(e.code); } };
});

const ADMIN = 'info@beautyflow.pro';
const CRM_URL = 'https://crm.mock.invalid/api/webhook/lead';
let ipSeq = 0;

function memoryCache() {
  const m = new Map<string, string>();
  return {
    match: async (k: Request | string) => { const v = m.get(String(k)); return v === undefined ? undefined : new Response(v); },
    put: async (k: Request | string, r: Response) => { m.set(String(k), await r.text()); },
  };
}

function post(path: string, body: unknown): { request: Request; locals: object } {
  ipSeq++;
  return {
    request: new Request(`https://beautyflow.test${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `10.0.0.${ipSeq}` },
      body: JSON.stringify(body),
    }),
    locals: {},
  };
}

beforeEach(() => {
  for (const k of Object.keys(h.env)) delete h.env[k];
  Object.assign(h.env, {
    RESEND_API_KEY: 're_mock',
    TURNSTILE_SECRET_KEY: 'ts_mock',
    CRM_WEBHOOK_URL: CRM_URL,
    CRM_WEBHOOK_SECRET: 'crm_mock',
  });
  h.failEmailTo.clear();
  h.emailsSent.length = 0;
  h.crm.mode = 'ok';
  h.crm.calls = 0;
  h.gatewayCalls = 0;
  h.reported.length = 0;
  vi.stubGlobal('caches', { default: memoryCache() });
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url !== CRM_URL) throw new Error(`unexpected fetch ${url}`);
    h.crm.calls++;
    if (h.crm.mode === 'fail') return new Response('down', { status: 503 });
    if (h.crm.mode === 'success-false') return new Response(JSON.stringify({ success: false, error: 'rejected' }), { status: 200 });
    return new Response(JSON.stringify({ success: true, id: 'crm-lead-12345' }), { status: 200 });
  });
});
afterEach(() => vi.unstubAllGlobals());

// ---------------------------------------------------------------- kvíz ----

const quiz = (over: Record<string, unknown> = {}) => ({
  answers: { 'fo-panasz': 'pattanas', szalon: 'szalon-buda' },
  firstName: 'Teszt',
  phone: '+36 30 123 4567',
  email: '',
  consentHealth: true,
  turnstileToken: 'tok',
  event_id: `evt-${Math.random().toString(36).slice(2)}-quiz-0001`,
  ...over,
});

async function sendQuiz(body: unknown) {
  const { POST } = await import('../boranalizis');
  const res = await POST(post('/api/boranalizis', body) as never);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe('/api/boranalizis — üzleti elfogadás', () => {
  it('csak telefonszám + MINDEN üzleti fogadó hibázik → NEM siker, nincs konverzió, nincs ügyféllevél', async () => {
    h.failEmailTo.add(ADMIN);
    h.crm.mode = 'fail';
    const r = await sendQuiz(quiz());
    expect(r.status).toBe(500);
    expect(r.body.success).toBe(false);
    expect(h.gatewayCalls).toBe(0);
    expect(h.reported).toContain('LEAD-ACCEPT-001');
  });

  it('a kimaradó fogadók (nincs e-mail, nincs CRM/Sheets) nem számítanak sikernek', async () => {
    delete h.env.CRM_WEBHOOK_URL;
    h.failEmailTo.add(ADMIN);
    const r = await sendQuiz(quiz());
    expect(r.status).toBe(500);
    expect(h.gatewayCalls).toBe(0);
  });

  it('a CRM 2xx + `success:false` törzse elutasítás, nem elfogadás', async () => {
    h.failEmailTo.add(ADMIN);
    h.crm.mode = 'success-false';
    const r = await sendQuiz(quiz());
    expect(r.status).toBe(500);
    expect(h.reported).toContain('LEAD-CRM-001');
  });

  it('CRM elfogadta, mindkét levél elbukik → 200 + leadAccepted, az ügyféllevél külön státusz', async () => {
    h.failEmailTo.add(ADMIN);
    h.failEmailTo.add('vendeg@example.invalid');
    const r = await sendQuiz(quiz({ email: 'vendeg@example.invalid' }));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, leadAccepted: true, durable: true, customerEmail: 'failed', emailDelivered: false });
    expect(typeof r.body.hash).toBe('string');
    expect(h.gatewayCalls).toBe(1);
    expect(h.reported).toContain('QUIZ-EMAIL-BOTH-001');
  });

  it('…és a retry ugyanazzal az event_id-vel visszajátszik: nincs második CRM-hívás, levél, konverzió', async () => {
    h.failEmailTo.add(ADMIN);
    const body = quiz({ email: 'vendeg@example.invalid' });
    h.failEmailTo.add('vendeg@example.invalid');
    const first = await sendQuiz(body);
    const second = await sendQuiz(body);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(second.body.hash).toBe(first.body.hash);
    expect(h.crm.calls).toBe(1);
    expect(h.gatewayCalls).toBe(1);
  });

  it('csak a szalon-levél ment ki (CRM le) → elfogadott, de nem tartós; telefonos vendégnek nincs levél', async () => {
    h.crm.mode = 'fail';
    const r = await sendQuiz(quiz());
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, leadAccepted: true, durable: false, customerEmail: 'skipped', emailDelivered: false });
    expect(h.emailsSent.map((e) => e.to)).toEqual([ADMIN]);
  });

  it('nem elfogadott leadre nem megy „megkaptuk" ügyféllevél (a retry sem duplikálja)', async () => {
    h.failEmailTo.add(ADMIN);
    h.crm.mode = 'fail';
    const r = await sendQuiz(quiz({ email: 'vendeg@example.invalid' }));
    expect(r.status).toBe(500);
    expect(h.emailsSent).toEqual([]);
  });

  it('a megosztott HU/EN telefonszabály marad: érvénytelen szám → 400 magyar üzenettel', async () => {
    const r = await sendQuiz(quiz({ phone: '123' }));
    expect(r.status).toBe(400);
    expect(String(r.body.error)).toMatch(/telefonszám/);
    expect(h.crm.calls).toBe(0);
  });
});

// ------------------------------------------------------------- contact ----

const contact = (over: Record<string, unknown> = {}) => ({
  formType: 'location',
  locationId: 'buda',
  locationLabel: 'Beautyflow Buda',
  firstName: 'Teszt',
  lastName: 'Elek',
  phone: '+36 30 123 4567',
  email: 'vendeg@example.invalid',
  consent: true,
  turnstileToken: 'tok',
  event_id: `evt-${Math.random().toString(36).slice(2)}-contact-01`,
  ...over,
});

async function sendContact(body: unknown) {
  const { POST } = await import('../contact');
  const res = await POST(post('/api/contact', body) as never);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe('/api/contact — üzleti elfogadás', () => {
  it('CRM elfogadta, mindkét levél elbukik → 200, nem 500; a retry nem küld újra a CRM-be', async () => {
    h.failEmailTo.add(ADMIN);
    h.failEmailTo.add('vendeg@example.invalid');
    const body = contact();
    const first = await sendContact(body);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ success: true, leadAccepted: true, durable: true, customerEmail: 'failed', emailDelivered: false });
    const retry = await sendContact(body);
    expect(retry.status).toBe(200);
    expect(retry.body.duplicate).toBe(true);
    expect(h.crm.calls).toBe(1);
    expect(h.gatewayCalls).toBe(1);
  });

  it('minden üzleti fogadó hibázik → 500, nincs ügyféllevél és konverzió', async () => {
    h.failEmailTo.add(ADMIN);
    h.crm.mode = 'fail';
    const r = await sendContact(contact());
    expect(r.status).toBe(500);
    expect(r.body.success).toBe(false);
    expect(h.emailsSent).toEqual([]);
    expect(h.gatewayCalls).toBe(0);
    expect(h.reported).toContain('LEAD-ACCEPT-001');
  });

  it('a nem elfogadott kérés NEM jelölődik: a javult retry kézbesít', async () => {
    h.failEmailTo.add(ADMIN);
    h.crm.mode = 'fail';
    const body = contact();
    expect((await sendContact(body)).status).toBe(500);
    h.crm.mode = 'ok';
    const retry = await sendContact(body);
    expect(retry.status).toBe(200);
    expect(retry.body.duplicate).toBeUndefined();
    expect(retry.body.customerEmail).toBe('sent');
  });

  it('EN oldal: a közös telefonszabály angol üzenetet ad', async () => {
    const r = await sendContact(contact({ phone: '123', lang: 'en' }));
    expect(r.status).toBe(400);
    expect(String(r.body.error)).toMatch(/country code/i);
  });
});
