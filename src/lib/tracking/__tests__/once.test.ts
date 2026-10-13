// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { markOnce, __resetOnceMemory } from '../once';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  __resetOnceMemory();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('markOnce', () => {
  it('első hívás igaz, a többi hamis (local)', () => {
    expect(markOnce('bf_result_view_H1', 'local')).toBe(true);
    expect(markOnce('bf_result_view_H1', 'local')).toBe(false);
    expect(markOnce('bf_result_view_H2', 'local')).toBe(true); // hash-enként külön
    expect(localStorage.getItem('bf_result_view_H1')).not.toBeNull();
  });

  it('session scope → sessionStorage, localStorage-et nem érinti', () => {
    expect(markOnce('bf_begin_checkout_hero', 'session')).toBe(true);
    expect(markOnce('bf_begin_checkout_hero', 'session')).toBe(false);
    expect(markOnce('bf_begin_checkout_footer', 'session')).toBe(true); // forrásonként külön
    expect(sessionStorage.getItem('bf_begin_checkout_hero')).not.toBeNull();
    expect(localStorage.getItem('bf_begin_checkout_hero')).toBeNull();
  });

  it('dobó localStorage (Safari privát mód) → sessionStorage tartalék', () => {
    const realSet = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (this === localStorage) throw new DOMException('QuotaExceededError');
      return realSet.call(this, k, v);
    });
    expect(markOnce('k', 'local')).toBe(true);
    expect(markOnce('k', 'local')).toBe(false);
    expect(sessionStorage.getItem('k')).not.toBeNull();
  });

  it('minden tároló dob → memória-tartalék, és nem dob', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });
    expect(() => markOnce('k', 'local')).not.toThrow();
    expect(markOnce('k2', 'session')).toBe(true);
    expect(markOnce('k2', 'session')).toBe(false);
  });
});
