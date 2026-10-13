import { describe, it, expect } from 'vitest';
import { checkPhone, isValidPhone, phoneErrorMessage } from '../phone';

describe('checkPhone — magyar számok', () => {
  it.each([
    ['+36 30 123 4567', '+36301234567'],
    ['+36301234567', '+36301234567'],
    ['0036 30 123 4567', '+36301234567'],
    ['06 30 123 4567', '+36301234567'],
    ['06-30-123-4567', '+36301234567'],
    ['(06 30) 123 4567', '+36301234567'],
    ['36301234567', '+36301234567'],
    ['301234567', '+36301234567'],
    // budapesti vezetékes (8 jegy) — a régi regex ezt elutasította
    ['06 1 300 9414', '+3613009414'],
    ['+36 1 300 9414', '+3613009414'],
    ['13009414', '+3613009414'],
  ])('%s → %s', (raw, e164) => {
    expect(checkPhone(raw)).toEqual({ ok: true, e164 });
  });

  it.each(['06 30 123', '+36 30 123 45678', '06 0123 4567', '+36 0 1234 5678'])(
    'elutasítja: %s',
    (raw) => {
      const r = checkPhone(raw);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('hu_length');
    },
  );
});

describe('checkPhone — külföldi számok (EN űrlap)', () => {
  it.each([
    ['+44 7700 900123', '+447700900123'],
    ['0044 7700 900123', '+447700900123'],
    ['+1 (415) 555-2671', '+14155552671'],
    ['+49 30 901820', '+4930901820'],
    ['+43 664 1234567', '+436641234567'],
  ])('%s → %s', (raw, e164) => {
    expect(checkPhone(raw)).toEqual({ ok: true, e164 });
  });

  it('országkód nélküli külföldi szám → no_country_code (nem csendes bukás)', () => {
    expect(checkPhone('07700 900123')).toEqual({ ok: false, reason: 'no_country_code' });
    expect(checkPhone('447700900123')).toEqual({ ok: false, reason: 'no_country_code' });
  });

  it('E.164 fölötti hossz / túl rövid → intl_length', () => {
    expect(checkPhone('+44 1234 567 890 1234')).toEqual({ ok: false, reason: 'intl_length' });
    expect(checkPhone('+44 1234')).toEqual({ ok: false, reason: 'intl_length' });
    expect(checkPhone('+0 1234 5678')).toEqual({ ok: false, reason: 'intl_length' });
  });
});

describe('checkPhone — formai hibák', () => {
  it('üres', () => {
    expect(checkPhone('')).toEqual({ ok: false, reason: 'empty' });
    expect(checkPhone('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(checkPhone(undefined)).toEqual({ ok: false, reason: 'empty' });
    expect(checkPhone(12345678)).toEqual({ ok: false, reason: 'empty' });
  });
  it('betű / tiltott karakter', () => {
    expect(checkPhone('+36 30 ABC 4567')).toEqual({ ok: false, reason: 'chars' });
    expect(checkPhone('36+301234567')).toEqual({ ok: false, reason: 'chars' });
  });
  it('túl hosszú nyers mező', () => {
    expect(checkPhone('1'.repeat(33))).toEqual({ ok: false, reason: 'too_long' });
  });
  it('isValidPhone a checkPhone logikai alakja', () => {
    expect(isValidPhone('+36 30 123 4567')).toBe(true);
    expect(isValidPhone('nope')).toBe(false);
  });
});

describe('phoneErrorMessage', () => {
  it('HU és EN üzenet minden okra, nem üres', () => {
    for (const reason of ['empty', 'too_long', 'chars', 'hu_length', 'intl_length', 'no_country_code'] as const) {
      expect(phoneErrorMessage(reason, 'hu')).toMatch(/\S/);
      expect(phoneErrorMessage(reason, 'en')).toMatch(/\S/);
      expect(phoneErrorMessage(reason, 'hu')).not.toBe(phoneErrorMessage(reason, 'en'));
    }
  });
  it('az EN üzenet angol, és mutat országkódos példát', () => {
    expect(phoneErrorMessage('no_country_code', 'en')).toMatch(/country code/i);
    expect(phoneErrorMessage('no_country_code', 'en')).toMatch(/\+44/);
  });
});
