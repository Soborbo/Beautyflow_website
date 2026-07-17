/**
 * Server-side gateway dispatch (src/lib/tracking/gateway-dispatch.ts) — the
 * backstop leg the lead endpoints (/api/contact, /api/boranalizis) fire.
 *
 * Focus here: the PAYLOAD SHAPE the gateway receives, especially the Meta
 * browser IDs (fbp/fbc). Those are collected by the client, POSTed with the
 * form, and MUST be forwarded top-level and PLAIN (never hashed, never nested
 * into user_data) — the gateway reads `payload.fbp` / `payload.fbc` and maps
 * them onto the CAPI user_data itself. Hashing or dropping them silently
 * degrades Meta EMQ and Pixel↔CAPI attribution.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  buildGatewayPayload,
  sendGatewayConversion,
  type GatewayConversionInput,
  type GatewayEnv,
} from '../../src/lib/tracking/gateway-dispatch';

function baseInput(): GatewayConversionInput {
  return {
    eventName: 'contact_form_submitted',
    eventId: 'E1',
    userData: { email: 'a@b.com', phone_number: '+36201234567' },
  };
}

describe('buildGatewayPayload — fbp/fbc forwarding', () => {
  it('forwards fbp and fbc top-level, PLAIN (not inside user_data)', () => {
    const p = buildGatewayPayload({
      ...baseInput(),
      fbp: 'fb.1.1700000000.123456',
      fbc: 'fb.1.1700000000.fbclidABC',
    });
    expect(p.fbp).toBe('fb.1.1700000000.123456');
    expect(p.fbc).toBe('fb.1.1700000000.fbclidABC');
    // NOT nested into user_data — the gateway maps them onto CAPI itself.
    expect((p.user_data as Record<string, unknown>).fbp).toBeUndefined();
    expect((p.user_data as Record<string, unknown>).fbc).toBeUndefined();
  });

  it('omits fbp/fbc entirely when absent or empty (no blank fields shipped)', () => {
    const missing = buildGatewayPayload(baseInput());
    expect('fbp' in missing).toBe(false);
    expect('fbc' in missing).toBe(false);

    const empty = buildGatewayPayload({ ...baseInput(), fbp: '', fbc: '' });
    expect('fbp' in empty).toBe(false);
    expect('fbc' in empty).toBe(false);
  });

  it('keeps the existing contract intact around the new fields', () => {
    const p = buildGatewayPayload({
      ...baseInput(),
      fbp: 'fb.1.1.2',
      value: 5000,
      currency: 'HUF',
      attribution: { fbclid: 'F1', gclid: undefined },
    });
    expect(p.event_name).toBe('contact_form_submitted');
    expect(p.event_id).toBe('E1');
    expect(p.value).toBe(5000);
    expect(p.currency).toBe('HUF');
    expect(p.user_data).toEqual({ email: 'a@b.com', phone_number: '+36201234567' });
    expect(p.attribution).toEqual({ fbclid: 'F1' });
  });

  it('still omits value AND currency together when value is 0 (CLAUDE.md #3)', () => {
    const p = buildGatewayPayload({ ...baseInput(), value: 0, currency: 'HUF', fbp: 'fb.1.1.2' });
    expect('value' in p).toBe(false);
    expect('currency' in p).toBe(false);
    expect(p.fbp).toBe('fb.1.1.2');
  });
});

describe('sendGatewayConversion — fbp/fbc reach the wire', () => {
  it('the POST body to /api/event/conversion-server carries top-level fbp/fbc', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    const env: GatewayEnv = {
      TRACKING_GATEWAY_TOKEN: 'tok',
      SITE_URL: 'https://beautyflow.pro',
    };

    const res = await sendGatewayConversion(
      env,
      { ...baseInput(), fbp: 'fb.1.1700000000.123456', fbc: 'fb.1.1700000000.fbclidABC' },
      { fetchImpl },
    );
    expect(res.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledOnce();

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe('https://beautyflow.pro/api/event/conversion-server');
    const body = JSON.parse(init.body);
    expect(body.fbp).toBe('fb.1.1700000000.123456');
    expect(body.fbc).toBe('fb.1.1700000000.fbclidABC');
    expect(body.user_data.fbp).toBeUndefined();
  });
});
