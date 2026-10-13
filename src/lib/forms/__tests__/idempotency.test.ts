import { describe, it, expect, vi } from 'vitest';
import {
  runIdempotent,
  isValidIdempotencyKey,
  cacheApiIdempotencyStore,
  kvIdempotencyStore,
  resolveIdempotencyStore,
  type IdempotencyStore,
} from '../idempotency';
import { createSubmissionIdKeeper } from '../submission-id';

function memoryStore(): IdempotencyStore & { data: Map<string, string>; puts: string[] } {
  const data = new Map<string, string>();
  const puts: string[] = [];
  return {
    data,
    puts,
    async get(k) { return data.get(k) ?? null; },
    async put(k, v) { puts.push(k); data.set(k, v); },
  };
}

const ok = (extra: Record<string, unknown> = {}) => async () => ({ status: 200, body: { success: true, ...extra } });

describe('runIdempotent — dedupe-sorrend', () => {
  it('siker → jelölés; a második hívás visszajátszás, a mellékhatás NEM fut újra', async () => {
    const store = memoryStore();
    const execute = vi.fn(ok({ hash: 'H1' }));
    const first = await runIdempotent({ store, key: 'quiz:E1', execute });
    const second = await runIdempotent({ store, key: 'quiz:E1', execute });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ status: 200, body: { success: true, hash: 'H1' }, replayed: false });
    // ugyanaz az eredmény (ugyanaz a hash) — a vendég a SAJÁT eredményét kapja
    expect(second).toEqual({ status: 200, body: { success: true, hash: 'H1', duplicate: true }, replayed: true });
  });

  it('a jelölés CSAK a siker UTÁN kerül be (execute közben még nincs)', async () => {
    const store = memoryStore();
    let seenDuringExecute: string | null = 'unset';
    await runIdempotent({
      store,
      key: 'k',
      execute: async () => {
        seenDuringExecute = await store.get('k');
        return { status: 200, body: { success: true } };
      },
    });
    expect(seenDuringExecute).toBeNull();
    expect(store.puts).toEqual(['k']);
  });

  it('hiba (500 / success:false) → NINCS jelölés, a retry újra lefut', async () => {
    const store = memoryStore();
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ status: 500, body: { success: false, error: 'x' } })
      .mockResolvedValueOnce({ status: 400, body: { success: false, error: 'y' } })
      .mockResolvedValueOnce({ status: 200, body: { success: true } });
    await runIdempotent({ store, key: 'k', execute });
    await runIdempotent({ store, key: 'k', execute });
    expect(store.puts).toEqual([]);
    const third = await runIdempotent({ store, key: 'k', execute });
    expect(third.replayed).toBe(false);
    expect(execute).toHaveBeenCalledTimes(3);
    expect(store.puts).toEqual(['k']);
  });

  it('dobó execute → nincs jelölés, a hiba továbbmegy', async () => {
    const store = memoryStore();
    await expect(runIdempotent({ store, key: 'k', execute: async () => { throw new Error('boom'); } })).rejects.toThrow('boom');
    expect(store.puts).toEqual([]);
  });

  it('párhuzamos duplakattintás ugyanazon isolate-ban → egy futás', async () => {
    const store = memoryStore();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const execute = vi.fn(async () => { await gate; return { status: 200, body: { success: true } }; });
    const a = runIdempotent({ store, key: 'k', execute });
    const b = runIdempotent({ store, key: 'k', execute });
    release();
    const [ra, rb] = await Promise.all([a, b]);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(ra.replayed).toBe(false);
    expect(rb.replayed).toBe(true);
  });

  it('tároló-hiba nem buktatja a beküldést, de jelzi', async () => {
    const onStoreError = vi.fn();
    const store: IdempotencyStore = {
      get: async () => { throw new Error('get'); },
      put: async () => { throw new Error('put'); },
    };
    const r = await runIdempotent({ store, key: 'k', execute: ok(), onStoreError });
    expect(r.body.success).toBe(true);
    expect(onStoreError.mock.calls.map((c) => c[1])).toEqual(['get', 'put']);
  });

  it('kulcs nélkül (régi kliens) → egyszerű futás, nincs tároló-hozzáférés', async () => {
    const store = memoryStore();
    const execute = vi.fn(ok());
    await runIdempotent({ store, key: undefined, execute });
    await runIdempotent({ store, key: undefined, execute });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(store.puts).toEqual([]);
  });

  it('különböző kulcsok függetlenek', async () => {
    const store = memoryStore();
    const execute = vi.fn(ok());
    await runIdempotent({ store, key: 'contact:A', execute });
    await runIdempotent({ store, key: 'contact:B', execute });
    expect(execute).toHaveBeenCalledTimes(2);
  });
});

describe('tárolók', () => {
  it('Cache API tároló: max-age TTL, a saját origin alatt', async () => {
    const puts: { url: string; cc: string | null; body: string }[] = [];
    const entries = new Map<string, string>();
    const cache = {
      async match(req: Request | string) {
        const v = entries.get(String(req));
        return v === undefined ? undefined : new Response(v);
      },
      async put(req: Request | string, res: Response) {
        const body = await res.text();
        puts.push({ url: String(req), cc: res.headers.get('Cache-Control'), body });
        entries.set(String(req), body);
      },
    };
    const store = cacheApiIdempotencyStore('https://beautyflow.pro/', cache)!;
    expect(await store.get('contact:E1')).toBeNull();
    await store.put('contact:E1', '{"success":true}', 900);
    expect(puts[0].url).toBe('https://beautyflow.pro/__idempotency/contact%3AE1');
    expect(puts[0].cc).toBe('max-age=900');
    expect(await store.get('contact:E1')).toBe('{"success":true}');
  });

  it('Cache API nélkül (pl. astro dev) → null', () => {
    expect(cacheApiIdempotencyStore('https://x.test', null)).toBeNull();
  });

  it('KV binding esetén a KV-t választja (min. 60 mp TTL)', async () => {
    const put = vi.fn(async () => {});
    const kv = { get: vi.fn(async () => null), put };
    const store = resolveIdempotencyStore({ kv, origin: 'https://x.test' })!;
    await store.put('k', 'v', 30);
    expect(put).toHaveBeenCalledWith('idem:k', 'v', { expirationTtl: 60 });
    const direct = kvIdempotencyStore(kv);
    await direct.put('k2', 'v', 900);
    expect(put).toHaveBeenLastCalledWith('idem:k2', 'v', { expirationTtl: 900 });
  });
});

describe('isValidIdempotencyKey', () => {
  it('UUID ok, rövid / idegen karakteres nem', () => {
    expect(isValidIdempotencyKey('3f1c2b9e-8a4d-4f6b-9c1e-2d3f4a5b6c7d')).toBe(true);
    expect(isValidIdempotencyKey('short')).toBe(false);
    expect(isValidIdempotencyKey('a'.repeat(65))).toBe(false);
    expect(isValidIdempotencyKey('../../etc/passwd-aaaaaaaa')).toBe(false);
    expect(isValidIdempotencyKey(undefined)).toBe(false);
    expect(isValidIdempotencyKey(42)).toBe(false);
  });
});

describe('createSubmissionIdKeeper — stabil event_id a próbálkozások között', () => {
  it('ugyanaz a tartalom → ugyanaz az id; változás → új; reset → új', () => {
    let n = 0;
    const keeper = createSubmissionIdKeeper(() => `id-${++n}`);
    expect(keeper.idFor('A')).toBe('id-1');
    expect(keeper.idFor('A')).toBe('id-1'); // retry elveszett válasz után
    expect(keeper.idFor('B')).toBe('id-2'); // a vendég javított az adatain
    keeper.reset();
    expect(keeper.idFor('B')).toBe('id-3');
  });
  it('alapértelmezésben UUID-alakú, és átmegy a szerver kulcs-ellenőrzésén', () => {
    const id = createSubmissionIdKeeper().idFor('x');
    expect(isValidIdempotencyKey(id)).toBe(true);
  });
});
