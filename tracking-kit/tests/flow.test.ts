import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the gateway transport so we can inspect EXACTLY what the server would receive,
// and simulate slow/failed workers — events.ts runs for real (true end-to-end browser side).
vi.mock('../lib/gateway', () => ({
  sendToWorker: vi.fn(() => Promise.resolve(true)),
  collectAttribution: vi.fn(() => ({})),
}));

import {
  trackLeadSubmit, trackContactSubmit, trackServerEvent, trackPhoneConversion,
  trackCalculatorStart, trackCalculatorStep, trackCalculatorOption, trackCalculatorComplete,
} from '../lib/index';
import { sendToWorker } from '../lib/gateway';
import { setCkyConsent, resetAll, lastEvent } from './helpers';

const mockSend = sendToWorker as unknown as ReturnType<typeof vi.fn>;

function sideChannel(): Record<string, unknown> | undefined {
  return (window as unknown as { __sbUserData?: Record<string, unknown> }).__sbUserData;
}

beforeEach(() => {
  resetAll();
  mockSend.mockReset();
  mockSend.mockImplementation(() => Promise.resolve(true));
  setCkyConsent({ analytics: true, marketing: true });
});

describe('lead journey — flows through both channels in the right shape', () => {
  it('lead submit: side-channel PII + PII-free dataLayer, NO browser gateway leg (server-ingress-only)', () => {
    const r = trackLeadSubmit({
      email: 'A@B.com', phone: '07123456789', firstName: 'Jo', lastName: 'Smith',
      value: 380, currency: 'GBP',
    });
    expect(r.success).toBe(true);

    // browser channel (dataLayer) — no PII, has the id/value/currency
    const dl = lastEvent('lead_submit')!;
    expect(dl.event_id).toBe(r.eventId);
    expect(dl.value).toBe(380);
    expect(dl.currency).toBe('GBP');
    expect(JSON.stringify(dl)).not.toContain('A@B.com');

    // side-channel — normalized PII for Enhanced Conversions, names nested under
    // `address` (gtag user_provided_data schema; top-level names are dropped by awct)
    expect(sideChannel()).toMatchObject({
      email: 'a@b.com',
      phone_number: '+447123456789',
      address: { first_name: 'Jo', last_name: 'Smith' },
    });
    expect((sideChannel() as Record<string, unknown>).first_name).toBeUndefined();

    // server channel: a gateway Run 6 óta a form-konverziókat CSAK a
    // hitelesített szerver-ingressen fogadja — a böngésző-leg 403 lenne, ezért
    // NINCS dispatch; a backend küldi (r.eventId a hidden mezőn át) → dedup ép.
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('calculator funnel runs start→step→option→complete, then the conversion reaches the gateway', () => {
    trackCalculatorStart('quote-calc');
    trackCalculatorStep('size', 1, 4);
    trackCalculatorOption('size', '3-bed');
    trackCalculatorComplete('quote-calc');
    for (const e of ['calculator_start', 'calculator_step', 'calculator_option', 'calculator_complete']) {
      expect(lastEvent(e)).toBeTruthy();
    }
    const id = trackServerEvent('quote_calculator_conversion', { value: 1200, currency: 'GBP' });
    const p = mockSend.mock.calls.at(-1)![0];
    expect(p.event_name).toBe('quote_calculator_conversion');
    expect(p.event_id).toBe(id);
    expect(p.value).toBe(1200);
  });

  it('contact submit: dataLayer with the shared id, no browser gateway leg', () => {
    const r = trackContactSubmit({ email: 'a@b.com', phone: '0620123456' });
    expect(lastEvent('contact_submit')!.event_id).toBe(r.eventId);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('the lead never gets stuck', () => {
  it('a hanging worker does NOT block the conversion (fire-and-forget)', () => {
    // Worker promise never resolves — simulates a dead/slow gateway. A click
    // conversion still has a browser gateway leg (form events no longer do).
    mockSend.mockImplementation(() => new Promise<boolean>(() => { /* never resolves */ }));
    const id = trackPhoneConversion({ phone: '07123456789' });
    // Returns synchronously; the browser event is already in the dataLayer.
    expect(id).toBeTruthy();
    expect(lastEvent('phone_click')).toBeTruthy();
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it('a rejecting worker does NOT throw out of the conversion path', () => {
    mockSend.mockImplementation(() => Promise.reject(new Error('boom')));
    expect(() => trackLeadSubmit({ email: 'a@b.com', value: 100 })).not.toThrow();
    expect(lastEvent('lead_submit')).toBeTruthy();
  });

  it('value 0 is omitted from the dataLayer (no Smart Bidding poisoning) but the event still fires', () => {
    const r = trackLeadSubmit({ email: 'a@b.com', value: 0, currency: 'GBP' });
    expect(r.success).toBe(true);
    expect(lastEvent('lead_submit')!.value).toBeUndefined();
  });
});
