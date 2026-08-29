/**
 * EGY Google klikk-ID hagyhatja el a libet -- MINDKET tarolo-modellbol.
 *
 * A Google egy kattintashoz EGY azonositot ad: `gclid` VAGY `gbraid` VAGY
 * `wbraid` -- sosem tobbet. Az offline konverzio-feltoltes a ket-ID-s sort
 * ELUTASITJA, tehat a konverzio nem torzul, hanem ELVESZIK.
 *
 * MIERT EPP EZ A FAJL. A szabaly a kitben KET helyen el -- `gateway.ts`
 * (`collectAttribution`, a `__sb_attribution` last-touch blob) es
 * `persistence.ts` (`persistTrackingParams`/`getGclid`, a 90 napos `sb_tracking`
 * blob) --, mindketto alaposan dokumentalva. Merve viszont EGYIK SEM VOLT: a
 * 121 meglevo eset kozul egy sem emliti a `gbraid`-et vagy a `wbraid`-et.
 *
 * Egy dokumentalt, de nem mert szabaly pontosan olyan toresre var, mint amit a
 * kanonikus mag mar atelt (Serverside #99/#100, 6.4.0/6.4.1): ott a szabaly
 * harom peldanyban elt, szetsodrodott, es az elavult `_gcl_aw` suti legyozte a
 * friss URL-klikk-ID-t. Ez a fajl a ket peldany OSSZHANGJAT is rogziti.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { collectAttribution } from '../lib/gateway';
import {
  captureUrlParams, persistTrackingParams, getStoredData, getGclid, getSourceType,
} from '../lib/persistence';
import { resetAll, setCkyConsent, setUrl, setCookie } from './helpers';

const GOOGLE_KEYS = ['gclid', 'gbraid', 'wbraid'] as const;

function googleIdsIn(o: Record<string, unknown> | null | undefined): string[] {
  return o ? GOOGLE_KEYS.filter((k) => o[k]) : [];
}

/** A gateway-lab last-touch bloboja. */
const ATTR_KEY = '__sb_attribution';
function seedAttribution(a: Record<string, string>): void {
  localStorage.setItem(ATTR_KEY, JSON.stringify(a));
}
function storedAttribution(): Record<string, string> {
  const raw = localStorage.getItem(ATTR_KEY);
  return raw ? JSON.parse(raw) : {};
}

/** A persistence-lab 90 napos bloboja. */
const TRACKING_KEY = 'sb_tracking';
function seedTracking(d: Record<string, unknown>): void {
  localStorage.setItem(TRACKING_KEY, JSON.stringify({ timestamp: Date.now(), ...d }));
}

beforeEach(() => {
  resetAll();
  setCkyConsent({ analytics: true, marketing: true });
});

describe('gateway.ts -- collectAttribution', () => {
  it('az URL tobb Google-ID-je egyre esik ossze (gclid nyer)', () => {
    setUrl('/?gclid=G1&gbraid=B1&wbraid=W1');

    const a = collectAttribution();
    expect(googleIdsIn(a)).toEqual(['gclid']);
    expect(a.gclid).toBe('G1');
  });

  it('gclid nelkul a gbraid marad', () => {
    setUrl('/?gbraid=B1&wbraid=W1');
    expect(googleIdsIn(collectAttribution())).toEqual(['gbraid']);
  });

  it('friss gbraid KIUTI a tarolt gclid-et (ket kattintas nem keveredhet)', () => {
    seedAttribution({ gclid: 'G-regi-kattintas' });
    setUrl('/?gbraid=B-uj-kattintas');

    const a = collectAttribution();
    expect(googleIdsIn(a)).toEqual(['gbraid']);
    expect(a.gclid, 'a korabbi kattintas ID-je nem mehet a frissel egyutt').toBeUndefined();
  });

  it('friss Google-ID nelkul a tarolt ervenyben marad', () => {
    seedAttribution({ gclid: 'G-korabbi' });
    setUrl('/kapcsolat/');

    expect(collectAttribution().gclid).toBe('G-korabbi');
  });

  it('a hibas korszakbol orokolt paros ongyogyul (gclid marad)', () => {
    seedAttribution({ gclid: 'G-regi', gbraid: 'B-regi' });

    expect(googleIdsIn(collectAttribution())).toEqual(['gclid']);
  });

  it('a gyogyitas a TAROLT blobba is beirodik', () => {
    setUrl('/?gclid=G1&gbraid=B1');
    collectAttribution();

    expect(googleIdsIn(storedAttribution())).toEqual(['gclid']);
  });

  it('a `_gcl_aw` suti-fallback NEM sul el, ha az URL mar hozott Google-ID-t', () => {
    // Ez a kanonikus 6.4.1 tanulsaga: az elavult suti legyozte a friss URL-jelet.
    setCookie('_gcl_aw', 'GCL.1712345678.G-sutibol');
    setUrl('/?gbraid=B-friss');

    const a = collectAttribution();
    expect(googleIdsIn(a)).toEqual(['gbraid']);
    expect(a.gclid).toBeUndefined();
  });

  it('Google-ID nelkuli URL-en a suti-fallback tovabbra is ler', () => {
    setCookie('_gcl_aw', 'GCL.1712345678.G-sutibol');
    setUrl('/?utm_source=google');

    expect(collectAttribution().gclid).toBe('G-sutibol');
  });

  it('a mas halozatok ID-jei erintetlenek', () => {
    seedAttribution({ fbclid: 'FB-1', msclkid: 'MS-1' });
    setUrl('/?gclid=G1');

    const a = collectAttribution();
    expect(a.fbclid).toBe('FB-1');
    expect(a.msclkid).toBe('MS-1');
    expect(googleIdsIn(a)).toEqual(['gclid']);
  });
});

describe('persistence.ts -- a 90 napos sb_tracking blob', () => {
  it('az URL tobb Google-ID-jebol egy kerul a taroloba', () => {
    setUrl('/?gclid=G1&gbraid=B1');
    captureUrlParams();
    persistTrackingParams();

    expect(googleIdsIn(getStoredData())).toEqual(['gclid']);
  });

  it('friss gbraid kiuti a tarolt gclid-et', () => {
    seedTracking({ gclid: 'G-regi' });
    setUrl('/?gbraid=B-uj');
    captureUrlParams();
    persistTrackingParams();

    const d = getStoredData();
    expect(googleIdsIn(d)).toEqual(['gbraid']);
    expect(d?.gclid).toBeUndefined();
  });

  it('a legacy paros ONGYOGYUL olvasaskor, es vissza is irodik', () => {
    seedTracking({ gclid: 'G-regi', wbraid: 'W-regi' });

    expect(googleIdsIn(getStoredData())).toEqual(['gclid']);
    // A gyogyitas nem csak a visszaadott masolatra vonatkozik:
    expect(googleIdsIn(JSON.parse(localStorage.getItem(TRACKING_KEY) as string))).toEqual(['gclid']);
  });

  it('ep blobot (0 vagy 1 ID) nem bant', () => {
    seedTracking({ gclid: 'G-egyedul' });
    expect(getStoredData()?.gclid).toBe('G-egyedul');
  });

  it('a marketing-consent hianyaban nem is tarolunk', () => {
    setCkyConsent({ analytics: true, marketing: false });
    setUrl('/?gclid=G1');
    captureUrlParams();
    persistTrackingParams();

    expect(getStoredData()).toBeNull();
  });
});

describe('persistence.ts -- getGclid forras-sorrendje', () => {
  it('az URL gclid-je nyer a tarolt felett', () => {
    seedTracking({ gclid: 'G-tarolt' });
    setUrl('/?gclid=G-url');

    expect(getGclid()).toBe('G-url');
  });

  it('MAS Google-ID az URL-ben -> a tarolt gclid NEM adhato ehhez a konverziohoz', () => {
    // iOS-forgalom: az aktualis kattintas gbraid-ot adott, tehat a tarolt gclid
    // egy KORABBI kattintase. Osszeadva ket kattintasbol allo sort kapnank.
    seedTracking({ gclid: 'G-korabbi-kattintas' });
    setUrl('/?gbraid=B-mostani');

    expect(getGclid()).toBeNull();
  });

  it('Google-ID nelkuli URL-en a tarolt gclid ervenyes', () => {
    seedTracking({ gclid: 'G-tarolt' });
    setUrl('/kapcsolat/');

    expect(getGclid()).toBe('G-tarolt');
  });
});

describe('a ket tarolo-modell OSSZHANGJA', () => {
  // A kanonikus magban a szabaly azert lett kulon primitiv (Serverside #101),
  // mert harom peldanyban elt es szetsodrodott. A kitben ket peldany van --
  // ez az eset akkor szol, ha egymastol elternenek.
  it('ugyanaz az URL ugyanazt a Google-ID-t adja mindket agon', () => {
    setUrl('/?gclid=G1&gbraid=B1');
    captureUrlParams();
    persistTrackingParams();

    const fromGateway = googleIdsIn(collectAttribution());
    const fromPersistence = googleIdsIn(getStoredData());

    expect(fromGateway).toEqual(['gclid']);
    expect(fromPersistence).toEqual(fromGateway);
  });

  it('friss gbraid eseten is egyezik a ket ag', () => {
    seedAttribution({ gclid: 'G-regi' });
    seedTracking({ gclid: 'G-regi' });
    setUrl('/?gbraid=B-uj');
    captureUrlParams();
    persistTrackingParams();

    expect(googleIdsIn(collectAttribution())).toEqual(['gbraid']);
    expect(googleIdsIn(getStoredData())).toEqual(['gbraid']);
  });

  it('a paid-besorolas barmelyik Google-ID-re all', () => {
    seedTracking({ gbraid: 'B1' });
    expect(getSourceType()).toBe('paid');
  });
});
