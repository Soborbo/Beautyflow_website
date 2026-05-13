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

A `--keep-vars` fontos: e nélkül a dashboardon beállított plaintext env varok minden deploykor törlődnek.

### 3. Environment variables — Settings → Variables and Secrets

**Plain text (build + runtime):**

| Név | Érték |
|---|---|
| `PUBLIC_GTM_ID` | `GTM-W8V3BVGD` |
| `PUBLIC_TURNSTILE_SITE_KEY` | `0x4AAAAAA...` (Turnstile widget site key) |
| `PUBLIC_GA4_MEASUREMENT_ID` | `G-774BY4X64P` |
| `PUBLIC_META_PIXEL_ID` | `915395591548632` |
| `PUBLIC_SITE_URL` | `https://beautyflow.pro` |
| `GA4_MEASUREMENT_ID` | `G-774BY4X64P` |
| `META_PIXEL_ID` | `915395591548632` |
| `SITE_URL` | `https://beautyflow.pro` |

**Secrets (encrypted):**

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
