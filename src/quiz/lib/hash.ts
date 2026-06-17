/**
 * Eredmény-URL hashelés.
 *
 * Nem visszafejthető, nem kitalálható azonosító a /eredmeny/[hash] oldalhoz.
 * Ugyanaz a hash ugyanazt az eredményt mutatja (KV / localStorage kulcs).
 */

export function generateResultHash(): string {
  // crypto.randomUUID elérhető a Workers runtime-ban és a böngészőben is.
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return uuid.replace(/-/g, '').slice(0, 16).toUpperCase();
}

/** Csak A–Z és 0–9, 8–32 hosszú — útvonal-paraméter validáláshoz. */
export function isValidResultHash(hash: string): boolean {
  return /^[A-Z0-9]{8,32}$/.test(hash);
}

export function resultPath(hash: string): string {
  return `/eredmeny/${hash}`;
}

export function resultEmailUrl(hash: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/eredmeny/${hash}`;
}

/** localStorage kulcs az eredmény kliensoldali tárolásához (cross-device fallback KV-ból). */
export function resultStorageKey(hash: string): string {
  return `bf_quiz_result_${hash}`;
}
