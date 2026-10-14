/**
 * Lead-kézbesítés: fogadónkénti eredmény és az üzleti elfogadás döntése
 * (/api/contact, /api/boranalizis).
 *
 * A korábbi döntés a `Promise.allSettled` „fulfilled" állapotára épült, és két
 * irányban is tévedett:
 *   • egy KIMARADÓ fogadó (nincs vendég-e-mail, nincs Sheets/CRM konfigurálva)
 *     `undefined`-dal teljesült, tehát „sikernek" számított — egy csak
 *     telefonszámos kvíz akkor is `success: true`-t kapott, ha a szalon-levél,
 *     a Sheets és a CRM mind elbukott;
 *   • fordítva: ha a CRM tartósan rögzítette a leadet, de mindkét levél elbukott,
 *     HTTP 500 ment ki — a vendég újraküldött, és a CRM/Sheets mellékhatás
 *     megismétlődött (az idempotencia-jelölés csak sikerre kerül be).
 *
 * Négy, külön kezelt állapot:
 *   1. folyamatban lévő kérés — `runIdempotent` (idempotency.ts) kezeli;
 *   2. üzleti elfogadás — legalább egy ÜZLETI fogadó (szalon/admin-levél,
 *      Sheets, CRM) ténylegesen átvette a leadet. Ez és csak ez dönti el a
 *      sikert (`leadAccepted`);
 *   3. ügyféllevél — külön státusz (`sent` / `skipped` / `failed` /
 *      `not_attempted`), sosem buktatja az elfogadott leadet;
 *   4. háttérkézbesítés (gateway-konverzió, KV-eredmény) — nem része a döntésnek.
 *
 * A „tartós" szóról, őszintén: a CRM és a Sheets tartós tároló (`durable: true`
 * a válaszban); a szalon/admin-levél a Resend ELFOGADÁSA (hibamentes API-
 * válasz), nem bizonyított postafiók-kézbesítés. Üzleti fogadóként mégis
 * számít, mert a Sheets/CRM opcionális konfiguráció, és eddig is a levél volt a
 * lead elsődleges csatornája; egy 500 itt újraküldést és dupla levelet szülne.
 */

export type SinkStatus = 'delivered' | 'skipped' | 'failed';

export interface SinkResult<T = unknown> {
  status: SinkStatus;
  /** A fogadó visszatérési értéke (pl. CRM lead-id), csak `delivered` esetén. */
  value?: T;
  /** Az elbukás oka, csak `failed` esetén. */
  error?: unknown;
}

/**
 * Egy fogadó futtatása explicit kimenettel. `enabled === false` → `skipped`
 * (nem fut, és NEM számít sikernek); feloldás → `delivered`; dobás → `failed`.
 */
export async function runSink<T>(enabled: boolean, fn: () => Promise<T>): Promise<SinkResult<T>> {
  if (!enabled) return { status: 'skipped' };
  try {
    return { status: 'delivered', value: await fn() };
  } catch (error) {
    return { status: 'failed', error };
  }
}

export type CustomerEmailStatus = 'sent' | 'skipped' | 'failed' | 'not_attempted';

export function customerEmailStatus(r: SinkResult | null): CustomerEmailStatus {
  if (!r) return 'not_attempted';
  return r.status === 'delivered' ? 'sent' : r.status;
}

export interface LeadAcceptance {
  /** Igaz, ha legalább egy üzleti fogadó `delivered`. */
  accepted: boolean;
  acceptedBy: string[];
  failed: string[];
  skipped: string[];
}

/** Az üzleti elfogadás döntése KIZÁRÓLAG az üzleti fogadók eredményéből. */
export function decideLeadAcceptance(business: Record<string, SinkResult>): LeadAcceptance {
  const by = (s: SinkStatus) => Object.keys(business).filter((k) => business[k].status === s);
  const acceptedBy = by('delivered');
  return { accepted: acceptedBy.length > 0, acceptedBy, failed: by('failed'), skipped: by('skipped') };
}

/** A fogadók állapota naplózáshoz (hibaok és PII nélkül). */
export function sinkSummary(sinks: Record<string, SinkResult | null>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sinks)) out[k] = v ? v.status : 'not_attempted';
  return out;
}

/**
 * A CRM webhook válaszának értelmezése. A 2xx önmagában nem üzleti siker: egy
 * `{ success: false }` törzs elutasítás (dob). A lead-id csak a gateway
 * lead_id-formátumában adható tovább. Nem-JSON 2xx törzs: elfogadott (a korábbi
 * viselkedés), lead-id nélkül.
 */
export async function readCrmAcceptance(res: Response): Promise<string | undefined> {
  if (!res.ok) throw new Error(`CRM webhook ${res.status}`);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return undefined;
  }
  if (body && typeof body === 'object' && (body as { success?: unknown }).success === false) {
    throw new Error(`CRM webhook ${res.status} success:false`);
  }
  const id = (body as { id?: unknown } | null)?.id;
  const rawId =
    typeof id === 'string' ? id : typeof id === 'number' && Number.isFinite(id) ? String(id) : undefined;
  return rawId && /^[a-zA-Z0-9_-]{8,64}$/.test(rawId) ? rawId : undefined;
}
