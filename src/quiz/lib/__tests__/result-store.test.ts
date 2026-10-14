// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveQuizResult, loadQuizResult, QUIZ_RESULT_TTL_SECONDS, type StoredQuizResult } from '../result-store';
import { resultStorageKey } from '../hash';

const record = {
  profile: { label: 'zsíros, érzékeny' },
  treatments: [],
  safe: true,
  utvonal: 'A',
  flags: [],
  baumann: { code: 'OSPT', slug: 'ospt', name: 'Teszt' },
} as unknown as StoredQuizResult;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe('kvíz-eredmény tárolás ugyanazon az eszközön (KV nélkül)', () => {
  it('mentés → visszaolvasás localStorage-ből, a Baumann-adattal', () => {
    expect(saveQuizResult('ABCDEF1234567890', record)).toBe(true);
    expect(loadQuizResult('ABCDEF1234567890')).toEqual(record);
  });

  it('dobó localStorage → sessionStorage tartalék', () => {
    const realSet = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (this === localStorage) throw new DOMException('QuotaExceededError');
      return realSet.call(this, k, v);
    });
    expect(saveQuizResult('H1H1H1H1', record)).toBe(true);
    expect(sessionStorage.getItem(resultStorageKey('H1H1H1H1'))).not.toBeNull();
    expect(loadQuizResult('H1H1H1H1')).toEqual(record);
  });

  it('régi (Baumann nélküli) bejegyzés is olvasható; sérült / profil nélküli nem', () => {
    localStorage.setItem(resultStorageKey('OLD12345'), JSON.stringify({ profile: { label: 'x' } }));
    expect(loadQuizResult('OLD12345')?.profile).toEqual({ label: 'x' });
    localStorage.setItem(resultStorageKey('BAD12345'), '{nope');
    expect(loadQuizResult('BAD12345')).toBeNull();
    localStorage.setItem(resultStorageKey('NOP12345'), JSON.stringify({ foo: 1 }));
    expect(loadQuizResult('NOP12345')).toBeNull();
    expect(loadQuizResult('MISSING1')).toBeNull();
  });
});

describe('kvíz-eredmény lejárata a böngészőben', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const t0 = Date.UTC(2026, 9, 14);

  it('az új bejegyzés lejárati mezőt kap, a visszaadott rekord nem tartalmazza', () => {
    expect(saveQuizResult('EXP0000001', record, t0)).toBe(true);
    const raw = JSON.parse(localStorage.getItem(resultStorageKey('EXP0000001'))!);
    expect(raw.bfExpiresAt).toBe(t0 + QUIZ_RESULT_TTL_SECONDS * 1000);
    expect(raw.profile).toEqual(record.profile); // régebbi bundle is olvassa
    expect(loadQuizResult('EXP0000001', t0 + DAY)).toEqual(record);
  });

  it('lejárt bejegyzés nem jelenik meg, és törlődik', () => {
    saveQuizResult('EXP0000002', record, t0);
    expect(loadQuizResult('EXP0000002', t0 + 61 * DAY)).toBeNull();
    expect(localStorage.getItem(resultStorageKey('EXP0000002'))).toBeNull();
  });

  it('legacy (lejárat nélküli) bejegyzés olvasható marad, és most kap lejáratot', () => {
    localStorage.setItem(resultStorageKey('LEGACY0001'), JSON.stringify(record));
    expect(loadQuizResult('LEGACY0001', t0)).toEqual(record);
    const raw = JSON.parse(localStorage.getItem(resultStorageKey('LEGACY0001'))!);
    expect(raw.bfExpiresAt).toBe(t0 + QUIZ_RESULT_TTL_SECONDS * 1000);
    expect(loadQuizResult('LEGACY0001', t0 + 61 * DAY)).toBeNull();
  });

  it('mentéskor a lejárt idegen bejegyzések törlődnek, más kulcsokhoz nem nyúl', () => {
    saveQuizResult('OLDEXP0001', record, t0);
    localStorage.setItem('bf_quiz_state', '{"idx":3}');
    saveQuizResult('NEWEXP0001', record, t0 + 61 * DAY);
    expect(localStorage.getItem(resultStorageKey('OLDEXP0001'))).toBeNull();
    expect(localStorage.getItem('bf_quiz_state')).toBe('{"idx":3}');
    expect(loadQuizResult('NEWEXP0001', t0 + 61 * DAY)).toEqual(record);
  });

  it('ha egyik tároló sem írható, a mentés hamis (a hívó nem navigálhat vakon)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    expect(saveQuizResult('NOSTORE001', record, t0)).toBe(false);
  });
});
