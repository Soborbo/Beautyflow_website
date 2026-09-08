import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetAll, setCkyConsent, clearCkyConsent } from './helpers';

/**
 * BELÉPÉSI OLDAL ÉS HIVATKOZÓ — a lead honnan jött, nem az, hol nyomott submitot.
 *
 * ── A hiba, amit ez a fájl lezár ─────────────────────────────────────────────
 * A CRM `lead_attribution` 47 élő beautyflow-sorából a `landing_url` NULLA
 * sorban volt kitöltve, és a `referrer` sem. Nem elrontott érték ment ki:
 * mindkét mező egyszerűen HIÁNYZOTT az `/api/contact` és az `/api/boranalizis`
 * `attribution` blokkjából. A klikk-azonosítók mentek, a belépési kontextus nem.
 *
 * ── Miért `vi.resetModules()` ────────────────────────────────────────────────
 * NEM kényelmi eszköz. Az `entry` puffer MODUL-SZINTŰ memória, tehát egy hard
 * page loadot csak modul-újratöltéssel lehet hűen reprodukálni. Egy azonos
 * modulpéldányon futó teszt pont azt a hibát nem látná meg, amiért ez a munka
 * elindult: hogy a jel az oldalváltásnál elvész.
 */

const ORIGIN = window.location.origin;

function setReferrer(value: string): void {
  Object.defineProperty(document, 'referrer', { value, configurable: true });
}

async function pageLoad(url: string, referrer: string) {
  vi.resetModules();
  window.history.replaceState({}, '', url);
  setReferrer(referrer);
  const mod = await import('../lib/entry-attribution');
  mod.captureEntrySignals();
  return mod;
}

/** Amit a kattintás-dekorátor csinál a cél-URL-lel. */
function carry(path: string, params: Record<string, string>): string {
  const url = new URL(path, ORIGIN);
  for (const [k, v] of Object.entries(params)) {
    if (!url.searchParams.has(k)) url.searchParams.set(k, v);
  }
  return url.pathname + url.search;
}

const CARRY_TARGETS = [
  'ingyenes-konzultacio',
  'free-consultation',
  'boranalizis',
  'beautyflow-buda',
  'beautyflow-pest',
];

function isCarryTarget(path: string): boolean {
  return path.split('/').filter(Boolean).some((s) => CARRY_TARGETS.includes(s));
}

async function journey(entryUrl: string, referrer: string, path: string[]) {
  let mod = await pageLoad(entryUrl, referrer);
  let previous = ORIGIN + new URL(entryUrl, ORIGIN).pathname;

  for (const next of path) {
    const carried = isCarryTarget(next) ? carry(next, mod.entryParamsForNavigation()) : next;
    mod = await pageLoad(carried, previous);
    previous = ORIGIN + next;
  }

  return { fields: mod.entryAttributionFields(), mod };
}

beforeEach(() => {
  resetAll();
  clearCkyConsent();
  setReferrer('');
});

describe('a belépési oldal túléli az űrlap-oldalra kattintást', () => {
  const LANDING = '/dioda-lezeres-szortelenites/';
  const PAID = `${LANDING}?gclid=CJ_TEST_123&utm_source=google&utm_medium=cpc`;

  it.each([
    ['döntés nélkül (UNKNOWN)', 'unknown'],
    ['megadott hozzájárulással (GRANTED)', 'granted'],
    ['visszavont hozzájárulással (DENIED)', 'denied'],
  ])('fizetett kattintás %s → a belépési oldal a kezelés-oldal', async (_label, state) => {
    if (state === 'granted') setCkyConsent({ marketing: true });
    if (state === 'denied') setCkyConsent({ marketing: false });

    const { fields } = await journey(PAID, 'https://www.google.com/search?q=szortelenites', [
      '/ingyenes-konzultacio/',
    ]);

    expect(
      fields.landing_url,
      'a submit-oldal került a belépési oldal helyére, vagy a mező üres maradt',
    ).toBe(`${ORIGIN}${LANDING}`);
  });

  it('a kvíz (/boranalizis/) és az angol konzultációs oldal is megkapja', async () => {
    const quiz = await journey('/anti-aging/', '', ['/boranalizis/']);
    expect(quiz.fields.landing_url).toBe(`${ORIGIN}/anti-aging/`);

    const en = await journey('/en/laser-hair-removal/', '', ['/en/free-consultation/']);
    expect(en.fields.landing_url).toBe(`${ORIGIN}/en/laser-hair-removal/`);
  });

  it('a szalon-oldalak (ContactForm) is hordozási célpontok', async () => {
    const { fields } = await journey('/arak/', '', ['/beautyflow-buda/']);
    expect(fields.landing_url).toBe(`${ORIGIN}/arak/`);
  });

  it('közvetlenül az űrlap-oldalra érkezve a belépési oldal AZ az oldal', async () => {
    const { fields } = await journey('/ingyenes-konzultacio/', 'https://www.bing.com/search', []);
    expect(fields.landing_url).toBe(`${ORIGIN}/ingyenes-konzultacio/`);
  });
});

describe('hivatkozó (referrer)', () => {
  it('organikus látogatás döntés nélkül: valódi belépési oldal ÉS külső hivatkozó', async () => {
    const { fields } = await journey('/rolunk/', 'https://www.google.com/search?q=beautyflow', [
      '/ingyenes-konzultacio/',
    ]);

    expect(fields.landing_url).toBe(`${ORIGIN}/rolunk/`);
    // Query-string nélkül: a hivatkozó paraméterei az Ő dolga.
    expect(fields.referrer).toBe('https://www.google.com/search');
  });

  it('a BELSŐ hivatkozó nem írja felül a külsőt', async () => {
    const { fields } = await journey('/carbon-peeling/', 'https://chatgpt.com/', [
      '/ingyenes-konzultacio/',
    ]);

    expect(fields.referrer).toBe('https://chatgpt.com/');
  });

  it('csak belső hivatkozó → a mező ÜRES, nem a saját domainünk', async () => {
    const { fields } = await journey('/', `${ORIGIN}/valami-mas/`, ['/ingyenes-konzultacio/']);

    expect(fields.referrer).toBe('');
    expect(fields.referrer).not.toContain(ORIGIN);
  });

  it('idegen originra mutató `_referrer`/`_landing` NEM lép be', async () => {
    const a = await pageLoad('/ingyenes-konzultacio/?_referrer=javascript:alert(1)', '');
    expect(a.getEntryReferrer()).toBeUndefined();

    const b = await pageLoad('/ingyenes-konzultacio/?_landing=https://evil.example/x', '');
    expect(b.getEntryLandingUrl()).toBe(`${ORIGIN}/ingyenes-konzultacio/`);

    const c = await pageLoad('/ingyenes-konzultacio/?_landing=//evil.example/x', '');
    expect(c.getEntryLandingUrl()).toBe(`${ORIGIN}/ingyenes-konzultacio/`);
  });
});

describe('consent', () => {
  it('GRANTED: a belépési jel a store-ba is bekerül — ez hidalja át a tetszőleges útvonalat', async () => {
    setCkyConsent({ marketing: true });
    await pageLoad('/dioda-lezeres-szortelenites/', 'https://www.google.com/');

    const stored = JSON.parse(localStorage.getItem('__sb_attribution') || '{}');
    expect(stored.landing_page).toBe(`${ORIGIN}/dioda-lezeres-szortelenites/`);
    expect(stored.referrer).toBe('https://www.google.com/');

    // Egy tetszőleges (NEM hordozott) oldal után is a store-ból jön a belépés.
    const mod = await pageLoad('/rolunk/', `${ORIGIN}/dioda-lezeres-szortelenites/`);
    expect(mod.getEntryLandingUrl()).toBe(`${ORIGIN}/dioda-lezeres-szortelenites/`);
  });

  it('UNKNOWN és DENIED: az eszközre semmi nem íródik', async () => {
    await pageLoad('/dioda-lezeres-szortelenites/', 'https://www.google.com/');
    expect(localStorage.getItem('__sb_attribution')).toBeNull();

    setCkyConsent({ marketing: false });
    await pageLoad('/dioda-lezeres-szortelenites/', 'https://www.google.com/');
    expect(localStorage.getItem('__sb_attribution')).toBeNull();
  });

  it('DENIED: a MÁR KIÍRT store-t sem olvassuk vissza', async () => {
    setCkyConsent({ marketing: true });
    await pageLoad('/dioda-lezeres-szortelenites/', 'https://www.google.com/');
    expect(localStorage.getItem('__sb_attribution')).not.toBeNull();

    setCkyConsent({ marketing: false });
    const mod = await pageLoad('/ingyenes-konzultacio/', `${ORIGIN}/dioda-lezeres-szortelenites/`);

    expect(mod.getEntryLandingUrl()).toBe(`${ORIGIN}/ingyenes-konzultacio/`);
  });

  it('DENIED alatt is átér a belépési jel az URL-en — az nem eszközre írás', async () => {
    setCkyConsent({ marketing: false });

    const { fields } = await journey('/carbon-peeling/', 'https://www.google.com/', [
      '/ingyenes-konzultacio/',
    ]);

    expect(fields.landing_url).toBe(`${ORIGIN}/carbon-peeling/`);
    expect(fields.referrer).toBe('https://www.google.com/');
    expect(localStorage.getItem('__sb_attribution')).toBeNull();
  });

  it('a belépési jelek közé SOSEM kerül klikk-azonosító', async () => {
    setCkyConsent({ marketing: true });
    const mod = await pageLoad('/anti-aging/?gclid=CJ_TEST_123&fbclid=FB_1&msclkid=MS_1', '');
    const params = mod.entryParamsForNavigation();

    const serialized = JSON.stringify(params);
    expect(serialized).not.toContain('CJ_TEST_123');
    expect(serialized).not.toContain('FB_1');
    expect(serialized).not.toContain('MS_1');
    expect(Object.keys(params).sort()).toEqual(['_landing']);
  });
});

describe('entryAttributionFields — a NÉGY payload-építő közös forrása', () => {
  it('mindig mindkét kulcsot megadja, stringként', async () => {
    // A site négy helyen épít attribúció-objektumot, és mind a négy ezt a
    // helpert spreadeli. Ha a kulcskészlet változik, ott némán hiányozna egy
    // mező — ezért az ALAKOT is rögzítjük, nem csak az értékeket.
    const { fields } = await journey('/', '', []);

    expect(Object.keys(fields).sort()).toEqual(['landing_url', 'referrer']);
    expect(typeof fields.landing_url).toBe('string');
    expect(typeof fields.referrer).toBe('string');
  });
});

describe('a címsor takarítása', () => {
  it('az `initEntryAttribution` kiolvassa, majd eltünteti a belépési paramétereket', async () => {
    vi.resetModules();
    window.history.replaceState(
      {},
      '',
      '/ingyenes-konzultacio/?_landing=%2Fanti-aging%2F&utm_source=google',
    );
    setReferrer('');
    const mod = await import('../lib/entry-attribution');

    mod.initEntryAttribution();

    expect(mod.getEntryLandingUrl()).toBe(`${ORIGIN}/anti-aging/`);
    // A `_landing` nem kerülhet a GA4 `page_location`-be.
    expect(window.location.search).not.toContain('_landing');
    // A kampánycímkéket viszont nem bántjuk: azok a felhasználó URL-je.
    expect(window.location.search).toContain('utm_source=google');
  });
});
