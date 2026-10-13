/**
 * Lead-beküldések idempotenciája (/api/contact, /api/boranalizis).
 *
 * A hiba: ha a szerver sikeresen lefutott, de a válasz elveszett (mobilnet,
 * időtúllépés), a kliens hibát látott, a vendég újraküldött — és minden
 * mellékhatás duplán futott: két szalon-e-mail, két vendég-e-mail, két Sheets-
 * sor, két CRM-lead.
 *
 * A megoldás:
 *   • a kliens egy próbálkozás-sorozatra (ugyanaz a tartalom) STABIL `event_id`-t
 *     küld (lásd `submission-id.ts`);
 *   • a szerver a Turnstile ELŐTT megnézi, látta-e már ezt az id-t SIKERESNEK —
 *     ha igen, a mentett választ adja vissza mellékhatás nélkül (az újrapróbálás
 *     friss Turnstile-token nélkül is célba ér, hiszen az eredeti kérés már
 *     átment az ellenőrzésen);
 *   • a jelölés CSAK SIKER UTÁN kerül be — egy elbukott próbálkozás nem
 *     blokkolhatja a következőt;
 *   • ugyanazon isolate-on belül a párhuzamos duplakattintás a futó kérésre vár.
 *
 * Tároló: a per-isolate memória NEM elég (a retry másik isolate-ra eshet). Ha
 * van KV binding, az a jobb (globális); jelenleg a wrangler.jsonc-ben nincs, ezért
 * a Cache API-t használjuk rövid TTL-lel (adatközpontonként él, de egy retry
 * jellemzően ugyanabba az adatközpontba érkezik). A tároló-felület cserélhető.
 */

export interface IdempotencyStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, ttlSeconds: number): Promise<void>;
}

export interface IdempotentResult {
  status: number;
  body: Record<string, unknown>;
}

/** Rövid TTL: a lényeg az elveszett válasz utáni azonnali újraküldés. */
export const IDEMPOTENCY_TTL_SECONDS = 15 * 60;

/** A kliens `crypto.randomUUID()`-ot küld; ennél lazábban, de zárt karakterkészlettel. */
export function isValidIdempotencyKey(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(id);
}

/** Minimális KV-felület — nem támaszkodunk a globális KVNamespace típusra. */
interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

export function kvIdempotencyStore(kv: KvLike): IdempotencyStore {
  return {
    get: (key) => kv.get(`idem:${key}`),
    // A KV minimális TTL-je 60 mp.
    put: (key, value, ttl) => kv.put(`idem:${key}`, value, { expirationTtl: Math.max(60, ttl) }),
  };
}

interface CacheLike {
  match(request: Request | string): Promise<Response | undefined>;
  put(request: Request | string, response: Response): Promise<void>;
}

/**
 * Cache API alapú tároló. A kulcs a saját origin alatti szintetikus URL (a Cache
 * API zónához kötött). Ha a runtime-ban nincs `caches.default` (pl. `astro dev`),
 * `null` — ilyenkor csak a per-isolate párhuzamos-kérés védelem marad.
 */
export function cacheApiIdempotencyStore(origin: string, cache?: CacheLike | null): IdempotencyStore | null {
  const c =
    cache ??
    ((globalThis as unknown as { caches?: { default?: CacheLike } }).caches?.default || null);
  if (!c) return null;
  const base = origin.replace(/\/$/, '');
  const urlFor = (key: string) => `${base}/__idempotency/${encodeURIComponent(key)}`;
  return {
    async get(key) {
      const res = await c.match(urlFor(key));
      return res ? await res.text() : null;
    },
    async put(key, value, ttl) {
      await c.put(
        urlFor(key),
        new Response(value, {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${ttl}` },
        }),
      );
    },
  };
}

/** KV, ha van; különben Cache API; különben null. */
export function resolveIdempotencyStore(opts: { kv?: unknown; origin: string }): IdempotencyStore | null {
  const kv = opts.kv as KvLike | undefined;
  if (kv && typeof kv.get === 'function' && typeof kv.put === 'function') return kvIdempotencyStore(kv);
  return cacheApiIdempotencyStore(opts.origin);
}

// Ugyanazon isolate-on belüli, éppen futó kérések (duplakattintás / párhuzamos retry).
const inflight = new Map<string, Promise<IdempotentResult>>();

/**
 * A `execute` legfeljebb egyszer fut SIKERESEN ugyanarra a kulcsra (a TTL-en belül).
 *
 * Sorrend: (1) tárolt siker → visszajátszás; (2) futó kérés → arra várunk;
 * (3) futtatás; (4) CSAK `status === 200 && body.success === true` esetén jelölés.
 * Egy tároló-hiba sosem buktatja a beküldést (`onStoreError`-ral jelezzük).
 */
export async function runIdempotent(opts: {
  store: IdempotencyStore | null;
  key: string | undefined;
  execute: () => Promise<IdempotentResult>;
  ttlSeconds?: number;
  onStoreError?: (cause: unknown, op: 'get' | 'put') => void;
}): Promise<IdempotentResult & { replayed: boolean }> {
  const { store, key, execute } = opts;
  if (!key) return { ...(await execute()), replayed: false };

  if (store) {
    let cached: string | null = null;
    try {
      cached = await store.get(key);
    } catch (e) {
      opts.onStoreError?.(e, 'get');
    }
    if (cached) {
      try {
        const body = JSON.parse(cached) as Record<string, unknown>;
        return { status: 200, body: { ...body, duplicate: true }, replayed: true };
      } catch {
        // sérült bejegyzés → úgy kezeljük, mintha nem lenne
      }
    }
  }

  const running = inflight.get(key);
  if (running) {
    const r = await running;
    return { status: r.status, body: r.status === 200 ? { ...r.body, duplicate: true } : r.body, replayed: true };
  }

  const p = (async (): Promise<IdempotentResult> => {
    const result = await execute();
    if (store && result.status === 200 && result.body.success === true) {
      try {
        await store.put(key, JSON.stringify(result.body), opts.ttlSeconds ?? IDEMPOTENCY_TTL_SECONDS);
      } catch (e) {
        opts.onStoreError?.(e, 'put');
      }
    }
    return result;
  })();
  inflight.set(key, p);
  try {
    return { ...(await p), replayed: false };
  } finally {
    inflight.delete(key);
  }
}
