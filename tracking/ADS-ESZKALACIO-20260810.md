# Google Ads konverzió-nyomozás — státusz 2026-08-10 (v2, JAVÍTOTT)

## EREDMÉNY 2026-08-12 (a lenti teszt kiértékelése)

**A Booking click diagnosztikai teszt NEM jelent meg.** GAQL 08-12-én:
`all_conversions_by_conversion_date` LAST_7_DAYS = 0 minden actionön, ÉS
`all_conversions` (klikk-dátum szerint) LAST_14_DAYS = 0 — a 08-09-i valódi
gclid-del, WEBSITE-originű akcióra (7696207893), G111 consenttel, HTTP 200-zal
kilőtt konverzió ~2 nap után sincs jóváírva. **A lenti terv szerint a support
ticket mostantól INDOKOLT** — a bizonyítékcsomag ebben a fájlban van (user dönt).

Offline ág frissítés 08-11–08-12:
- GYÖKÉROK MEGERŐSÍTVE + JAVÍTVA: a `GADS_OAUTH_CLIENT_ID` dashboard-var egy
  korábbi deploynál törlődött → 08-11 óta a Serverside wrangler.toml `[vars]`
  blokkjában van; a refresh token visszakerült a KV-ba
  (`gads:9796138635:refresh_token` létezik, ellenőrizve 08-12).
- A token BIZONYÍTOTTAN működik: trapezlemezes `booking_confirmed` gads-delivery
  **accepted** 08-11 19:31-kor (ledger `deliveries`).
- A 3 beautyflow TRK-800-001-es esemény viszont HALOTT: 3 queue-retry
  (utolsó: 08-09 16:27) + a 24 órás ablak lejárt → R2 dead-archívum
  (`soborbo-tracking-dlq-eu` EU-bucket, `beautyflow/gads/dead/2026-08-09/...`).
  Automatikus retry NEM jön. Visszajátszás: (a) admin single-key replay
  (`POST /api/event/admin/dlq/replay` body `{"key": "..."}`, X-Admin-Token) —
  a pontos kulcsokat listázni kell (wranglerben nincs `r2 object list`; dashboard
  R2 böngésző vagy rclone kell); VAGY (b) egyszerűbb: a 3 esemény újraküldése a
  CRM outboxból (a `crm_tracking_events` sorok visszaállítása pending-re) — az
  orderId determinisztikus (sha256(lead_id_status)), Google-oldali dedup véd a
  duplázás ellen. Event_id-k: 88b9fcd8→9037596a…, 8a88cabc→4e454456…,
  cb9e066e→9183b44a….
- ARCHITEKTÚRA-LELET: az offline lead-status → Data Manager upload SOHA nem visz
  gclid-et — a gateway `sendToDataManager` támogatja (`payload.gclid` →
  `adIdentifiers`), de a lead-status route `gadsPayload`-jában nincs gclid mező;
  match kizárólag hashelt email/telefon alapján. A CRM outbox-builder gclid-bug
  javítása önmagában NEM elég, a gateway lead-status útját is bővíteni kell.
- Ledger-értelmezési csapda: a `lead_status.uploaded_to_gads` csak az ELSŐ
  próbálkozást rögzíti, retry-siker NEM írja vissza — a valós állapot a
  `deliveries` táblában van (origin='retry', status='accepted').

**⛔ NE KÜLDD BE supportnak.** A v1 verdikt („Google-oldali jóváírási hiba, bizonyítva")
HIBÁS TESZTEN állt, visszavonva. A 08-07-i diagnosztikai beacon a **Click to call**
(7335759042) akcióra ment, amelynek `origin=CALL_FROM_ADS` — azt a Google hívás-
jelentésből írja jóvá, website-beaconből definíció szerint nem. A teszt így semmit
nem bizonyított.

## Érvényes, folyamatban lévő teszt (2026-08-10)

Megismételve a helyes, WEBSITE-originű akcióra:

- Akció: **Booking click (Notino)**, id 7696207893, `type=WEBPAGE`, `origin=WEBSITE`
- `label=EgUzCJWg69UcEKLizM5B`, `oid=diag-bookingclick-20260810-a1b2`
- Valódi 2026-08-09-i click_view gclid: `CjwKCAjw…(kitakarva — valódi látogatói klikk-ID)`
- Friss izolált profil, CookieYes elfogadva, `gcs=G111`, `gcd=13r3r3r3r5l1`, HTTP 200
- **Ellenőrzés: 2026-08-11-én.** Ha megjelenik → a website-jóváírás él, nincs Google-hiba.
  Ha nem → AKKOR jöhet support ticket, ezzel a tesztadattal.

## Offline ág (CRM → gateway → Google) — a tényleges hibalánc

A lead-státuszok 08-09-én le lettek léptetve (16 lezart_nyert), az outbox lefutott
(16 accepted), a gateway ledgerbe minden beérkezett — de **0/16 upload történt**:

1. **13/16: consent-kapu blokk** (tervezett skip, nincs hibakód): a CRM
   `ad_allowed=0`-t küldött és nincs explicit GRANTED consent-receipt.
2. **3/16 (88b9fcd8, 8a88cabc, cb9e066e): TRK-800-001 = GADS_NO_ACCESS_TOKEN.**
   Gyökérok: a `soborbo-tracking-oauth-tokens` KV (f4646478…) **TELJESEN ÜRES** —
   nincs refresh token EGYIK customerre sem. (Júniusban a painless-upload még ment,
   azóta tűntek el a tokenek.)
3. Az outbox-sorokban a **gclid mindenütt NULL**, pedig 9 leadnél ott van a CRM
   `lead_attribution`-ben — az outbox-építő nem húzza be (CRM-repo bug, javítandó;
   e-mail nélküli leadeknél e nélkül nincs match-azonosító).

### Javítási sorrend (offline ág)

1. **OAuth flow újrafuttatása**: `GET <gateway>/api/event/oauth-init?customer_id=9796138635`
   `X-Admin-Token: <ADMIN_API_TOKEN>` fejléccel → Google consent (a fiók-tulajdonos Google-fiókjával)
   → a callback beírja a refresh tokent a KV-ba. Scope-ok: datamanager + adwords +
   analytics.readonly.
2. **CRM outbox-builder**: gclid behúzása a `lead_attribution`-ből.
3. Újraküldés: a 3 TRK-800-001-es esemény retry-olható; a consent-blokkolt 13-nál
   consent-receipt/ad_allowed kérdést kell rendezni (jogszerűen csak ami tényleg consentes).
4. 90 napos ablakon belül minden visszamenőleg elszámolódik.

## További megerősített tények

- 2025-11: Click to call 4 (hívásjelentés!) + Thank you page 3 konverzió; azóta 0.
- CALL asset 294172116143 → `conversionActions/179` (fiókszintű default, nincs a
  listában) — a hívás-jelentési láb rendezetlen.
- A `Lead qualified (CRM)` és `Revenue confirmed (server)` akciók **secondary +
  includeInConversionsMetric=false** — tudatos júliusi döntés, de PMax/érték-alapú
  licit előtt primary-ra kell állítani, különben nem vezérelnek semmit.
- Kliens-oldal (consent v2, gclid-lánc, GTM címkék, auto-tagging, GA4-link): mind
  ellenőrizve, rendben.
