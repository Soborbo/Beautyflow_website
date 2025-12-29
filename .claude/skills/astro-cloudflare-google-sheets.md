# Astro.js + Cloudflare + Google Sheets Integráció

Ez a skill leírja, hogyan kell bekötni egy Astro.js alkalmazást Cloudflare Pages-en Google Sheets-hez, hogy a form adatok automatikusan mentésre kerüljenek egy táblázatba.

## Előfeltételek

- Google Cloud Console hozzáférés
- Cloudflare Pages projekt
- Astro.js projekt API route-okkal

## 1. Google Cloud Console Beállítások

### 1.1 Projekt létrehozása (ha nincs még)

1. Menj a [Google Cloud Console](https://console.cloud.google.com/)-ra
2. Kattints a projekt kiválasztóra (felül) → "New Project"
3. Add meg a projekt nevét (pl. "Beautyflow Website")
4. Kattints "Create"-re

### 1.2 Google Sheets API Engedélyezése

1. A projekt dashboardján menj **APIs & Services** → **Enable APIs and Services**
2. Keresd meg: **Google Sheets API**
3. Kattints rá, majd **Enable**

### 1.3 Service Account Létrehozása

1. Menj **APIs & Services** → **Credentials**
2. Kattints **Create Credentials** → **Service Account**
3. Add meg a részleteket:
   - **Service account name**: `beautyflow-sheets-writer` (vagy hasonló)
   - **Service account ID**: automatikusan generálódik
   - **Description**: "Service account for writing form data to Google Sheets"
4. Kattints **Create and Continue**
5. **Grant this service account access to project** → Skip (nem szükséges role)
6. **Grant users access to this service account** → Skip
7. Kattints **Done**

### 1.4 Service Account Key Generálása

1. A Credentials oldalon, kattints a most létrehozott service accountra
2. Menj a **Keys** tabra
3. Kattints **Add Key** → **Create new key**
4. Válaszd a **JSON** formátumot
5. Kattints **Create** - egy JSON fájl letöltődik
6. **FONTOS**: Ezt a fájlt biztonságos helyen tárold, ne commitold git-be!

A JSON fájl tartalma valahogy így néz ki:
```json
{
  "type": "service_account",
  "project_id": "your-project-123456",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n",
  "client_email": "beautyflow-sheets-writer@your-project-123456.iam.gserviceaccount.com",
  "client_id": "123456789",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  ...
}
```

## 2. Google Sheets Beállítások

### 2.1 Táblázat Létrehozása

1. Menj a [Google Sheets](https://sheets.google.com)-re
2. Hozz létre egy új táblázatot (pl. "Beautyflow Lead Forms")
3. Az első sorba írd be a fejléceket:
   ```
   A1: Időpont
   B1: Kezelések
   C1: Vezetéknév
   D1: Keresztnév
   E1: Telefonszám
   F1: Email
   ```

### 2.2 Megosztás a Service Account-tal

1. Kattints a **Share** gombra (jobb felső sarokban)
2. Illeszd be a service account email címét (a JSON fájlból: `client_email`)
   - Példa: `beautyflow-sheets-writer@your-project-123456.iam.gserviceaccount.com`
3. Állítsd be a jogosultságot: **Editor**
4. **TÖRÖLD** a pipát a "Notify people" mellől (nem kell értesítés)
5. Kattints **Share**

### 2.3 Táblázat ID Megszerzése

Az URL-ből vedd ki a táblázat ID-t:
```
https://docs.google.com/spreadsheets/d/1AbC123XyZ456_EXAMPLE_ID/edit
                                    ^^^^^^^^^^^^^^^^^^^^^^
                                    Ez a SPREADSHEET_ID
```

## 3. Cloudflare Pages Környezeti Változók

1. Menj a Cloudflare Dashboard → **Pages** → válaszd ki a projekted
2. **Settings** → **Environment Variables**
3. Add hozzá az alábbi változókat (minden környezethez: Production + Preview):

| Változó neve | Érték | Megjegyzés |
|--------------|-------|------------|
| `GOOGLE_SHEETS_ID` | `1AbC123XyZ456_EXAMPLE_ID` | A táblázat URL-éből |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `beautyflow-sheets-writer@...iam.gserviceaccount.com` | A JSON `client_email` mezője |
| `GOOGLE_PRIVATE_KEY` | `-----BEGIN PRIVATE KEY-----\nMIIE...` | A JSON `private_key` mezője **PONTOSAN ahogy van** (newline-okkal együtt!) |

**KRITIKUS**: A `GOOGLE_PRIVATE_KEY`-t másold be **pontosan** úgy, ahogy a JSON-ben van, az összes `\n` karakterrel együtt!

## 4. NPM Csomagok Telepítése

```bash
npm install googleapis
```

A `package.json`-ben megjelenik:
```json
{
  "dependencies": {
    "googleapis": "^140.0.0"
  }
}
```

## 5. Astro API Route Implementáció

### 5.1 Fájl létrehozása: `src/pages/api/contact.ts`

```typescript
import type { APIRoute } from 'astro';
import { google } from 'googleapis';

interface ContactFormData {
  treatments: string[];
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  consent: boolean;
  website: string; // honeypot
}

// Treatment name mapping
const treatmentNames: Record<string, string> = {
  lezer: 'Dióda Lézeres Szőrtelenítés',
  hydra: 'HydraBeauty Arckezelés',
  smink: 'Tartós Sminktetoválás',
  // ... add more mappings
};

// Format timestamp in Hungarian
function formatTimestamp(): string {
  return new Date().toLocaleString('hu-HU', {
    timeZone: 'Europe/Budapest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Append to Google Sheet
async function appendToGoogleSheet(data: ContactFormData) {
  const sheetId = import.meta.env.GOOGLE_SHEETS_ID;
  const serviceAccountEmail = import.meta.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = import.meta.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!sheetId || !serviceAccountEmail || !privateKey) {
    console.warn('Google Sheets credentials not configured');
    return;
  }

  try {
    const auth = new google.auth.JWT(
      serviceAccountEmail,
      undefined,
      privateKey,
      ['https://www.googleapis.com/auth/spreadsheets']
    );

    const sheets = google.sheets({ version: 'v4', auth });

    const treatmentList = data.treatments
      .map((t) => treatmentNames[t] || t)
      .join(', ');

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Sheet1!A:F', // Adjust based on your sheet name and columns
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [
          [
            formatTimestamp(),
            treatmentList,
            data.lastName,
            data.firstName,
            data.phone,
            data.email,
          ],
        ],
      },
    });
  } catch (error) {
    console.error('Failed to append to Google Sheet:', error);
    // Don't throw - let the form submission succeed even if Sheets fails
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const data: ContactFormData = await request.json();

    // Your validation logic here...

    // Send emails and append to sheet in parallel
    await Promise.all([
      // sendAdminEmail(resend, data),
      // sendUserEmail(resend, data),
      appendToGoogleSheet(data),
    ]);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Contact form error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Hiba történt.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
```

### 5.2 TypeScript típusok (opcionális)

Hozz létre egy `src/env.d.ts` fájlt a típusokhoz:

```typescript
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly GOOGLE_SHEETS_ID: string;
  readonly GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  readonly GOOGLE_PRIVATE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

## 6. Tesztelés

### 6.1 Lokális Tesztelés

1. Hozz létre egy `.env` fájlt a projekt gyökerében:
```env
GOOGLE_SHEETS_ID=1AbC123XyZ456_EXAMPLE_ID
GOOGLE_SERVICE_ACCOUNT_EMAIL=beautyflow-sheets-writer@...iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
```

**FONTOS**: A private key-t idézőjelbe tedd, és az összes `\n` maradjon benne!

2. Add hozzá a `.gitignore`-hoz:
```
.env
*.json  # hogy a service account JSON se kerüljön fel
```

3. Futtasd a dev szervert:
```bash
npm run dev
```

4. Próbáld ki a formot - az adatoknak meg kell jelenniük a Google Sheets-ben!

### 6.2 Production Tesztelés (Cloudflare)

1. Commitold és pushold a kódot
2. Cloudflare automatikusan buildelni fogja
3. Teszteld a form-ot a live URL-en
4. Ellenőrizd a Google Sheets-et

## 7. Hibakeresés

### Problem: "GOOGLE_PRIVATE_KEY undefined"

**Megoldás**: Ellenőrizd, hogy:
- A Cloudflare környezeti változók helyesen be vannak állítva
- A `GOOGLE_PRIVATE_KEY` tartalmazza a teljes kulcsot (BEGIN/END sorokkal)
- Nem maradt ki `\n` karakter

### Problem: "403 Forbidden" vagy "The caller does not have permission"

**Megoldás**:
- A Google Sheets-et meg kell osztani a service account email-jével
- Editor jogosultság szükséges
- Várj néhány percet, az új service account propagálódjon

### Problem: "400 Invalid credentials"

**Megoldás**:
- A private key formátum helyes-e?
- A `.replace(/\\n/g, '\n')` konverzió megtörténik-e?
- Próbáld újra generálni a service account key-t

### Problem: "Range not found: Sheet1!A:F"

**Megoldás**:
- Ellenőrizd, hogy a lap neve valóban "Sheet1"
- Ha más a név, módosítsd a kódban: `range: 'YourSheetName!A:F'`

### Debug Tippek

Console logolás (csak dev-ben):

```typescript
if (import.meta.env.DEV) {
  console.log('Sheet ID:', sheetId?.substring(0, 10) + '...');
  console.log('Service Account:', serviceAccountEmail);
  console.log('Private Key exists:', !!privateKey);
}
```

## 8. Best Practices

1. **Biztonság**:
   - Soha ne commitold a service account JSON-t
   - Soha ne commitold a `.env` fájlt
   - Cloudflare-ben az environment variables biztonságosan tárolódnak

2. **Error Handling**:
   - A Google Sheets írás NE akadályozza meg a form sikeres submit-ját
   - Használj try-catch blokkot
   - Log-old az errorokat, de ne throw-old őket

3. **Performance**:
   - Futtasd párhuzamosan más műveletekkel (pl. email küldés)
   - Használj `Promise.all([...])`

4. **Monitoring**:
   - Cloudflare Pages → Logs-ban látod a console.error üzeneteket
   - Google Sheets-ben látod, ha bejönnek az adatok

## Checklist - Mielőtt Production-be raknád

- [ ] Google Sheets API engedélyezve
- [ ] Service Account létrehozva
- [ ] Service Account JSON letöltve és biztonságosan tárolva
- [ ] Google Sheets megosztva a service account-tal (Editor jog)
- [ ] Cloudflare környezeti változók beállítva (Production + Preview)
- [ ] `GOOGLE_PRIVATE_KEY` tartalmazza az összes `\n` karaktert
- [ ] NPM csomag telepítve: `googleapis`
- [ ] API route implementálva
- [ ] `.env` és `*.json` a `.gitignore`-ban
- [ ] Lokálisan tesztelve
- [ ] Production-ben tesztelve
- [ ] Google Sheets-ben látszanak az adatok

## Hasznos Linkek

- [Google Sheets API Documentation](https://developers.google.com/sheets/api)
- [googleapis npm package](https://www.npmjs.com/package/googleapis)
- [Cloudflare Pages Environment Variables](https://developers.cloudflare.com/pages/configuration/build-configuration/#environment-variables)
- [Astro API Routes](https://docs.astro.build/en/core-concepts/endpoints/)

---

**Készítve**: 2025-12-29
**Utolsó frissítés**: 2025-12-29
**Verzió**: 1.0
