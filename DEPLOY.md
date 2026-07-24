# Beautyflow — Cloudflare Workers deploy

A repo Astro 6 + `@astrojs/cloudflare` v13 + Cloudflare Workers Static Assets módban fut. A korábbi Pages mode (`functions/_middleware.js`) le lett bontva — a redirect / 410 logika most az [Astro middleware](src/middleware.ts)-ben él.

> **Astro 6 / @astrojs/cloudflare v13 megjegyzések:**
> - A `astro build` a Worker deploy-configot a [wrangler.jsonc](wrangler.jsonc)-ból generálja (`dist/server/wrangler.json` + `.wrangler/deploy/config.json`), a `wrangler deploy` ezt használja — a `main` és `assets.directory` mezőket az adapter automatikusan a build kimenetre állítja (`entry.mjs`, `../client`).
> - `astro dev`/build/check a valódi Workers runtime-ot (workerd) futtatja a `@cloudflare/vite-plugin`-en keresztül. A `@tailwindcss/vite` Vite 8-at húzna fel; a `package.json` `overrides: { "vite": "^7" }` ezt Vite 7-re kényszeríti (különben `require_dist is not a function` build hiba).
> - Az Astro 6 alapból engedi a Sessions API-t és egy `SESSION` KV bindinget vár; a kód nem használ sessiont, így a Wrangler deploy-kor auto-provisionálja (nincs teendő).

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
| `EMAILOCTOPUS_LIST_ID_BUDA` | `e8ede3e8-7913-11f1-802c-13a603a274b7` (Budai vendégek) |
| `EMAILOCTOPUS_LIST_ID_PEST` | `1b73f668-7914-11f1-9f79-b770fd549614` (Pesti vendégek) |

**Secrets (encrypted) — ezeket KÉZZEL kell a dashboardon beállítani:**

| Név | Mire kell | Mikor |
|---|---|---|
| `TURNSTILE_SECRET_KEY` | Turnstile server-side verification | **kötelező** |
| `RESEND_API_KEY` | Email küldés (info@beautyflow.pro) | **kötelező** |
| `RESEND_WEBHOOK_SECRET` | Resend bounce/complaint webhook aláírás (`whsec_…`) | **kötelező a bounce-figyeléshez** |
| `EMAILOCTOPUS_API_KEY` | Hírlevél feliratkozás (NewsletterModal) | **kötelező a hírlevélhez** |
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

### 7. EmailOctopus hírlevél (NewsletterModal)

A főoldalon (és minden magyar oldalon) 18 mp után felugró hírlevél-modal a
[`/api/newsletter`](src/pages/api/newsletter.ts) végponton át az EmailOctopus **v2** API-ba
ír (`POST https://api.emailoctopus.com/lists/{list_id}/contacts`, `Authorization: Bearer <API_KEY>`).
Keresztnév + email + szalon kell; a keresztnév a lista **FirstName** mezőjébe kerül.

**Szalonválasztás.** A modalban rádiógomb van (budai VAGY pesti szalon) — pontosan egyet
lehet választani, alapból egyik sincs kijelölve. A választás dönti el, melyik listába kerül
a kontakt. Ha a kontakt már fenn van az adott listán, az API 409-et ad — ezt sikernek
vesszük („már fel vagy iratkozva"). Ugyanaz az email cím a másik listára is felkerülhet egy
későbbi feliratkozással; a két lista független.

A működéshez az EmailOctopus dashboardról kell két dolog:

1. **A két lista ID-je.** A meglévő „Budai vendégek" / „Pesti vendégek" listákat használjuk.
   A lista **ID**-je (UUID) a lista URL-jéből vagy a Settings oldaláról másolható →
   [wrangler.jsonc](wrangler.jsonc) `vars` blokk, `EMAILOCTOPUS_LIST_ID_BUDA` /
   `EMAILOCTOPUS_LIST_ID_PEST` (nem titok, deployjal szállítjuk).
   Mindkét listán legyen `FirstName` mező (ezt küldjük) — ha egy régi, importált listán
   más a mező tag-je, a feliratkozás hibára fut.
2. **API kulcs (v2).** Account → **Integrations & API** → API keys → *Create a new key*.
   Ez SECRET → `wrangler secret put EMAILOCTOPUS_API_KEY` (vagy CF dashboard → Secrets).

Opcionális: a listán a **double opt-in** kapcsoló dönti el, hogy a feliratkozó kap-e
megerősítő emailt (ilyenkor `pending` státusszal kerül be, amíg meg nem erősíti).

Amíg a lista ID vagy az API kulcs hiányzik, a végpont `503`-at ad és a modal barátságos
hibaüzenetet mutat — a többi form (kapcsolat, kvíz) ettől független, változatlanul megy.

## Tracking

A browser tracking forrása a `tracking-kit`, a production GTM egyetlen
importálható forrása pedig:

`tracking/GTM-W8V3BVGD_fixed.json`

Újragenerálás:

```sh
npm run generate:gtm
```

A konténer tartalmazza:

- GA4 Configuration `G-774BY4X64P` ID-val és pageview-val;
- minden alkalmazás által küldött dataLayer event triggerét és GA4 tagjét;
- külön Contact/Lead és Phone Google Ads actiont;
- közvetlen Enhanced Conversions user-data változót;
- Meta PageView, Lead, Contact és InitiateCheckout tageket;
- Clarity taget analytics consenttel.

CookieYes nem GTM-tagként töltődik: a `Tracking.astro` közvetlenül tölti be a
denied Consent Mode default után és a GTM előtt. Így nincs kettős vagy eltérő
consent-konfiguráció.

A régi `tracking/GTM-W8V3BVGD_migrated.json` és `tracking/gtm-transform.py`
csak migrációs előzmény, nem importálható production forrás.

### Server-side tracking

A site Worker az `/api/event/*` útvonalat a központi event-gateway Workerhez
proxyzza. A gateway végzi a Meta CAPI és Google Ads fan-outot; GA4 alapértelmezetten
browser-oldali, hogy ne legyen Measurement Protocol dupla számlálás.

A health check:

```sh
curl https://beautyflow.pro/api/event/health
```

A Google Ads accountban jelenleg csak Contact/Lead és Phone action/label ismert.
A booking GA4-ban és Metában mérve van, de addig nem küldhető Contactként a Google
Adsba, amíg nincs saját Booking conversion actionje.

## Astro middleware

A régi `functions/_middleware.js` (Pages style) ki lett véve és [src/middleware.ts](src/middleware.ts)-re lett konvertálva. Tartalmazza:
- 301 redirect tábla a régi WordPress URL-ekhez
- 410 Gone a véglegesen törölt oldalakhoz
- WordPress URL pattern blokk

## Mit kell még csinálnod élesítés előtt

1. ✅ A 4 secret beállítása a CF dashboardon: `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY` (már megvan).
2. ✅ A plain text env varok beállítása (lásd 3. pont fent).
3. ✅ Turnstile domainek (`beautyflow.pro`, `www.beautyflow.pro`) hozzáadása a Cloudflare Turnstile widget-hez.
4. ⚠️ A `tracking/GTM-W8V3BVGD_fixed.json` importálása **Overwrite** módban,
   Preview ellenőrzése és publikálása.
5. ⚠️ Külön Google Ads Booking conversion action létrehozása, a label beírása
   `tracking/beautyflow.gtm.json`-ba, regenerálás és újrapublikálás.
6. ✅ A régi GTM tageket az Overwrite import eltávolítja; Merge módot ne használj.
7. ✅ GA4 Measurement Protocol maradjon kikapcsolva a gateway-ben, amíg a browser
   GA4 aktív, különben a konverziók duplán számolódnak.

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
