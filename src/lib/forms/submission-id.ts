/**
 * Stabil beküldés-azonosító (event_id) egy próbálkozás-sorozatra — kliensoldal.
 *
 * Korábban minden kattintás új `crypto.randomUUID()`-ot vert: ha a válasz elveszett
 * és a vendég újraküldött, a szerver nem tudhatta, hogy ugyanarról a leadről van
 * szó. Most AMÍG a beküldött tartalom (ujjlenyomat) változatlan, ugyanaz az id megy
 * újra — a szerver ez alapján dedupol (`idempotency.ts`). Ha a vendég közben
 * módosít az adatain, az már új beküldés: új id.
 *
 * Ugyanez az id a Meta Pixel ↔ CAPI dedup-kulcsa is (CLAUDE.md #16): a stabil id
 * ott is helyes — egy lead, egy event_id.
 */
export interface SubmissionIdKeeper {
  /** Az ujjlenyomathoz tartozó id; új ujjlenyomatnál új id. */
  idFor(fingerprint: string): string;
  /** Sikeres beküldés után (vagy új űrlapnál) eldobjuk. */
  reset(): void;
}

function defaultMint(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function createSubmissionIdKeeper(mint: () => string = defaultMint): SubmissionIdKeeper {
  let id: string | null = null;
  let fp: string | null = null;
  return {
    idFor(fingerprint) {
      if (!id || fp !== fingerprint) {
        id = mint();
        fp = fingerprint;
      }
      return id;
    },
    reset() {
      id = null;
      fp = null;
    },
  };
}
