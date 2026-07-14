import { describe, it, expect, beforeEach, vi } from 'vitest';

// A gateway-dispatch mockolva — itt az index.ts vezérlését teszteljük.
vi.mock('../lib/gateway', () => ({
  sendToWorker: vi.fn(() => Promise.resolve(true)),
  getTurnstileToken: vi.fn(() => Promise.resolve('TOK')),
  collectAttribution: vi.fn(() => ({})),
}));

import {
  trackLeadSubmit, trackContactSubmit, trackServerEvent,
  trackPhoneConversion, trackCallbackConversion, trackEmailConversion, trackWhatsappConversion,
} from '../lib/index';
import { sendToWorker } from '../lib/gateway';
import { setCkyConsent, resetAll, lastEvent, getDataLayer } from './helpers';

const mockSend = sendToWorker as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetAll();
  mockSend.mockClear();
  setCkyConsent({ analytics: true, marketing: true });
});

describe('trackLeadSubmit', () => {
  // SZERZŐDÉS-VÁLTÁS (gateway Run 6): a form-konverziók server-ingress-only-k —
  // a böngésző-leg a gateway felé 403-at kapna, ezért NINCS többé
  // dispatchToGateway; a szerver CAPI-leget a site backendje küldi UGYANEZZEL
  // az event_id-vel. Itt azt bizonyítjuk, hogy a dataLayer-leg él, a gateway-leg nem.
  it('pushes dataLayer lead_submit and does NOT dispatch to the gateway (server-ingress-only)', () => {
    const r = trackLeadSubmit({ email: 'a@b.com', phone: '07123456789', value: 380, currency: 'GBP' });
    expect(r.success).toBe(true);
    expect(r.consentBlocked).toBe(false);

    const dlEvent = lastEvent('lead_submit')!;
    // a visszaadott eventId megy a backendnek (hidden mező) → dedup kulcs
    expect(dlEvent.event_id).toBe(r.eventId);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('consent nélkül: NINCS dispatch, NINCS dataLayer push', () => {
    setCkyConsent({ analytics: true, marketing: false });
    const r = trackLeadSubmit({ email: 'a@b.com' });
    expect(r.success).toBe(false);
    expect(r.consentBlocked).toBe(true);
    expect(mockSend).not.toHaveBeenCalled();
    expect(getDataLayer().some((e) => e.event === 'lead_submit')).toBe(false);
  });
});

describe('trackContactSubmit', () => {
  it('contact_submit dataLayer-t push-ol, gateway-dispatch NÉLKÜL (server-ingress-only)', () => {
    const r = trackContactSubmit({ email: 'a@b.com', phone: '0620123456' });
    expect(lastEvent('contact_submit')!.event_id).toBe(r.eventId);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('trackServerEvent', () => {
  it('tetszőleges gateway eseményt küld, consent mellett', () => {
    const id = trackServerEvent('phone_conversion', { value: 0 });
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].event_name).toBe('phone_conversion');
    expect(mockSend.mock.calls[0][0].event_id).toBe(id);
  });
  it('consent nélkül nem küld', () => {
    setCkyConsent({ marketing: false });
    trackServerEvent('phone_conversion');
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('click conversions — both channels, shared event_id', () => {
  it('trackPhoneConversion pushes phone_click AND dispatches phone_conversion with the SAME event_id', () => {
    const id = trackPhoneConversion({ phone: '07123456789' });
    expect(id).toBeTruthy();
    const dl = lastEvent('phone_click')!;
    expect(dl.event_id).toBe(id);
    expect(mockSend).toHaveBeenCalledTimes(1);
    const payload = mockSend.mock.calls[0][0];
    expect(payload.event_name).toBe('phone_conversion');
    expect(payload.event_id).toBe(id);
    expect(payload.user_data.phone_number).toBe('07123456789'); // raw → gateway hashes
  });

  it('maps email/whatsapp to the canonical gateway names; callback is dataLayer-only (gated)', () => {
    // callback_conversion → callback_request_submitted: server-ingress-only a
    // gateway-en (403 lenne) → nincs gateway-leg, csak dataLayer.
    trackCallbackConversion();
    expect(mockSend).not.toHaveBeenCalled();
    expect(lastEvent('callback_click')).toBeTruthy();
    mockSend.mockClear();
    trackEmailConversion({ email: 'a@b.com' });
    expect(mockSend.mock.calls[0][0].event_name).toBe('email_conversion');
    mockSend.mockClear();
    trackWhatsappConversion({ phone: '07123456789' });
    expect(mockSend.mock.calls[0][0].event_name).toBe('whatsapp_conversion');
  });

  it('phone dedup covers BOTH channels (second click → no dataLayer, no gateway)', () => {
    const id1 = trackPhoneConversion();
    expect(id1).toBeTruthy();
    const id2 = trackPhoneConversion();
    expect(id2).toBeNull();
    expect(getDataLayer().filter((e) => e.event === 'phone_click')).toHaveLength(1);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('callback/email/whatsapp dedup covers BOTH channels too (second click → no dataLayer, no gateway)', () => {
    const cases: Array<{ fn: () => string | null; dlEvent: string }> = [
      { fn: () => trackCallbackConversion(), dlEvent: 'callback_click' },
      { fn: () => trackEmailConversion({ email: 'a@b.com' }), dlEvent: 'email_click' },
      { fn: () => trackWhatsappConversion({ phone: '07123456789' }), dlEvent: 'whatsapp_click' },
    ];
    for (const { fn, dlEvent } of cases) {
      mockSend.mockClear();
      expect(fn(), dlEvent).toBeTruthy();      // first click → fires
      expect(fn(), dlEvent).toBeNull();        // second click same session → suppressed
      expect(getDataLayer().filter((e) => e.event === dlEvent), dlEvent).toHaveLength(1);
      // callback: nincs gateway-leg (server-ingress-only); email/whatsapp: pontosan 1
      expect(mockSend, dlEvent).toHaveBeenCalledTimes(dlEvent === 'callback_click' ? 0 : 1);
    }
  });

  it('analytics-only consent → dataLayer fires, NO gateway dispatch', () => {
    setCkyConsent({ analytics: true, marketing: false });
    trackPhoneConversion();
    // dataLayer push allowed under analytics consent…
    expect(getDataLayer().some((e) => e.event === 'phone_click')).toBe(true);
    // …but NO server-side dispatch without marketing consent.
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('marketing-only consent → server-side conversion STILL fires (decoupled from analytics)', () => {
    setCkyConsent({ analytics: false, marketing: true });
    const id = trackPhoneConversion({ phone: '07123456789' });
    expect(id).toBeTruthy();
    // No browser GA4 event (analytics withheld)…
    expect(getDataLayer().some((e) => e.event === 'phone_click')).toBe(false);
    // …but the money signal (Meta CAPI + Ads) reaches the gateway with the shared id.
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].event_name).toBe('phone_conversion');
    expect(mockSend.mock.calls[0][0].event_id).toBe(id);
  });

  it('no consent at all → nothing fires and dedup is not consumed', () => {
    setCkyConsent({ analytics: false, marketing: false });
    expect(trackPhoneConversion()).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
    expect(getDataLayer()).toHaveLength(0);
  });
});
