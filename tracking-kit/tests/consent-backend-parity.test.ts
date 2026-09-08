import { describe, it, expect } from 'vitest';
import {
  encodeSboConsentCookie,
  SBO_CONSENT_MAX_AGE_S,
  parseSboConsentCookie,
  type SboConsentState
} from '../lib/consent-sbo-state';
import {
  readSboConsentCookieHeader,
  readConsentFromCookie,
  buildConsentSources
} from '../../src/lib/tracking/gateway-dispatch';

/**
 * A SITE-BACKEND consent-parserenek PARITASA a bongeszo-libbel.
 *
 * ── A RES ────────────────────────────────────────────────────────────────────
 * A bongeszo-lab (`tracking-kit/lib/consent-sbo-state.ts`) a fork-migracio ota
 * BITRE KANONIKUS: ismeri a sajat `sbo_consent` sutit (`v2` formatum,
 * policy-verzioval, lejarattal). A szerver-lab (`src/lib/tracking/
 * gateway-dispatch.ts` — SITE-fajl, onalloan masolodik) viszont EGYALTALAN NEM
 * ismeri: sem a `readConsentFromCookie` kapuja, sem a `buildConsentSources`
 * telemetriaja nem olvas mast, mint a `cookieyes-consent` sutit.
 *
 * Kovetkezmeny a `PUBLIC_TRACKING_CONSENT_PROVIDER=sbo` atallitasanak NAPJAN: a
 * bongeszo `sbo_consent`-et ir, a CookieYes sutije pedig eltunik. A szerver-lab
 * ezert SEMMILYEN dontest nem talal -> `require_consent: true` mellett
 * fail-closed kihagyja a hirdetesi platformokat — nemán, MINDEN form-POST
 * konverzion. A bongeszo-lab kozben ugyanazt a latogatot ervenyes „igen"-nek
 * latja: a ket lab ugyanarrol az emberrol mast gondol.
 *
 * A `BACKEND_LIB_VERSION` sajat docstringje ezt a kockazatot MAR NEVEN NEVEZI
 * („a sajat CMP-re valo atallas utan viszont CSENDBEN veszne el a
 * consent-log") — a kapu-oldali fele viszont nyitva maradt.
 *
 * Miert nem fogta meg semmi: az atallitas puszta env-flip + rebuild,
 * KODVALTOZAS NELKUL, es a bongeszo-lab mar ma sbo-kepes, tehat a valtas onnan
 * nezve biztonsagosnak latszik. A site ma CookieYes-en fut, ezert a res
 * LAPPANGO — de elesitve var.
 *
 * Ez a fajl UGYANAZON a fixture-tablan futtatja a ket parsert. Ha barmelyik
 * oldal szabalya elmozdul, ITT bukik — nem elesben, csendben.
 */

const POLICY = '2026-08-a';
const nowSec = () => 1_800_000_000;

function state(over: Partial<SboConsentState> = {}): SboConsentState {
  return {
    analytics: true,
    marketing: true,
    revision: 1,
    decision: 'accept_all',
    consentId: 'a1b2c3d4-e5f6-7890',
    decidedAtSec: nowSec() - 60,
    policyVersion: POLICY,
    ...over
  };
}

/** A backend oldali olvasat ugyanabbol a nyers suti-ertekbol. */
function backend(raw: string, expectedPolicyVersion?: string) {
  return readSboConsentCookieHeader(`sbo_consent=${encodeURIComponent(raw)}`, {
    expectedPolicyVersion,
    nowSec: nowSec()
  });
}

/** A bongeszo-lib olvasata ugyanarrol. */
function browser(raw: string, expectedPolicyVersion?: string) {
  return parseSboConsentCookie(raw, expectedPolicyVersion, nowSec());
}

const FIXTURES: Array<[string, string]> = [
  ['ervenyes accept_all', encodeSboConsentCookie(state())],
  [
    'ervenyes reject_all',
    encodeSboConsentCookie(state({ analytics: false, marketing: false, decision: 'reject_all' }))
  ],
  ['ervenyes custom (analytics-only)', encodeSboConsentCookie(state({ marketing: false, decision: 'custom' }))],
  [
    'ervenyes withdrawn',
    encodeSboConsentCookie(state({ analytics: false, marketing: false, decision: 'withdrawn' }))
  ],
  // A REGI formatum: mindket oldalnak el KELL utasitania. Egy szerveroldali
  // „meg elfogadom a v1-et" uj divergencia lenne, csak a masik iranyba.
  ['REGI v1-es suti', `v1.1.1.1.accept_all.a1b2c3d4-e5f6-7890.${nowSec() - 60}`],
  ['hianyzo mezo (7 elem, v2 fejjel)', `v2.1.1.1.accept_all.a1b2c3d4-e5f6-7890.${nowSec() - 60}`],
  ['ismeretlen decision', `v2.1.1.1.maybe.a1b2c3d4-e5f6-7890.${nowSec() - 60}.${POLICY}`],
  ['decision↔kategoria ellentmondas', `v2.1.0.1.accept_all.a1b2c3d4-e5f6-7890.${nowSec() - 60}.${POLICY}`],
  ['revision=0', `v2.1.1.0.accept_all.a1b2c3d4-e5f6-7890.${nowSec() - 60}.${POLICY}`],
  ['tulcsordulo revision', `v2.1.1.10001.accept_all.a1b2c3d4-e5f6-7890.${nowSec() - 60}.${POLICY}`],
  ['nem kanonikus revision (01)', `v2.1.1.01.accept_all.a1b2c3d4-e5f6-7890.${nowSec() - 60}.${POLICY}`],
  ['rovid consent_id', `v2.1.1.1.accept_all.abc.${nowSec() - 60}.${POLICY}`],
  ['ures policy-verzio', `v2.1.1.1.accept_all.a1b2c3d4-e5f6-7890.${nowSec() - 60}.`],
  ['nem szam decidedAt', `v2.1.1.1.accept_all.a1b2c3d4-e5f6-7890.tegnap.${POLICY}`],
  ['LEJART dontes', encodeSboConsentCookie(state({ decidedAtSec: nowSec() - SBO_CONSENT_MAX_AGE_S - 1 }))],
  ['epp meg ervenyes dontes', encodeSboConsentCookie(state({ decidedAtSec: nowSec() - SBO_CONSENT_MAX_AGE_S }))],
  ['ures string', '']
];

describe('sbo_consent — a site-backend es a bongeszo-lib UGYANAZT olvassa', () => {
  for (const [label, raw] of FIXTURES) {
    it(`${label}: a ket parser egyetert`, () => {
      const b = browser(raw, POLICY);
      const s = backend(raw, POLICY);
      expect(
        Boolean(s),
        `${label}: ervenyesseg-elteres (bongeszo=${Boolean(b)}, backend=${Boolean(s)})`
      ).toBe(Boolean(b));
      if (b && s) {
        expect(s.analytics).toBe(b.analytics);
        expect(s.marketing).toBe(b.marketing);
        expect(s.revision).toBe(b.revision);
        expect(s.consentId).toBe(b.consentId);
        expect(s.decidedAtSec).toBe(b.decidedAtSec);
        expect(s.policyVersion).toBe(b.policyVersion);
      }
    });
  }
});

describe('a konkret regresszio, ami az sbo-atallitas napjan nemán olt volna', () => {
  const raw = encodeSboConsentCookie(state());
  const header = `sbo_consent=${encodeURIComponent(raw)}`;

  it('a KAPU dontest ad az sbo sutibol — nem esik fail-closed agra', () => {
    const consent = readConsentFromCookie(header, {
      expectedPolicyVersion: POLICY,
      nowSec: nowSec()
    });
    expect(consent).toEqual({
      ad_user_data: 'GRANTED',
      ad_personalization: 'GRANTED',
      ad_storage: 'GRANTED',
      analytics_storage: 'GRANTED'
    });
  });

  it('a reject_all sbo suti DENIED-et ad (nem „nincs dontes")', () => {
    const rej = encodeSboConsentCookie(
      state({ analytics: false, marketing: false, decision: 'reject_all' })
    );
    const consent = readConsentFromCookie(`sbo_consent=${encodeURIComponent(rej)}`, {
      expectedPolicyVersion: POLICY,
      nowSec: nowSec()
    });
    expect(consent?.ad_storage).toBe('DENIED');
    expect(consent?.analytics_storage).toBe('DENIED');
  });

  it('a TELEMETRIA is az sbo-t jelenti forraskent', () => {
    const s = buildConsentSources(header, { expectedPolicyVersion: POLICY, nowSec: nowSec() });
    expect(s.source_used).toBe('sbo_cookie');
  });

  it('MAS policy-verziora adott „igen" → nincs dontes (a bongeszo is ujrakerdez)', () => {
    const old = encodeSboConsentCookie(state({ policyVersion: '2026-01-a' }));
    expect(backend(old, POLICY)).toBeNull();
    expect(browser(old, POLICY)).toBeNull();
  });

  it('policy-verzio megadasa NELKUL a suti szerkezetileg meg ervenyes — de a site-nak at KELL adnia', () => {
    const old = encodeSboConsentCookie(state({ policyVersion: '2026-01-a' }));
    // Ez a megengedo ag szandekos: a CookieYes-site-oknak nincs policy-verzioja,
    // es egy kotelezo mezo ott minden hivast elrontana. Az sbo site-ok viszont
    // atadjak — a GatewayEnv.TRACKING_POLICY_VERSION erre valo.
    expect(backend(old)).not.toBeNull();
  });
});

describe('CookieYes-ag: a mai viselkedes valtozatlan', () => {
  it('a CookieYes suti tovabbra is dontest ad (a site MA ezen fut)', () => {
    const consent = readConsentFromCookie('cookieyes-consent=analytics:yes,advertisement:yes');
    expect(consent).toEqual({
      ad_user_data: 'GRANTED',
      ad_personalization: 'GRANTED',
      ad_storage: 'GRANTED',
      analytics_storage: 'GRANTED'
    });
  });

  it('a `marketing` kulcs NEM helyettesiti az `advertisement`-et (a 2026-07-i flotta-hibaosztaly)', () => {
    const consent = readConsentFromCookie('cookieyes-consent=analytics:yes,marketing:yes');
    expect(consent?.ad_storage).toBe('DENIED');
  });

  it('sbo suti NELKUL a telemetria tovabbra is cookieyes_cookie-t jelent', () => {
    const s = buildConsentSources('cookieyes-consent=analytics:yes,advertisement:yes');
    expect(s.source_used).toBe('cookieyes_cookie');
  });

  it('hibas percent-kodolas nem dob a lead-utvonalon', () => {
    expect(() => readConsentFromCookie('cookieyes-consent=%zz')).not.toThrow();
    expect(() => buildConsentSources('cookieyes-consent=%zz')).not.toThrow();
  });
});
