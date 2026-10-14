// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handOffQuizResult } from '../result-handoff';
import { loadQuizResult, type StoredQuizResult } from '../result-store';
import { resultHtml } from '../result-view';

const record = {
  profile: { label: 'zsíros, érzékeny' },
  treatments: [{ name: 'HydraBeauty', blurb: 'teszt' }],
  safe: true,
  utvonal: 'A',
  flags: [],
  arSav: null,
} as unknown as StoredQuizResult;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe('beküldés utáni átadás', () => {
  it('sikeres mentés → navigáció, az eredmény visszaolvasható', () => {
    const h = handOffQuizResult('HANDOFF001', record, { code: 'OSPT', slug: 'ospt' });
    expect(h).toEqual({ action: 'navigate', saved: true });
    expect(loadQuizResult('HANDOFF001')?.baumann?.code).toBe('OSPT');
  });

  it('egyik tároló sem írható → NEM navigál vakon: helyben jeleníti meg a szerver eredményét', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    const h = handOffQuizResult('HANDOFF002', record, { code: 'OSPT', slug: 'ospt' });
    expect(h.action).toBe('inline');
    if (h.action === 'inline') {
      expect(h.record.profile.label).toBe('zsíros, érzékeny');
      expect(h.record.baumann?.code).toBe('OSPT');
    }
  });

  it('dobó mentés is helyben jelenít meg', () => {
    const h = handOffQuizResult('HANDOFF003', record, undefined, () => { throw new Error('x'); });
    expect(h.action).toBe('inline');
  });

  it('eredmény nélküli válasz → navigáció (ott a KV / őszinte fallback dönt)', () => {
    expect(handOffQuizResult('HANDOFF004', { nope: 1 })).toEqual({ action: 'navigate', saved: false });
  });
});

describe('eredmény-HTML escapelése', () => {
  it('a dinamikus mezők escapelve kerülnek a HTML-be', () => {
    const evil = {
      ...record,
      profile: { label: '<img src=x onerror=alert(1)>' },
      treatments: [{ name: '<script>x</script>', blurb: '"q"' }],
      baumann: { code: 'O&S', slug: 'ospt', name: "<b>'n'</b>" },
    } as unknown as StoredQuizResult;
    const html = resultHtml(evil);
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&quot;q&quot;');
    expect(html).toContain('O&amp;S');
    expect(html).toContain('&lt;b&gt;&#39;n&#39;&lt;/b&gt;');
  });

  it('érvénytelen Baumann-slug nem kerül linkbe', () => {
    const html = resultHtml({ ...record, baumann: { code: 'X', slug: '../x' } } as StoredQuizResult);
    expect(html).not.toContain('/bortipus/');
  });
});
