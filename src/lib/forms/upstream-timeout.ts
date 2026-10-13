/**
 * Felső időkorlát a lead-pipeline külső hívásaira (CRM-webhook, Google Sheets).
 *
 * Időkorlát nélkül egy beragadt CRM vagy Sheets-végpont a teljes beküldést
 * (és vele a vendég képernyőjét) addig tartja, amíg a Worker el nem engedi —
 * a kliens közben hálózati hibát lát, újraküld, és duplikált lead keletkezik.
 * Ezek a hívások best-effort ágak (Promise.allSettled), így egy időtúllépés
 * csak az adott ágat bukatja, a lead e-mailben megérkezik.
 */
export const UPSTREAM_TIMEOUT_MS = 8_000;

export function upstreamSignal(ms: number = UPSTREAM_TIMEOUT_MS): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(ms)
    : undefined;
}
