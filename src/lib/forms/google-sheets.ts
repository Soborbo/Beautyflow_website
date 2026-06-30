/**
 * Google Sheets írás szolgáltatás-fiókkal (OAuth JWT), SDK nélkül —
 * Cloudflare Workers-kompatibilis (WebCrypto).
 *
 * Ugyanaz a JWT/RAW-érték minta, mint az /api/contact-ban, de újrahasznosítható
 * modulként. A `stringValue` (RAW) megakadályozza a képlet-injekciót.
 *
 * A hibák `SheetsCallError`-ként dobódnak (HTTP státusszal), hogy a hívó a
 * catalogue SHEETS-* kódjaira tudja osztályozni őket (lásd ./errors/classify).
 */

import { SheetsCallError } from '@/lib/errors/classify';

function bytesToBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < len ? bytes[i + 1] : 0;
    const b3 = i + 2 < len ? bytes[i + 2] : 0;
    result += chars[b1 >> 2];
    result += chars[((b1 & 3) << 4) | (b2 >> 4)];
    result += i + 1 < len ? chars[((b2 & 15) << 2) | (b3 >> 6)] : '=';
    result += i + 2 < len ? chars[b3 & 63] : '=';
  }
  return result;
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  let len = base64.length;
  if (base64[len - 1] === '=') len--;
  if (base64[len - 1] === '=') len--;
  const bytes = new Uint8Array((len * 3) >> 2);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const c1 = lookup[base64.charCodeAt(i)];
    const c2 = lookup[base64.charCodeAt(i + 1)];
    const c3 = i + 2 < len ? lookup[base64.charCodeAt(i + 2)] : 0;
    const c4 = i + 3 < len ? lookup[base64.charCodeAt(i + 3)] : 0;
    bytes[p++] = (c1 << 2) | (c2 >> 4);
    if (i + 2 < len) bytes[p++] = ((c2 & 15) << 4) | (c3 >> 2);
    if (i + 3 < len) bytes[p++] = ((c3 & 3) << 6) | c4;
  }
  return bytes;
}

function base64UrlEncode(str: string): string {
  return bytesToBase64(new TextEncoder().encode(str)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  return bytesToBase64(new Uint8Array(buffer)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importPrivateKey(pemKey: string): Promise<CryptoKey> {
  const normalizedKey = pemKey.replace(/\\n/g, '\n').replace(/\\\\n/g, '\n').trim();
  const pemContents = normalizedKey
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/[\s\r\n]/g, '');
  const bytes = base64ToBytes(pemContents);
  return crypto.subtle.importKey('pkcs8', bytes, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

async function createGoogleJWT(serviceAccountEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccountEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const signatureInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const key = await importPrivateKey(privateKey);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signatureInput));
  return `${signatureInput}.${arrayBufferToBase64Url(signature)}`;
}

export async function getGoogleAccessToken(serviceAccountEmail: string, privateKey: string): Promise<string> {
  const jwt = await createGoogleJWT(serviceAccountEmail, privateKey);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  if (!response.ok) throw new SheetsCallError(`Token failed: ${await response.text()}`, 'token', response.status);
  return (await response.json() as { access_token: string }).access_token;
}

export async function getSheetGid(sheetId: string, accessToken: string, tabName: string): Promise<number> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties(sheetId,title)`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new SheetsCallError(`Sheets metadata error: ${await response.text()}`, 'metadata', response.status);
  const body = (await response.json()) as { sheets?: { properties?: { sheetId?: number; title?: string } }[] };
  const sheet = body.sheets?.find((s) => s.properties?.title === tabName);
  if (!sheet?.properties || (sheet.properties.sheetId === undefined)) {
    throw new SheetsCallError(`Sheet tab "${tabName}" not found`, 'metadata', 404);
  }
  return sheet.properties.sheetId!;
}

/**
 * Új sort szúr a megadott fül 2. sorába (a fejléc alá), így a legújabb felül marad.
 * `stringValue` (RAW) — nincs képlet-kiértékelés.
 */
export async function insertRowAtTop(
  sheetId: string,
  accessToken: string,
  gid: number,
  values: string[],
): Promise<void> {
  const INSERT_ROW_INDEX_ZERO_BASED = 1;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`;

  // updateCells a rácshatáron BELÜL ír — ha a sor szélesebb, mint a fül
  // oszlopszáma, a teljes batchUpdate atomikusan elbukik (és a sor SEM íródik be).
  // Ezért előbb megnézzük az oszlopszámot, és ha kell, a végére bővítünk (a
  // keskenyebb soroknál — pl. kontakt-űrlap — ez sosem fut le). Best-effort: ha
  // a meta-lekérés hibázik, a beírás akkor is megpróbálódik.
  const requests: unknown[] = [];
  try {
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets(properties(sheetId,gridProperties(columnCount)))`;
    const metaRes = await fetch(metaUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (metaRes.ok) {
      const meta = (await metaRes.json()) as {
        sheets?: { properties?: { sheetId?: number; gridProperties?: { columnCount?: number } } }[];
      };
      const cols = meta.sheets?.find((s) => s.properties?.sheetId === gid)?.properties?.gridProperties?.columnCount ?? 0;
      if (cols > 0 && values.length > cols) {
        requests.push({ appendDimension: { sheetId: gid, dimension: 'COLUMNS', length: values.length - cols } });
      }
    }
  } catch { /* best-effort oszlopbővítés — a beírás alább így is lefut */ }

  requests.push(
    {
      insertDimension: {
        range: { sheetId: gid, dimension: 'ROWS', startIndex: INSERT_ROW_INDEX_ZERO_BASED, endIndex: INSERT_ROW_INDEX_ZERO_BASED + 1 },
        inheritFromBefore: false,
      },
    },
    {
      updateCells: {
        rows: [{ values: values.map((v) => ({ userEnteredValue: { stringValue: String(v) } })) }],
        fields: 'userEnteredValue',
        start: { sheetId: gid, rowIndex: INSERT_ROW_INDEX_ZERO_BASED, columnIndex: 0 },
      },
    },
  );

  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  if (!response.ok) throw new SheetsCallError(`Sheets error: ${await response.text()}`, 'write', response.status);
}
