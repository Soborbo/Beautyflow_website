/**
 * Fázis D consent-telemetria a SZERVER-lábon
 * (`src/lib/tracking/gateway-dispatch.ts` — SITE-fájl, nem a kit része).
 *
 * MIÉRT CSAK A SZERVER-LÁB. A böngésző-lába a VENDOROLT `tracking-kit/`-ben él,
 * és a vendorolt fájlba írt site-patch garantáltan elveszik — oda a
 * verzió-jelentés a fork-migrációval jön (a kit `package.json`-je 5.0.0-t mond,
 * miközben 6.4.x-korabeli kódot visz, és a sodródás KÉTIRÁNYÚ). Ez a fájl
 * viszont site-fájl, ide biztonságos.
 *
 * MIÉRT KELL. Az élő ledger 2026-08-29-i mérése szerint ennek a site-nak MINDEN
 * receiptje `client_lib_version = NULL` (19 szerver + 32 böngésző / 14 nap),
 * tehát a sodródása mérhetetlen és a TRK-910-006 őr vakon áll rajta.
 *
 * A VERZIÓ-STRING FORMÁTUMA a legfontosabb eset: a gateway két úton olvas
 * verziót, eltérő szigorral, és mindkettőt el lehet rontani úgy, hogy az
 * CSENDBEN veszít adatot.
 */
import { describe, it, expect } from 'vitest';
import {
  BACKEND_LIB_VERSION,
  buildConsentSources,
  buildGatewayPayload,
  readConsentFromCookie,
} from '../../src/lib/tracking/gateway-dispatch';

const CKY = (opts: { advertisement: boolean; analytics: boolean }) =>
  `cookieyes-consent=consentid:test,consent:yes,necessary:yes,analytics:${
    opts.analytics ? 'yes' : 'no'
  },advertisement:${opts.advertisement ? 'yes' : 'no'}`;

describe('a verzió-string megfelel a gateway szabályainak', () => {
  it('átmegy a SZIGORÚ `VERSION_RE`-n, és nem tartalmaz `+`-t', () => {
    // A saját CMP consent-log útja (`parseConsentPayload`) a nem illeszkedő
    // értéknél a bejegyzést ELDOBJA. Ma még nem él, de a `+` ezen bukna.
    expect(BACKEND_LIB_VERSION).toMatch(/^[A-Za-z0-9_.-]{1,64}$/);
    expect(BACKEND_LIB_VERSION).not.toContain('+');
  });

  it('belefér a 32 karakteres vágásba', () => {
    // A `parseConsentSources` NEM hibázik, csak VÁG — egy túl hosszú név
    // csonkolva kerülne a ledgerbe, és senki nem venné észre.
    expect(BACKEND_LIB_VERSION.length).toBeLessThanOrEqual(32);
  });

  it('NEM esik a MIN_CLIENT_LIB_VERSION (6.1.0) alá', () => {
    // MÉRT tény, nem elmélet: a painless `0.0.0-painless-fork` jelölése adta a
    // TRK-910-006 EGYETLEN tüzelését 30 nap alatt, míg a trapez
    // `6.6.4-trapezlemezes-fork`-ja üres `finding_codes`-szal érkezik.
    const [maj, min, patch] = BACKEND_LIB_VERSION.split('.').slice(0, 3).map((p) => {
      const n = parseInt(p, 10);
      return Number.isFinite(n) ? n : 0;
    });
    const below = maj !== 6 ? maj < 6 : min !== 1 ? min < 1 : patch < 0;
    expect(below, `${BACKEND_LIB_VERSION} a 6.1.0 minimum alá esik`).toBe(false);
  });

  it('KIMONDJA, hogy fork — nem ad magát kanonikus kiadásnak', () => {
    expect(BACKEND_LIB_VERSION).toContain('-beautyflow-fork');
  });
});

describe('az `api` snapshot itt FOGALMILAG nem elérhető', () => {
  it('süti jelenlétében is null marad', () => {
    expect(buildConsentSources(CKY({ advertisement: true, analytics: true })).api).toEqual({
      analytics: null,
      marketing: null,
    });
  });
});

describe('`null` és `false` KÜLÖNBÖZŐ állítás', () => {
  it('nincs cookie-header → minden null, source_used = none', () => {
    expect(buildConsentSources(null)).toMatchObject({
      cookie: { analytics: null, marketing: null },
      source_used: 'none',
      client_lib_version: BACKEND_LIB_VERSION,
    });
  });

  it('elutasító süti → false, nem null', () => {
    expect(buildConsentSources(CKY({ advertisement: false, analytics: false })).cookie).toEqual({
      analytics: false,
      marketing: false,
    });
  });

  it('hiányzó KATEGÓRIA null marad a jelen lévő sütiben is', () => {
    expect(buildConsentSources('cookieyes-consent=consent:yes,analytics:yes').cookie).toEqual({
      analytics: true,
      marketing: null,
    });
  });

  it('más sütik mellől is kiolvassa a magáét', () => {
    const header = `_fbp=fb.1.2.3; ${CKY({ advertisement: true, analytics: true })}; _ga=GA1.1.5.6`;
    expect(buildConsentSources(header).cookie).toEqual({ analytics: true, marketing: true });
  });
});

describe('a telemetria nem buktathat leadet', () => {
  it('hibás percent-kódolás mellett sem dob — LOSSY ág', () => {
    expect(() => buildConsentSources('cookieyes-consent=%zz')).not.toThrow();
    expect(buildConsentSources('cookieyes-consent=%zz').client_lib_version).toBe(
      BACKEND_LIB_VERSION,
    );
  });

  it('a KAPU ugyanarra a sütire fail-closed marad — a két degradáció ELTÉR', () => {
    // Ez a #66 tanulsága ezen a site-on: a hibás consent-süti ne 500-azza a
    // lead-végpontot. A kapu nem találgat, a telemetria viszont nem is dobhat.
    expect(readConsentFromCookie('cookieyes-consent=%zz')).toBeUndefined();
  });
});

describe('a blokk KIMEGY a payloadban', () => {
  it('a buildGatewayPayload átviszi a consent_sources-t', () => {
    const payload = buildGatewayPayload({
      eventName: 'contact_form_submitted',
      eventId: 'evt-1',
      consentSources: buildConsentSources(CKY({ advertisement: true, analytics: true })),
    });

    expect(payload.consent_sources).toMatchObject({
      source_used: 'cookieyes_cookie',
      client_lib_version: BACKEND_LIB_VERSION,
    });
  });

  it('hiányában a mező egyszerűen kimarad', () => {
    const payload = buildGatewayPayload({ eventName: 'contact_form_submitted', eventId: 'evt-2' });
    expect(payload).not.toHaveProperty('consent_sources');
  });
});
