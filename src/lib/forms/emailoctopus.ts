/**
 * EmailOctopus API v2 kliens — hírlevél-feliratkozás.
 *
 * Dokumentáció: https://emailoctopus.com/api-documentation (v2)
 *   Base URL: https://api.emailoctopus.com
 *   Auth:     `Authorization: Bearer <API_KEY>`  (v2 kulcs a dashboardról:
 *             Account → Integrations & API → API keys → „Create a new key")
 *   Endpoint: POST /lists/{list_id}/contacts
 *   Body:     { email_address, fields: { FirstName }, status: 'subscribed' }
 *
 * A régi 1.6-os API (api_key a body-ban, `SUBSCRIBED` nagybetűvel) DEPRECATED —
 * ez a modul a v2-t használja.
 *
 * Megjegyzés a duplikátumról: ha az email már fenn van a listán, a v2 API 409-et
 * ad — ezt a látogató szempontjából sikerként kezeljük („már fel vagy iratkozva").
 * Ha a listán DOUBLE OPT-IN aktív, az új kontakt a `status` mezőtől függetlenül
 * `pending` állapotba kerül, és megkapja a megerősítő emailt — ez is siker.
 */

const EMAILOCTOPUS_API_BASE = 'https://api.emailoctopus.com';

export interface SubscribeParams {
  /** v2 API kulcs (Worker secret: EMAILOCTOPUS_API_KEY). */
  apiKey: string;
  /** A cél lista azonosítója (EMAILOCTOPUS_LIST_ID). */
  listId: string;
  email: string;
  /** Keresztnév — a lista „FirstName" mezőjébe kerül (opcionális). */
  firstName?: string;
}

export type SubscribeResult =
  | { ok: true; alreadySubscribed: boolean }
  | { ok: false; status: number; code?: string; message: string };

/**
 * Feliratkoztat egy kontaktot a megadott EmailOctopus listára (v2 API).
 * Sosem dob — mindig strukturált eredményt ad vissza, hogy a hívó eldönthesse
 * a felhasználónak mutatott üzenetet és a naplózást.
 */
export async function subscribeContact(p: SubscribeParams): Promise<SubscribeResult> {
  const body: Record<string, unknown> = {
    email_address: p.email,
    status: 'subscribed',
  };
  if (p.firstName) body.fields = { FirstName: p.firstName };

  let res: Response;
  try {
    res = await fetch(
      `${EMAILOCTOPUS_API_BASE}/lists/${encodeURIComponent(p.listId)}/contacts`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${p.apiKey}`,
        },
        body: JSON.stringify(body),
      },
    );
  } catch (err) {
    // Hálózati hiba (a fetch eldobta) — 0-s státusszal jelezzük.
    return { ok: false, status: 0, message: err instanceof Error ? err.message : 'network error' };
  }

  if (res.ok) return { ok: true, alreadySubscribed: false };

  // v2 hiba-envelope: { errors: [{ code, detail }] } — best-effort parse.
  let code: string | undefined;
  let detail = '';
  try {
    const data = (await res.json()) as { errors?: Array<{ code?: string; detail?: string }> };
    const first = data.errors?.[0];
    code = first?.code;
    detail = first?.detail || '';
  } catch {
    /* nem-JSON hibatörzs — marad az üres detail */
  }

  // Már létező kontakt → a látogató szemszögéből siker (ne ijesszük meg hibával).
  if (res.status === 409) {
    return { ok: true, alreadySubscribed: true };
  }

  return { ok: false, status: res.status, code, message: detail || `EmailOctopus ${res.status}` };
}
