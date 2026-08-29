import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sendToWorker } from '../lib/gateway';
import { getDiagnostics } from '../lib/observability';
import { resetAll } from './helpers';

/**
 * A BÖNGÉSZŐ-ÚT ESEMÉNY-FELOSZTÁSA.
 *
 * ── Mit váltott ez a fájl ────────────────────────────────────────────────────
 * Ez a `gateway-degraded.test.ts` utódja. Az a fájl a Turnstile „token-less
 * degraded" ágát mérte: token nélkül CSAK a három klikk-event ment ki, a
 * magas kockázatúak kimaradtak (TRK-1001).
 *
 * A Turnstile 2026-08-28-án kikerült a dispatch útjából (a gateway 2026 nyara
 * óta nem is validálja). A felosztás viszont NEM kerülhetett ki vele: eddig a
 * kapu végezte MELLÉKHATÁSKÉNT ezt a munkát is. Kapu nélkül, lista nélkül a
 * magas kockázatú eventek garantált-403 beacont termelnének
 * (a gateway TRK-400-017-tel dobja őket a böngésző-útról).
 *
 * Ezért a felosztás most KIMONDOTT — és pontosan UGYANAZ a három event megy át,
 * mint eddig a degradált ágon. A magas kockázatúakat a site BACKENDJE küldi a
 * hitelesített `/api/event/conversion-server` ingressen, per-site tokennel.
 */

function stubFetch() {
  const fetchMock = vi.fn((..._args: unknown[]) =>
    Promise.resolve(new Response(null, { status: 204 })),
  );
  vi.stubGlobal('fetch', fetchMock);
  // Force the fetch path (not sendBeacon) so we can inspect the POST body.
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: () => false });
  return fetchMock;
}

function codes(): string[] {
  return getDiagnostics().map((d) => d.code);
}

beforeEach(() => resetAll());
afterEach(() => vi.unstubAllGlobals());

describe('sendToWorker — a böngésző-úton átengedett klikk-eventek', () => {
  for (const event of ['phone_conversion', 'email_conversion', 'whatsapp_conversion']) {
    it(`${event}: kimegy, és NINCS benne turnstile_token`, async () => {
      const fetchMock = stubFetch();
      const ok = await sendToWorker({ event_name: event, event_id: 'E', event_time: 1_700_000_000 });

      expect(ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
      // A mező végleg kikerült: a gateway nem validál Turnstile-t.
      expect('turnstile_token' in body).toBe(false);
      expect(body.event_name).toBe(event);
      expect(codes()).toContain('TRK-1000');
      expect(codes()).not.toContain('TRK-1005');
    });
  }
});

describe('sendToWorker — a szerver-ingress-only eventek HANGOSAN elakadnak', () => {
  for (const event of ['contact_form_submit', 'callback_conversion', 'quote_calculator_conversion']) {
    it(`${event}: nincs hálózati hívás, false, és TRK-1005`, async () => {
      const fetchMock = stubFetch();
      const ok = await sendToWorker({ event_name: event, event_id: 'E', event_time: 1_700_000_000 });

      expect(ok).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
      // HANGOS, nem néma: különben a konverzió úgy veszne el, hogy a dispatch
      // sikeresnek látszik. Ez a különbség a kihagyás és az elnyelés között.
      expect(codes()).toContain('TRK-1005');
      expect(codes()).not.toContain('TRK-1000');
    });
  }
});
