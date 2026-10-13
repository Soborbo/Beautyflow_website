/**
 * A kvíz-eredmény kliensoldali tárolása — UGYANAZON az eszközön KV nélkül is.
 *
 * Beküldés után a kvíz ide menti a szerver által adott eredményt, majd az
 * /eredmeny/<hash> oldalra navigál, ami innen olvassa vissza. localStorage-et
 * használunk (az e-mailes link később is működjön ezen az eszközön); ha az nem
 * írható (Safari privát mód, letiltott tárhely), sessionStorage a tartalék, hogy
 * legalább a közvetlen átirányítás után megjelenjen az eredmény.
 *
 * Visszafelé kompatibilis: a régi bejegyzés egy sima `Recommendation` volt;
 * az új ugyanaz, kiegészítve az opcionális `baumann` mezővel.
 */
import { resultStorageKey } from './hash';
import type { Recommendation } from './types';

export interface StoredBaumann {
  code: string;
  slug: string;
  name?: string;
}

export type StoredQuizResult = Recommendation & { baumann?: StoredBaumann };

function storages(): Storage[] {
  const out: Storage[] = [];
  for (const kind of ['localStorage', 'sessionStorage'] as const) {
    try {
      const s = (globalThis as unknown as Record<string, Storage | undefined>)[kind];
      if (s) out.push(s);
    } catch {
      // a tároló elérése is dobhat (letiltott sütik)
    }
  }
  return out;
}

/** Igaz, ha legalább egy tárolóba sikerült írni. */
export function saveQuizResult(hash: string, record: StoredQuizResult): boolean {
  const key = resultStorageKey(hash);
  const value = JSON.stringify(record);
  for (const s of storages()) {
    try {
      s.setItem(key, value);
      return true;
    } catch {
      // tele / letiltva → következő tároló
    }
  }
  return false;
}

export function isStoredQuizResult(v: unknown): v is StoredQuizResult {
  return !!v && typeof v === 'object' && !!(v as { profile?: unknown }).profile;
}

export function loadQuizResult(hash: string): StoredQuizResult | null {
  const key = resultStorageKey(hash);
  for (const s of storages()) {
    try {
      const raw = s.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as unknown;
      if (isStoredQuizResult(parsed)) return parsed;
    } catch {
      // sérült / nem olvasható → következő tároló
    }
  }
  return null;
}
