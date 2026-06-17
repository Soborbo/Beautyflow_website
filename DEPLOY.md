# Beautyflow — Cloudflare Workers deploy

A repo Astro 5 + Cloudflare Workers Static Assets módban fut. A korábbi Pages mode (`functions/_middleware.js`) le lett bontva — a redirect / 410 logika most az [Astro middleware](src/middleware.ts)-ben él.

## Helyi fejlesztés

```bash
cp .dev.vars.example .dev.vars
# Töltsd ki .dev.vars-ot (lokálishoz a Cloudflare Turnstile + Resend test kulcsok elegek)
npm install
npm run dev      # Astro dev server (http://localhost:4321)
npm run build    # production build
npm run preview  # wrangler dev (Workers runtime)
```

A `.dev.vars` gitignored. Production secrets a Cloudflare dashboardon.

## Cloudflare dashboard — Workers Build

### 1. Connect a repo
Cloudflare dashboard → Workers & Pages → Create → Import a repository → válaszd ki a `Beautyflow_website` GitHub repót.

### 2. Build settings
- **Build command**: `npm run build`
- **Deploy command**: `npx wrangler deploy --keep-vars`
- **Root directory**: `/`
- **Branch**: `main`

> ⚠️ **A `--keep-vars` flag kötelező.** E nélkül a `wrangler deploy` minden alkalommal csak a `wrangler.jsonc`-ban definiált `vars` blokkot tekinti igazságforrásnak, és a dashboardon kézzel beállított plaintext env varokat törli (Secrets érintetlenül maradnak). A `package.json` `deploy` scriptje is `--keep-vars`-szal fut, így ha a Cloudflare Workers Build a `npm run deploy`-ra hivatkozik a Deploy command mezőben, az is védve van.

### 3. Environment variables — Settings → Variables and Secrets

**Plain text varok már a [wrangler.jsonc](wrangler.jsonc) `vars` blokkjában élnek** — minden deploy automatikusan beállítja őket, nem kell dashboardon kattintgatni. A dashboardon csak akkor érdemes felülírni egyet, ha staging/dev különböző értéket akarsz használni (pl. másik Turnstile widget): a `--keep-vars` miatt a dashboard érték nyer és a deploy nem törli.

| Név | Érték (default a wrangler.jsonc-ből) |
|---|---|
| `PUBLIC_GTM_ID` | `GTM-W8V3BVGD` |
| `PUBLIC_TURNSTILE_SITE_KEY` | `0x4AAAAAADOTyE9gccGo16os` |
| `PUBLIC_GA4_MEASUREMENT_ID` | `G-774BY4X64P` |
| `PUBLIC_META_PIXEL_ID` | `915395591548632` |
| `PUBLIC_SITE_URL` | `https://beautyflow.pro` |
| `GA4_MEASUREMENT_ID` | `G-774BY4X64P` |
| `META_PIXEL_ID` | `915395591548632` |
| `SITE_URL` | `https://beautyflow.pro` |

**Secrets (encrypted) — ezeket KÉZZEL kell a dashboardon beállítani:**

| Név | Mire kell | Mikor |
|---|---|---|
| `TURNSTILE_SECRET_KEY` | Turnstile server-side verification | **kötelező** |
| `RESEND_API_KEY` | Email küldés (info@beautyflow.pro) | **kötelező** |
| `GOOGLE_SHEETS_ID` | Lead log Google Sheets-be | opcionális |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Sheets service account | opcionális |
| `GOOGLE_PRIVATE_KEY` | Sheets service account key | opcionális |
| `GA4_API_SECRET` | Server-side GA4 Measurement Protocol | később (akkor működik a server-mirror) |
| `META_CAPI_ACCESS_TOKEN` | Server-side Meta CAPI | később (akkor működik a server-mirror) |
| `META_CAPI_TEST_EVENT_CODE` | **CSAK TESZTHEZ** — Meta Events Manager → Test Events code | **távolítsd el** production előtt |

### 4. Turnstile

Cloudflare dashboard → Turnstile → Add Site:
- Domain: `beautyflow.pro`, `www.beautyflow.pro` (és `localhost` dev-hez)
- Widget mode: **Managed** vagy **Invisible** (a contact form mindkettővel kompatibilis)
- A kapott **Site Key** → `PUBLIC_TURNSTILE_SITE_KEY` (plain text)
- A **Secret Key** → `TURNSTILE_SECRET_KEY` (encrypted secret)

### 5. Resend

A `RESEND_API_KEY` már be van állítva. Domain (`beautyflow.pro`) verified kell legyen a Resend dashboardon.
A küldési címek: `info@beautyflow.pro` (admin + user confirmation).
A reply-to a user email címe (admin levél).

### 6. Custom domain
Dashboard → a worker beállításai → Custom Domains → Add → `beautyflow.pro` és `www.beautyflow.pro`.

## Tracking — mi van be drótozva, mi nincs

A teljes tracking-kit ([src/lib/tracking/](src/lib/tracking/)) telepítve. Browser-side events:

| Event | Trigger |
|---|---|
| `form_start` | első fókusz egy kapcsolati / kalkulátor űrlapra |
| `form_step_complete` | kalkulátor lépés továbblépéskor (Buda/Pest formhoz nincs lépés) |
| `form_abandonment` | tab close / hide submit nélkül (sendBeacon → `/api/track/abandonment`) |
| `contact_form_submit` | sikeres kapcsolat- vagy konzultáció-küldés (→ Meta CAPI `Contact`) |
| `phone_conversion` | tel: link kattintás (kit globális listener) |
| `email_conversion` | mailto: kattintás |
| `whatsapp_conversion` | wa.me / whatsapp.com kattintás |
| `booking_click` | bármilyen Notino salon link kattintás (→ Meta CAPI `InitiateCheckout`) |
| `scroll_50`, `scroll_90` | scroll mélység |

### GTM munka (te csinálod a dashboardon)

A meglevő `GTM-W8V3BVGD` container-ben a régi tracking package event neveket lőtt; az új kit nevei különböznek. Be kell drótoznod:

1. **Custom Event triggerek** minden új event név után (`form_start`, `contact_form_submit`, `phone_conversion`, `booking_click`, stb.) — pontos match az event név mezőre.
2. **Data Layer Variables** a paramekhez: `event_id`, `value`, `currency`, `service`, `source`, `form_name`, `step_number`.
3. **Google Tag (GA4 Config)** marad — most már az `G-774BY4X64P` ID-vel.
4. **GA4 Event tagek** minden új eventhez.
5. **Meta Pixel base tag** (`915395591548632`) — Consent Initialization triggeren, `ad_storage = granted` required.
6. **Meta Pixel event tagek** — `Lead`, `Contact`, `ViewContent`, `InitiateCheckout`. Mindegyikbe rakd be az `eventID` paramétert a `DLV - event_id`-ből — ez kell a browser+CAPI dedup-hoz.
7. **Google Ads conversion tagek** — a `booking_click` és `contact_form_submit` eventekhez, `event_id` mint Transaction ID.
8. **User-Provided Data** (Enhanced Conversions): Custom JS variable ami olvas a `#__bf_user_data__` hidden div-ből (van setup példa a [tracking-kit SETUP.md](https://github.com/Soborbo/claudeskills/blob/main/tracking-kit/SETUP.md)-ben).
9. **Consent Mode v2** alapból denied state-ben — kell egy CMP (CookieYes) tag az "Consent Initialization - All Pages" triggeren.

### Server-side tracking státusza

- **GA4 Measurement Protocol**: `GA4_API_SECRET` ha be van állítva, akkor abandonment + form events server-side is mennek
- **Meta CAPI**: `META_CAPI_ACCESS_TOKEN` ha be van állítva, akkor a browser-side mirror (`/api/meta/capi`) átküldi a Meta-nak. Hashing az `@noble/hashes`-szel megy a worker-ben.

Mindkettő gracefully no-op-ol ha a token hiányzik — browser-side tracking attól még megy.

## Astro middleware

A régi `functions/_middleware.js` (Pages style) ki lett véve és [src/middleware.ts](src/middleware.ts)-re lett konvertálva. Tartalmazza:
- 301 redirect tábla a régi WordPress URL-ekhez
- 410 Gone a véglegesen törölt oldalakhoz
- WordPress URL pattern blokk

## Mit kell még csinálnod élesítés előtt

1. ✅ A 4 secret beállítása a CF dashboardon: `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY` (már megvan).
2. ✅ A plain text env varok beállítása (lásd 3. pont fent).
3. ✅ Turnstile domainek (`beautyflow.pro`, `www.beautyflow.pro`) hozzáadása a Cloudflare Turnstile widget-hez.
4. ⚠️ GTM container update — új event nevek + Meta Pixel base tag (Pixel ID: `915395591548632`).
5. ⚠️ Meta Conversions API access token (`META_CAPI_ACCESS_TOKEN`) beállítása amikor kész a Meta CAPI bekapcsolásra (kód már várja).
6. ⚠️ GA4 Measurement Protocol API secret (`GA4_API_SECRET`) ha kell a server-side abandonment tracking.
7. ⚠️ Régi GTM tagek archiválása / triggereik kikapcsolása (a régi event nevek `contact_form`, `tel_click`, stb. már nem fognak tüzelni — az új kit más neveket használ).

## Lokális teszt forgatókönyv

```bash
cp .dev.vars.example .dev.vars
# Tedd be a TURNSTILE_SECRET_KEY-be: 1x0000000000000000000000000000000AA (Cloudflare always-passes test secret)
# Tedd be a PUBLIC_TURNSTILE_SITE_KEY-be: 1x00000000000000000000AA (always-passes test site key)
# Tedd be a RESEND_API_KEY-t (igazi key, vagy let it fail és nézd a console error-t)

npm run dev
# Nyisd meg http://localhost:4321/beautyflow-buda
# Töltsd ki a kapcsolat formot, submit
# Konzol: tracking events, /api/contact 200 OK, redirect /koszonjuk-ra
```

## Ingyenes bőranalízis kvíz (`/boranalizis`)

Önálló lead-magnet kvíz (HU-only, noindex). Folyamat: ~20 kérdés 6 szakaszban →
kontakt KAPU → szerveroldali ajánló-motor (`src/quiz/lib/recommendation.ts`) →
eredményoldal `/eredmeny/[hash]`.

**Nem igényel új secretet** — a meglévő `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`,
`GOOGLE_SHEETS_*` bindingokat használja. A kvíz e nélkül is működik:
az eredmény a kliens localStorage-ben + a vendég emailjében is megvan.

### 1. Google Sheets — „Boranalizis" fül (opcionális)
Hozz létre a meglévő `GOOGLE_SHEETS_ID` táblában egy **`Boranalizis`** nevű fület,
és tedd be az **1. sorba** a fejlécet (A→U oszlop):

```
Időbélyeg | Eredmény-hash | Keresztnév | Telefon | Email | Szalon | Bőrprofil | Javasolt irány | Becsült ársáv | Útvonal | Kozmetikus flagek | Fő panasz | Cél | Sürgősség | Életkor | Allergia részletek | Hozzájárulás időbélyeg | gclid | fbclid | utm | Nyers válaszok (JSON)
```
Az új sorok a 2. sorba kerülnek (legújabb felül), `stringValue` (RAW, képlet-injekció ellen).

### 2. KV — cross-device eredmény-link (opcionális)
Csak ahhoz kell, hogy az emailben küldött eredmény-link **más eszközön** is megnyíljon.
```bash
npx wrangler kv namespace create QUIZ_RESULTS
```
Másold az id-t a `wrangler.jsonc`-ba (lásd az ottani TODO blokkot), és vedd ki a kommentből.

### 3. GTM eventek (a kit követéséhez)
`calculator_step`, `calculator_option`, `calculator_submit` (quoteId = hash),
`calculator_value` (becsült ársáv, HUF), `calculator_result_view`, `lead_submit`.
A Meta CAPI mirror `contact_form_submit` + `primary_conversion` néven fut (mint a kapcsolat formnál).

### 4. Operátori pótlandók (`// TODO` a kódban, a kvíz nélkülük is megy)
- **Tényleges szalonárak** — `src/quiz/config/treatments.ts` (placeholder ársávok, ~30 000 Ft+).
- **CoreaPil / Fusion Plasma / Hack** részletes copy — `treatments.ts` (`copyTodo`).
- **Fanni záróvideó** — `src/pages/eredmeny/[hash].astro` (placeholder blokk).
- **Adatkezelési tájékoztató** egészségügyi-adat záradéka — `/adatvedelmi-tajekoztato`.
- **Foglaló naptár** — jelenleg kézi visszahívás + tel CTA (`eredmeny/[hash].astro`).
- **Képes kártya illusztrációk** (Q1, Q20) — `QuizApp.astro` (`// TODO: kép`).

### 5. Miért nincs commitolt `package-lock.json`
A `sharp`, `@tailwindcss/oxide` és a `rolldown` platform-specifikus natív + wasm
opcionális függőségeket szállít (`@img/sharp-*`, `@emnapi/*`, `@napi-rs/wasm-runtime`).
Egy Windows-on generált lock **nem tudja** beletenni a Linux-only ágak beágyazott
`@emnapi` bejegyzéseit, ezért a Cloudflare Linux buildjén a `npm ci` konzisztencia-
ellenőrzése elhasal (`Missing @emnapi/runtime@1.11.1 from lock file`). Lock nélkül a
CF `npm install`-t futtat, ami platformhelyesen old fel — ezért a `package-lock.json`
szándékosan gitignore-olt. Ha újra szeretnél commitolt lockot + `npm ci`-t, azt
**Linux** környezetben kell generálni (CI vagy `npm install --package-lock-only`).
