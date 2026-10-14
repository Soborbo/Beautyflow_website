/**
 * Beküldés utáni átadás: a szerver eredménye → /eredmeny/<hash> vagy helyben.
 *
 * Korábban a kvíz a `saveQuizResult` visszatérési értékét figyelmen kívül
 * hagyta, törölte az állapotot és vakon az /eredmeny/<hash> oldalra navigált.
 * Ha a böngésző egyik tárolója sem írható (Safari privát mód, letiltott
 * tárhely, tele kvóta) ÉS nincs KV binding, az eredmény-oldal csak a „nem
 * érhető el" fallbacket mutatta — az egyetlen használható példány (a szerver
 * válasza a memóriában) a navigációval elveszett.
 *
 * Most: ha a mentés nem sikerült, a kvíz UGYANAZON az oldalon jeleníti meg a
 * szerver eredményét (`inline`). Ha a válasz nem hordoz eredményt (pl. egy
 * régi formátumú visszajátszás), marad a navigáció — ott a KV / őszinte
 * fallback dönt.
 */
import { isStoredQuizResult, saveQuizResult, type StoredQuizResult } from './result-store';

export type ResultHandoff =
  | { action: 'navigate'; saved: boolean }
  | { action: 'inline'; record: StoredQuizResult };

export function handOffQuizResult(
  hash: string,
  result: unknown,
  baumann?: StoredQuizResult['baumann'],
  save: (hash: string, record: StoredQuizResult) => boolean = saveQuizResult,
): ResultHandoff {
  if (!isStoredQuizResult(result)) return { action: 'navigate', saved: false };
  const record: StoredQuizResult = { ...result, ...(baumann ? { baumann } : {}) };
  let saved = false;
  try {
    saved = save(hash, record);
  } catch {
    saved = false;
  }
  return saved ? { action: 'navigate', saved: true } : { action: 'inline', record };
}
