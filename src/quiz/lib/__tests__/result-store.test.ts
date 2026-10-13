// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveQuizResult, loadQuizResult, type StoredQuizResult } from '../result-store';
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
