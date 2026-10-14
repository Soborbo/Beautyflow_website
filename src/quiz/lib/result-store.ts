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
 *
 * LEJÁRAT: az eredmény egészségügyi válaszokból származik, ezért nem él
 * korlátlanul a böngészőben. Az új bejegyzés a lapos rekordot egy `bfExpiresAt`
 * (epoch ms) mezővel egészíti ki — így egy régebbi kliens-bundle is olvassa
 * (a `profile` mező a helyén marad). Lejárt bejegyzést nem adunk vissza, és
 * töröljük. A legacy (lejárat nélküli) bejegyzés OLVASHATÓ marad: az első
 * olvasáskor kap egy friss lejáratot, onnantól ugyanúgy elévül.
 * A TTL ugyanaz, mint a szerveroldali KV-é (`QUIZ_RESULT_TTL_SECONDS`).
 */
import { resultStorageKey } from './hash';
import type { Recommendation } from './types';

export interface StoredBaumann {
  code: string;
  slug: string;
  name?: string;
}

export type StoredQuizResult = Recommendation & { baumann?: StoredBaumann };

/** Az eredmény élettartama — a böngészőben és a KV-ban ugyanannyi (60 nap). */
export const QUIZ_RESULT_TTL_SECONDS = 60 * 60 * 24 * 60;
const TTL_MS = QUIZ_RESULT_TTL_SECONDS * 1000;
const EXPIRES_FIELD = 'bfExpiresAt';
const KEY_PREFIX = resultStorageKey('');

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

function withoutExpiry(rec: Record<string, unknown>): StoredQuizResult {
  const { [EXPIRES_FIELD]: _drop, ...rest } = rec;
  return rest as unknown as StoredQuizResult;
}

function serialize(record: StoredQuizResult, now: number): string {
  return JSON.stringify({
    ...withoutExpiry(record as unknown as Record<string, unknown>),
    [EXPIRES_FIELD]: now + TTL_MS,
  });
}

/** A lejárt `bf_quiz_result_*` bejegyzések törlése (best-effort, sosem dob). */
export function pruneExpiredQuizResults(now: number = Date.now()): void {
  for (const s of storages()) {
    try {
      const expired: string[] = [];
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (!k || !k.startsWith(KEY_PREFIX)) continue;
        try {
          const exp = (JSON.parse(s.getItem(k) || 'null') as Record<string, unknown> | null)?.[EXPIRES_FIELD];
          if (typeof exp === 'number' && exp <= now) expired.push(k);
        } catch {
          // sérült bejegyzés — itt nem nyúlunk hozzá
        }
      }
      for (const k of expired) s.removeItem(k);
    } catch {
      // a tároló bejárása is dobhat
    }
  }
}

/**
 * Igaz, ha legalább egy tárolóba sikerült írni ÉS onnan vissza is olvasható.
 * Hamis esetén a hívó NE navigáljon el vakon: az eredmény csak a memóriában van.
 */
export function saveQuizResult(hash: string, record: StoredQuizResult, now: number = Date.now()): boolean {
  const key = resultStorageKey(hash);
  const value = serialize(record, now);
  pruneExpiredQuizResults(now);
  for (const s of storages()) {
    try {
      s.setItem(key, value);
      if (s.getItem(key) === value) return true;
    } catch {
      // tele / letiltva → következő tároló
    }
  }
  return false;
}

export function isStoredQuizResult(v: unknown): v is StoredQuizResult {
  return !!v && typeof v === 'object' && !!(v as { profile?: unknown }).profile;
}

export function loadQuizResult(hash: string, now: number = Date.now()): StoredQuizResult | null {
  const key = resultStorageKey(hash);
  for (const s of storages()) {
    try {
      const raw = s.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as unknown;
      if (!isStoredQuizResult(parsed)) continue;
      const exp = (parsed as unknown as Record<string, unknown>)[EXPIRES_FIELD];
      if (typeof exp === 'number') {
        if (exp <= now) {
          try { s.removeItem(key); } catch { /* ignore */ }
          continue;
        }
      } else {
        // Legacy (lejárat nélküli) bejegyzés: olvasható marad, és most kap lejáratot.
        try { s.setItem(key, serialize(parsed, now)); } catch { /* best-effort */ }
      }
      return withoutExpiry(parsed as unknown as Record<string, unknown>);
    } catch {
      // sérült / nem olvasható → következő tároló
    }
  }
  return null;
}
