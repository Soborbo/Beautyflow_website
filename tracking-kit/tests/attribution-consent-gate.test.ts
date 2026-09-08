import { describe, it, expect, beforeEach } from 'vitest';
import { collectAttribution } from '../lib/gateway';
import { ATTR_STORAGE_KEY, getStorageReadBlocked, resetStorageReadBlocked } from '../lib/persistence';

/**
 * A `__sb_attribution` TAROLO CONSENT-KAPUJA.
 *
 * ── A res, amit ez a fajl lezar ──────────────────────────────────────────────
 * A fork `gateway.ts`-e sajat, KAPU NELKULI `readStoredAttribution` /
 * `writeStoredAttribution`-t hasznalt, mikozben a `persistence.ts` minden irasa es
 * olvasasa consent-kapu mogott van. Igy a `collectAttribution()` marketing consent
 * NELKUL is irt localStorage-ba (`landing_page`, `referrer`, UTM-ek). Klikk-ID nem
 * kerult bele (azt a meglevo ad-consent ag kiszedi), de a terminal-tarolora iras
 * MAGA engedelykoteles (PECR/GDPR) — nem az szamit, PII-e az ertek.
 *
 * ── Miert nem szul ez attribucio-vesztest ────────────────────────────────────
 * A consent ELOTTI landolast a MASIK tarolo fedi: a boot `captureUrlParams()`-szal
 * EFEMER MEMORIABA olvassa az URL-jeleket, es a grant pillanataban irja ki
 * (`onConsentChange -> persistTrackingParams`). A kanonikus mag pontosan igy
 * viselkedik: az `__sb_attribution` nala is CSAK consent mellett irodik.
 */

function setConsent(marketing: boolean): void {
  (window as unknown as Record<string, unknown>).getCkyConsent = () => ({
    isUserActionCompleted: true,
    categories: { analytics: true, advertisement: marketing },
  });
}

function goTo(search: string): void {
  window.history.replaceState({}, '', `/${search}`);
}

beforeEach(() => {
  localStorage.clear();
  resetStorageReadBlocked();
  goTo('');
});

describe('iras — consent nelkul nem kerul semmi a terminalra', () => {
  it('marketing consent NELKUL a collectAttribution nem ir localStorage-ba', () => {
    setConsent(false);
    goTo('?gclid=A&utm_source=google');
    collectAttribution();
    expect(localStorage.getItem(ATTR_STORAGE_KEY)).toBeNull();
  });

  it('marketing consent MELLETT ir (a mukodes nem serul)', () => {
    setConsent(true);
    goTo('?gclid=A&utm_source=google');
    const a = collectAttribution();
    expect(a.gclid).toBe('A');
    const raw = localStorage.getItem(ATTR_STORAGE_KEY);
    expect(raw).toContain('utm_source');
  });
});

describe('olvasas — consent nelkul nem olvassuk a korabbi blobot', () => {
  it('a tarolt attribucio nem szivarog vissza consent nelkul', () => {
    setConsent(true);
    goTo('?utm_source=hirlevel');
    collectAttribution();
    expect(localStorage.getItem(ATTR_STORAGE_KEY)).toContain('hirlevel');

    setConsent(false);
    goTo('');
    const a = collectAttribution();
    expect(a.utm_source).toBeUndefined();
  });

  it('a blokkolt olvasas a telemetriaba kerul (kulcs, sosem ertek)', () => {
    setConsent(true);
    goTo('?utm_source=hirlevel');
    collectAttribution();

    setConsent(false);
    resetStorageReadBlocked();
    goTo('');
    collectAttribution();
    const r = getStorageReadBlocked();
    expect(r.blocked).toBe(true);
    expect(r.keys).toContain(ATTR_STORAGE_KEY);
    for (const k of r.keys) expect(k).not.toContain('hirlevel');
  });
});

describe('nincs attribucio-vesztes: a consent ELOTTI landolast a masik tarolo fedi', () => {
  it('grant utan a friss URL-jel ugyanugy eljut az attribucios objektumba', () => {
    setConsent(false);
    goTo('?gclid=A');
    collectAttribution();                    // consent nelkul: nem tarolunk
    expect(localStorage.getItem(ATTR_STORAGE_KEY)).toBeNull();

    setConsent(true);                        // a latogato elfogad, MEG az URL-en
    const a = collectAttribution();
    expect(a.gclid).toBe('A');
    expect(localStorage.getItem(ATTR_STORAGE_KEY)).toContain('A');
  });
});
