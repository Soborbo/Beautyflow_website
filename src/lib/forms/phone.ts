/**
 * Telefonszám-ellenőrzés — EGY szabály a kliensnek ÉS a szervernek.
 *
 * Eddig három külön, eltérő regex élt (konzultáció HU, konzultáció EN, /api/contact),
 * és mindhárom CSAK 9 jegyű magyar számot fogadott el: a budapesti vezetékes
 * (06 1 300 9414) és MINDEN külföldi szám elbukott. Az EN oldalon ráadásul a
 * „Tovább" gomb némán letiltva maradt — a külföldi vendég nem tudta, mi a baj.
 * A kvíz telefonszámát pedig senki sem ellenőrizte.
 *
 * A szabály:
 *   • Magyar szám: +36 / 0036 / 06 / 36 előtaggal vagy előtag nélkül,
 *     8–9 jegyű belföldi számmal (vezetékes 8, mobil 9 jegy).
 *   • Külföldi szám: KÖTELEZŐ az országkód (+ vagy 00), E.164 szerint
 *     legfeljebb 15 számjegy. Országkód nélkül nem tudjuk eldönteni, hova
 *     hívjunk vissza — ilyenkor konkrét hibaüzenetet adunk, nem némaságot.
 *
 * Tiszta függvény, DOM nélkül — böngészőben és a Workerben is fut.
 */

export type PhoneLang = 'hu' | 'en';

export type PhoneFailure = 'empty' | 'too_long' | 'chars' | 'hu_length' | 'intl_length' | 'no_country_code';

export type PhoneCheck = { ok: true; e164: string } | { ok: false; reason: PhoneFailure };

/** A nyers mező felső korlátja — a szerver ennél hosszabbat el sem kezd elemezni. */
export const PHONE_MAX_LENGTH = 32;

// Az ember által beírt elválasztók: szóköz, kötőjel, zárójel, pont, perjel.
const SEPARATORS = /[\s\-().\/]/g;

function huNational(national: string): PhoneCheck {
  // Belföldi rész: nem kezdődhet 0-val, 8 (vezetékes) vagy 9 (mobil) jegy.
  if (!/^[1-9]\d{7,8}$/.test(national)) return { ok: false, reason: 'hu_length' };
  return { ok: true, e164: `+36${national}` };
}

export function checkPhone(raw: unknown): PhoneCheck {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return { ok: false, reason: 'empty' };
  if (s.length > PHONE_MAX_LENGTH) return { ok: false, reason: 'too_long' };

  const compact = s.replace(SEPARATORS, '');
  if (!/^\+?\d+$/.test(compact)) return { ok: false, reason: 'chars' };

  // Nemzetközi alak: +<országkód>… vagy 00<országkód>…
  let intl: string | null = null;
  if (compact.startsWith('+')) intl = compact.slice(1);
  else if (compact.startsWith('00')) intl = compact.slice(2);

  if (intl !== null) {
    if (intl.startsWith('36')) return huNational(intl.slice(2));
    // E.164: az országkód nem kezdődik 0-val; összesen 8–15 számjegy.
    if (!/^[1-9]\d{7,14}$/.test(intl)) return { ok: false, reason: 'intl_length' };
    return { ok: true, e164: `+${intl}` };
  }

  // Belföldi magyar alakok.
  if (compact.startsWith('06')) return huNational(compact.slice(2));
  if (compact.startsWith('36') && (compact.length === 10 || compact.length === 11)) {
    return huNational(compact.slice(2));
  }
  if (/^[1-9]\d{7,8}$/.test(compact)) return huNational(compact);

  // Pl. „447700900123" vagy „07700 900123": külföldinek tűnik, de országkód nélkül.
  return { ok: false, reason: 'no_country_code' };
}

export function isValidPhone(raw: unknown): boolean {
  return checkPhone(raw).ok;
}

const MESSAGES: Record<PhoneLang, Record<PhoneFailure, string>> = {
  hu: {
    empty: 'Kérjük add meg a telefonszámod.',
    too_long: 'A telefonszám túl hosszú.',
    chars: 'A telefonszám csak számjegyeket, szóközt, kötőjelet és + jelet tartalmazhat.',
    hu_length: 'Ez nem tűnik érvényes magyar számnak. Példa: +36 30 123 4567 vagy 06 1 300 9414.',
    intl_length: 'Ez nem tűnik érvényes külföldi számnak. Példa: +44 7700 900123.',
    no_country_code: 'Külföldi számnál írd elé az országkódot (pl. +44), magyar számnál a +36-ot vagy a 06-ot.',
  },
  en: {
    empty: 'Please enter your phone number.',
    too_long: 'The phone number is too long.',
    chars: 'The phone number may only contain digits, spaces, dashes and a leading +.',
    hu_length: 'This does not look like a valid Hungarian number. Example: +36 30 123 4567.',
    intl_length: 'This does not look like a valid international number. Example: +44 7700 900123.',
    no_country_code: 'Please include your country code, e.g. +44 7700 900123 or +36 30 123 4567.',
  },
};

export function phoneErrorMessage(reason: PhoneFailure, lang: PhoneLang = 'hu'): string {
  return MESSAGES[lang === 'en' ? 'en' : 'hu'][reason];
}
