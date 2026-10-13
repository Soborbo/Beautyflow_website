import { describe, it, expect } from 'vitest';
import { resolveLeadGoogleClickId, normalizeLeadGoogleClickId } from '../click-id';

const nonEmpty = (o: Record<string, string>) => Object.values(o).filter(Boolean).length;

describe('resolveLeadGoogleClickId — legfeljebb EGY Google klikk-ID', () => {
  it('a régi hiba: forrásonként más kulcs → most csak az ELSŐ forrás nyer', () => {
    // A régi kód: gclid: t.gclid || a.gclid, gbraid: t.gbraid || a.gbraid → KETTŐ.
    const fresh = { gbraid: 'GB-fresh' };
    const stale = { gclid: 'GC-stale' };
    const r = resolveLeadGoogleClickId(fresh, stale);
    expect(r).toEqual({ gclid: '', gbraid: 'GB-fresh', wbraid: '' });
    expect(nonEmpty(r as unknown as Record<string, string>)).toBe(1);
  });

  it('egy forráson belül gclid > gbraid > wbraid', () => {
    expect(resolveLeadGoogleClickId({ gclid: 'A', gbraid: 'B', wbraid: 'C' })).toEqual({ gclid: 'A', gbraid: '', wbraid: '' });
    expect(resolveLeadGoogleClickId({ gbraid: 'B', wbraid: 'C' })).toEqual({ gclid: '', gbraid: 'B', wbraid: '' });
    expect(resolveLeadGoogleClickId({ wbraid: 'C' })).toEqual({ gclid: '', gbraid: '', wbraid: 'C' });
  });

  it('üres első forrás → a következő', () => {
    expect(resolveLeadGoogleClickId({ gclid: '', utm_source: 'x' }, undefined, { wbraid: 'W' })).toEqual({ gclid: '', gbraid: '', wbraid: 'W' });
  });

  it('URLSearchParams forrás (friss URL elsőként)', () => {
    const url = new URLSearchParams('?wbraid=W1&utm_source=google');
    expect(resolveLeadGoogleClickId(url, { gclid: 'OLD' })).toEqual({ gclid: '', gbraid: '', wbraid: 'W1' });
  });

  it('semmi → minden mező üres string', () => {
    expect(resolveLeadGoogleClickId(undefined, null, {})).toEqual({ gclid: '', gbraid: '', wbraid: '' });
  });
});

describe('normalizeLeadGoogleClickId — szerveroldali body-normalizálás', () => {
  it('kettős ID a body-ban → csak a magasabb prioritású marad', () => {
    const body = { gclid: 'GC', gbraid: 'GB', fbclid: 'FB', utm_source: 'g' };
    normalizeLeadGoogleClickId(body);
    expect(body).toEqual({ gclid: 'GC', gbraid: '', wbraid: '', fbclid: 'FB', utm_source: 'g' });
  });
  it('nem-string érték nem jut tovább', () => {
    const body: Record<string, unknown> = { gclid: 123, wbraid: 'W' };
    normalizeLeadGoogleClickId(body);
    expect(body).toEqual({ gclid: '', gbraid: '', wbraid: 'W' });
  });
});
