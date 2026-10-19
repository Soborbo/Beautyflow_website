# Konverziós felület-leltár + Ads-architektúra döntés — beautyflow.pro

**Dátum:** 2026-08-24 · **Módszer:** kód-leltár (repo, GTM v38 export) + élő böngészős
verifikáció (Playwright, consent accept-all, e2e teszt lead) + platform-API-k (GA4
Data API, Google Ads API, gateway D1 ledger). **Guardrail betartva: a jóváírt
GA4-import akciókhoz, key-event definíciókhoz és GTM lead-eventekhez NEM nyúltunk.**

## 0. Headline-leletek

1. **Minden fő lead-út mér és jóváíródik** — a kalkulátor-lead ma e2e igazolva:
   dataLayer `lead_submit` → GA4 `generate_lead` (key, value 5000 HUF, event_id-vel)
   → az Ads a GA4-importon számol; párhuzamosan Meta Pixel Lead + gateway CAPI Lead
   **azonos event_id-vel** (dedup OK, ledger: `accepted`/200). A soborbo-tracking
   szerver-oldali konverzió **itt is bizonyítottan él** (eddig nyitott kérdés volt).
2. 🔴 **Meta Lead-DUPLÁZÁS — 5 aktív Event Setup Tool szabály a pixelen** (NEM az
   „Automatic events" toggle, az ki van kapcsolva — a `/tr` hívás `cs_est=true` +
   `est_source` paramétere és a pixel-config `estruleengine` szabályai igazolják).
   A kattintás-szöveg alapú szabályok (mind ACTIVE, a config-ból kiolvasva):
   `Lead` ← „ingyenes konzultáció" (916961074728999) · `Lead` ← „kérem az ingyenes
   konzultációt" (1323125513097137) · `Schedule` ← „időpontfoglalás"
   (27000222739661885) · `Schedule` ← „időpontok budára" (1754692972165801) ·
   `Schedule` ← „időpontok pestre" (1607573456990559).
   Következmények: (a) a form-submitkor a szabály-Lead event_id nélkül megy a
   szándékos Pixel+CAPI Lead MELLÉ → nem dedupolható, Lead ~2×; (b) az „ingyenes
   konzultáció" szabály már a CTA-KATTINTÁSRA is Leadet lő (nem csak beküldésre) →
   további infláció; (c) a Notino-CTA-k a GTM InitiateCheckout MELLETT külön
   `Schedule`-t termelnek. Fix: Events Manager → pixel 915395591548632 → Event setup
   → **Manage events** → mind az 5 szabály törlése/deaktiválása.
   **Kliens-oldali kill switch — 2026-09-08-tól ÉL (GTM 42-es verzió).** A 08-24-i
   `fbq('set','autoConfig',false,…)` kísérlet azért bukott, mert a fbevents.js
   forrása szerint az `autoConfig` kapcsoló CSAK az `AutomaticSetup` feature-t
   opt-out-olja; a `signals/config` ettől függetlenül betölt, és a config maga
   hívja az `fbq.set("estRules", id, [...5 szabály...])` + `fbq.loadPlugin
   ("estruleengine")` + `instance.optIn(id,"ESTRuleEngine",true)` sort. Az
   `estruleengine` plugin viszont KATTINTÁSKOR olvassa a szabálylistát és
   ellenőrzi az opt-in-t, ezért a config-betöltés UTÁN felülírható. A Meta Pixel -
   Base tag ezért 50 ms-os pollinggal megvárja az
   `fbq.instance.configsLoaded[id]`-t, majd `fbq('set','estRules',id,[])` +
   `fbq.instance.optOut(id,'ESTRuleEngine')` (mindkettő publikus fbq-API).
   Élő A/B-teszt 2026-09-08 (fejes Chrome, Playwright; headless-ben a pixel
   botblocking pluginje minden hívást elnyel — ott nem tesztelhető):
   kontroll (41-es verzió) → nav „Ingyenes konzultáció" kattintásra
   `ev=Lead es=automatic est_source=916961074728999`; kill switch → semmi.
   Publikálás utáni verifikáció a kiszolgált konténerrel: `isOptedIn(id,
   'ESTRuleEngine') === false`, „Ingyenes konzultáció" → 0 Lead, „Időpontfoglalás"
   → 0 Schedule, szándékos `fbq('track','Lead',{},{eventID})` → kimegy, eid-vel.
   (A verifikáció 1 db teszt-Leadet küldött a pixelre, eid
   `est-killswitch-verify-1788848712829`, 2026-09-08 ~08:25 UTC — a heti Meta-
   riportból levonandó.) Az autoConfig=false a tagben maradt (AutomaticSetup
   opt-out, kárt nem okoz). Az Events Manager-beli 5 szabály törlése TOVÁBBRA IS
   ajánlott végleges fixként (ha a Meta a config-formátumot vagy a plugin
   opt-in-ellenőrzését megváltoztatja, a kill switch csendben hatástalanná
   válhat — a `/tr` hívások `est_source` paraméterét érdemes negyedévente
   ellenőrizni). A szabályokhoz API nincs, a Meta Ads MCP nem autentikált.
3. 🔴 **WhatsApp-felület nem létezik**: a `WhatsAppButton.astro` komponenst SEMMI nem
   importálja — ezért `whatsapp_click` = 0 (90 nap). A GTM-tag és az alias készen áll;
   döntés kérdése: beilleszteni a Layoutba, vagy a komponenst törölni.
4. 🟡 **Halott callback-vezeték**: GTM `CE - callback_click` → GA4 `generate_lead` +
   AW „Callback request" (secondary) teljesen bekötve, de a site-on SEMMI nem emittál
   `callback_click`-et. Vagy felület kell hozzá, vagy a GTM-tagek/Ads-akció kivezetése.
5. 🟡 **Az EN szalon-oldalakon nincs kontakt űrlap** (a HU `beautyflow-buda/-pest`
   oldalakon van, `contact_submit`-tel) — az EN lead-út csak a kalkulátor + telefon.
6. 🟡 **Cloudflare Google tag gateway zóna-injektálás él a beautyflow.pro-n is**
   (`/i9xo/` path, `google_tags_first_party` marker): a GTM a consent-default ELŐTT
   bootol; ma mérve a pre-consent `ccm/collect` page_view `gcd=13l3l3l3l1l1`+`npa=0`
   paraméterekkel ment ki. Konténer-példány csak egy van (a második load no-op), tehát
   duplamérés nincs — de a consent-sorrend sérül. Flotta-döntés:
   `Serverside docs/2026-08-fleet-conformance.md` §P5-5.2. **A frissen helyreállt
   Ads-jel miatt itt most nem nyúltunk semmihez.**
7. ⚪ Instagram/Facebook profil-linkek (szalon + rólunk oldalak) méretlenek; Messenger-
   link nincs a site-on. Alacsony érték, nem javasolt tag-et költeni rá.

## 1. Felület → esemény mátrix

| # | Felület | Oldalak | dataLayer | GA4 event | GA4 key? | Ads-akció | Primary? | Állapot |
|---|---|---|---|---|---|---|---|---|
| 1 | Konzultációs kalkulátor | /ingyenes-konzultacio, /en/free-consultation | `lead_submit` | `generate_lead` (90d: 24) | ✅ | GA4-import „generate_lead" (7610658671) + AW „Quote request" | **primary** + secondary | ✅ e2e verifikálva ma |
| 2 | Bőranalízis kvíz | /boranalizis, /bordiagnosztika | `lead_submit` | `generate_lead` | ✅ | ugyanaz | ugyanaz | ✅ kódazonos út (külön nem tesztelve) |
| 3 | Kontakt űrlap | HU beautyflow-buda/-pest (EN-en NINCS) | `contact_submit` | `generate_lead` | ✅ | GA4-import „generate_lead" + AW „Contact Form" | primary + secondary | ✅ bekötve |
| 4 | Telefon linkek (fő +36 1 300 9414 59×; mobilok 2-2×) | site-szerte | `phone_click` | `phone_click` (90d: 21) | ✅ | GA4-import „phone_click" (7611053431) + AW „Phone Click" | **primary** + secondary | ✅ kötés 6/6 HU+EN ellenőrizve |
| 5 | Notino foglalás (2 szalon-link) | site-szerte (Layout-szintű delegált kötés) | `booking_click` | `booking_click` (90d: 79 key / 351 event) | ✅ | GA4-import „booking_click" (7705289508) + AW „Booking click" | **primary** + secondary | ✅ bekötve |
| 6 | Email linkek | szalon + adatvédelmi oldalak | `email_click` | `email_click` (90d: **0**) | ❌ | — | — | ✅ kötés él (ma kattintással igazolva); a 0 valódi „nincs kattintás" |
| 7 | WhatsApp gomb | **SEHOL** (árva komponens) | (`whatsapp_click`) | — (90d: 0) | ❌ | — | — | 🔴 felület nem létezik |
| 8 | Visszahívás | **SEHOL** | (`callback_click`) | — | — | AW „Callback request" (secondary) vár rá | — | 🟡 halott vezeték |
| 9 | Hírlevél modal | Layout | `newsletter_signup` | `newsletter_signup` (90d: 7) | ❌ | — | — | ✅ mér, nem konverzió |
| 10 | Instagram/Facebook linkek | szalon + rólunk | — | — | — | — | — | ⚪ méretlen |
| 11 | Messenger | nincs a site-on | — | — | — | — | — | — |
| 12 | Hirdetési hívások | hirdetés-oldali | — | — | — | AD_CALL (primary) + „Click to call" (secondary) | primary | Google-oldali, site-tól független |

Ads-oldalon továbbá primary: GA4-import `qualify_lead`, `close_convert_lead`,
`purchase` (CRM/offline táplálás); secondary: „Thank you page visited" (legacy),
„Lead qualified (CRM)" és „Revenue confirmed (server)" (UPLOAD_CLICKS — a gateway
offline-lába). **Nincs dupla-primary ugyanarra a műveletre.** ✅

## 2. Kontraktus-térkép — JAVASLAT (nem élő átnevezés!)

Tényállás: a `generate_lead` NEM dataLayer-esemény, hanem a GTM-ben három forrás
(`lead_submit`, `contact_submit`, `callback_click`) közös GA4-neve. 1:1 alias ezért
nem lehetséges — a helyes cél a forrásnevek kanonizálása. A gateway ma is
kanonikusan ledgerez (a mai teszt: `lead_submit` → `quote_calculator_submitted`).

Javasolt `event-aliases.json` kiegészítések (a meglévő 14 mellé):

```json
{
  "lead_submit": "quote_calculator_submitted",
  "form_abandon": "form_abandoned",
  "calculator_start": "quote_calculator_opened",
  "calculator_step": "quote_calculator_step_completed",
  "calculator_option": "quote_calculator_option_selected"
}
```

Már létező, rendben lévő aliasok (nem teendő): `booking_click → begin_checkout`,
`phone_click → phone_number_clicked`, `email_click → email_address_clicked`,
`whatsapp_click → whatsapp_button_clicked`, `contact_submit → contact_form_submitted`.

Besorolást igényel (kontraktuson kívüli, fleet-doksi §5 P4.3): `newsletter_signup`
(javaslat: engagement, nem konverzió), `cta_click` és `calculator_result_view`
(site-lokális engagement, dokumentálva marad), `form_abandonment` (a GTM kimeneti
neve — a GA4-ben 90 napon belül még a régi `form_abandon` is él 19 eventtel,
valószínűleg konténer-verzióváltás előtti maradvány; kihal magától).

**A `generate_lead` GA4-név kivezetése** (helyette `quote_calculator_submitted` +
`contact_form_submitted` külön GA4-nevek) CSAK a guardrail szerint mehet: új nevek
7 napig párhuzamosan, key-eventté jelölve, Ads-importtal felvéve, és csak igazolt
jóváírás után demote-olni a mostani `generate_lead` importot. **Most nem lépjük meg.**

## 3. Ads-architektúra döntés

Számok (2026-08-17..23, az első működő hét): 6 jóváírt konverzió — HU 4 db £78
költésen (£19,5/konv.), EN 2 db £16,7-en (£8,4/konv.).

| | (A) GA4-import primary (jelenlegi) | (B) közvetlen gateway-láb |
|---|---|---|
| Státusz | **bizonyítottan jóváír** (első jel 9 hónap után) | A fleet-mérés szerint az OAuth **08-11 óta javítva** (a brief „halott 08-09 óta" állítása elavult); 4 accepted offline gads delivery 30 napban |
| Természet | GA4 → Ads import; érték/dedup kontroll gyengébb, ~1 napos késleltetés | a gateway Modell 2 szerint a Google-láb **offline-only** (lead-status → Data Manager API), NEM web-EC: a (B) nem is versenytársa az (A)-nak a web-konverzióban |
| Kockázat | alacsony — működik | web-EC leghez új fejlesztés kellene; a frissen helyreállt jelet kockáztatná |

**Döntés: (A) marad a permanens primary út.** A (B) már ma is fut a helyén:
a „Lead qualified (CRM)" és „Revenue confirmed (server)" UPLOAD_CLICKS akciók
secondary-ként a gateway offline-lábából táplálkoznak — ez a helyes munkamegosztás
(web-konverzió: GA4-import; minőség/érték: offline upload). Primary-váltás,
párhuzamos web-EC leg építése NEM indokolt. Az OAuth-témát a flotta-szintű
gads-láb munka fedi (már megtörtént, monitorozás a fleet-doksi szerint).

## 4. Meta spot-check (timeboxolt) — eredmény

- Pixel PageView ✓; **szándékos Lead** ✓ `eid=36b929b7-…`, `value=5000 HUF`;
  **CAPI Lead** ✓ ugyanazzal az event_id-vel, ledger `accepted`/200 → dedup OK.
- 🔴 **plusz egy szabály-alapú Lead** (`es=automatic`/`cs_est`, eid nélkül — az
  Event Setup Tool „kérem az ingyenes konzultációt" szabálya) → duplázás, lásd
  Headline 2. Ez magyarázhatja, miért tűnik a Meta-riport „jobbnak", mint a valóság.
- A Pixel-hívásban Advanced Matching hash (ud[em]/ud[ph]) **nincs**; a user_data-t
  a CAPI-leg viszi. Payload-szintű ellenőrzés: Meta Events Manager → Test Events →
  `TEST_BEAUTYFLOW` kód — a mai teszt lead (gateway-smoke-test@soborbo.co.uk) oda
  futott be, ott ellenőrizhető, hogy az em/ph hash valós-e. (A Meta Ads MCP ebben a
  sessionben nincs autentikálva; teljes Meta-audit külön feladat.)
- Zaraz: a mai oldalbetöltéseken Zaraz-hívás nem ment ki — a Meta-láb GTM Pixel +
  gateway CAPI (a fleet-doksi „Zaraz ×4 maradvány" megjegyzése a repo-kódra
  vonatkozik, nem az élő útra).

## 5. Verifikáció + P0-sor

- Teszt lead: „TESZT Smoke", gateway-smoke-test@soborbo.co.uk, +36301234567 —
  a CRM-ben/Sheets-ben erről ismerhető fel; a szerver-leg Meta-oldalon test-event
  módban ment. GA4-be került +1 `generate_lead` (2026-08-24, ~11:56 CEST) — a heti
  riportnál levonandó. Ads-jóváírás ebből NEM lesz (nem volt valós gclid).
- Változtatás a mérőrendszeren: **semmi.** A fleet-konformancia doksi Addendumban
  frissítve (beautyflow-sor), lásd `Serverside docs/2026-08-fleet-conformance.md`.
- **Utólagos változtatás (2026-09-08):** GTM 42-es verzió — Meta Pixel - Base tag
  EST kill switch (Headline 2). A Meta-oldali Lead/Schedule számoknak ettől a
  naptól csökkenniük kell (a szabály-alapú, event_id nélküli események
  megszűnnek); ez NEM valós lead-visszaesés.
