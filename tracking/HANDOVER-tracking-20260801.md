# HANDOVER — Beautyflow tracking / Google Ads konverzió-ügy (2026-08-01)

Előző két munkamenet összefoglalója. A projekt-memóriában is megvan a lényeg
(`project_beautyflow_tracking_audit_open_items` memóriafájl), ez itt a teljes kép.

## Azonosítók

| Mi | Érték |
|---|---|
| Site | https://beautyflow.pro — Worker: `beautyflow-website` (deploy: `npm run deploy`, LOKÁLBÓL, `--keep-vars`) |
| GTM | GTM-W8V3BVGD, account 6252358257 / container 196968106, **live = v38** (stape-gtm MCP) |
| GA4 | property 495936197, mérési ID a GTM `CONST - GA4 Measurement ID`-ban (G-774BY4X64P) |
| Google Ads | customer 9796138635, AW-17613140258 (Pipeboard MCP) |
| Gateway | `event-gateway` worker (repo: Soborbo/Serverside), ledger D1: `event-gateway-ledger` |
| Site-config KV | namespace `edd34e28eee847c09c26f9d9e3ea04ab`, kulcsok: `beautyflow.pro`, `www.beautyflow.pro` |
| CRM | crm.beautyflow.pro, worker `beautyflow-crm`, D1: `beautyflow-crm` (repo: d:/soborbo-crm/soborbo-crm) |
| CRM cron | `beautyflow-cron-driver` → 5 percenként üti a `/api/cron/outbox-dispatch`-et |

## Ads konverziós actionök ↔ GTM címkék (mind ellenőrizve, helyes)

| Action | ID | Címke | Forrás |
|---|---|---|---|
| Quote request (kalkulátor) | 7695876662 | lmyXCLaE19UcEKLizM5B | GTM awct, CE lead_submit |
| Callback request | 7696266676 | rIWPCLTr7tUcEKLizM5B | GTM awct, CE callback_click |
| Booking click (Notino) | 7696207893 | EgUzCJWg69UcEKLizM5B | GTM awct, CE booking_click |
| Thank you page visited (=Contact) | 7335562213 | s1NzCOWX76kbEKLizM5B | GTM awct, CE contact_submit |
| Click to call (=Phone) | 7335759042 | D0UgCMKZ-6kbEKLizM5B | GTM awct, CE phone_click |
| Lead qualified (CRM) | 7701849534 | — (UPLOAD_CLICKS, Secondary) | gateway /lead-status, CRM `kvalifikalt` |
| Revenue confirmed (server) | 7664842040 | — (UPLOAD_CLICKS, Secondary) | gateway /lead-status, CRM `lezart_nyert` |

## FŐ MEGÁLLAPÍTÁS (2026-08-01, élő Playwright-teszttel bizonyítva)

**A kliens-oldali konverziós lánc NEM törött.** Teszt-gclid-del end-to-end:
- redirectek (trailing slash 307, http→https, www→apex) MEGŐRZIK a gclid-et;
- a Google tag first-party módban fut (`beautyflow.pro/i9xo/...` proxy), a
  `_gcl_aw` süti már consent ELŐTT beíródik, menet közbeni elfogadásnál sem vész el;
- phone_click → `googleadservices.../pagead/conversion/AW-17613140258` ping,
  `label=D0Ug...`, `gclaw=<gclid>`, `gcs=G111`, HTTP 200;
- lead_submit → ugyanez `label=lmyX...`, `value=5000 HUF`, `oid=<event_id>`.

**A 0 Ads-konverzió oka:** a 07-20..31 ablakban a valóban elszámolható alkalom
(valós gclid + ad-consent + 07-24 utáni címke) ~2–6 db volt; a 4 cpc phone_click
mind 07-24-i (valószínűleg saját deploy-teszt, gclid nélkül). Egyetlen valódi
anomália maradt: 2 gclid-es, consent-GRANTED form-lead (07-27 `88b9fcd8...`,
07-28 `7ed3f566...`) nem jelent meg az Ads-ben — Google-oldali click-egyeztetésük
NYITOTT (Pipeboard MCP kellett volna, épp le volt csatlakozva).

**A 364 klikk vs 227 GA4 paid session rés:** a GA4 tagek `needed:analytics`
consent-tel futnak → az elutasítók SEMMIT nem küldenek (HU-ban reális 30-40%);
plusz belső linkek utm_source-szennyezése (locations-section, main-header,
lezeres-csomagok/berletek) rossz sessionöket vág. NEM gclid-vesztés.

## Architektúra-tudnivalók (megspórolt nyomozás)

- Realtime gateway `/api/event/conversion-server`: CSAK Meta/TikTok/LinkedIn/MSAds.
  **Google Ads-be realtime SEMMI nem megy szerverről — design szerint.**
- Google Ads szerveroldal = offline hurok: CRM státuszváltás (`kvalifikalt`→
  lead_qualified, `lezart_nyert`→revenue_confirmed) → CRM outbox
  (`crm_tracking_events` tábla) → cron 5 perc → gateway `/api/event/lead-status`
  → Data Manager upload (EC for Leads, hashelt PII, orderId=sha256(lead_id_status)).
- GA4 MP láb NINCS (KV-ban nincs ga4 blokk) — GA4 = tisztán böngésző.
- Consent: a lead-status GDPR-kapunál a gateway consent-receiptje az elsődleges
  (ledger `consent_receipts`, lead_id-vel), a CRM marketing_consent csak fallback.
- Napi smoke: site cron 04:47, `smoke-beautyflow-YYYYMMDD` event_id a ledger
  `events_raw`-ban; ha 24h-n belül nincs, riasztás. 08-01-ig zöld.

## Amit a 07-29-i menet MEGCSINÁLT (kész, ellenőrzött)

1. „Lead qualified (CRM)" action létrehozva: 7701849534.
2. KV gads mapping mindkét hoston: contact_form_submitted/phone_number_clicked/
   revenue_confirmed/lead_qualified.
3. Per-site token ROTÁLVA: új token a `beautyflow-website` TRACKING_GATEWAY_TOKEN
   és a `beautyflow-crm` TRACKING_ADMIN_TOKEN secretben; sha256 a KV
   `crm_token_sha256`-ban. Plaintext sehol máshol.
4. beautyflow-crm secretek: TRACKING_WORKER_URL (https://beautyflow.pro/api/event/lead-status),
   TRACKING_CURRENCY=HUF, TRACKING_COUNTRY_CODE=HU, TRACKING_ENABLED=true.
   **FIGYELEM: ezek SECRET-ek — a clients/beautyflow.toml-ba TILOS [vars]-ként
   duplikálni (deploy név-ütközés).**
5. clients/beautyflow.toml: EVENT_GATEWAY service binding hozzáadva — a
   KÖVETKEZŐ CRM-deploy aktiválja; addig publikus fetch (retryable, nem veszít).
6. contact.ts: marketing_consent már a CookieYes ad-consentből (deploy 3552c4e6).
7. tracking-kit/server/site-inputs/beautyflow.json szinkronban a KV-val.

## NYITOTT TEENDŐK (fontossági sorrendben)

1. **[USER, CRM UI] Lead-státuszok léptetése** — 16 lead áll `uj`-ban, ebből 3
   gclid-es. Ez hozza az ELSŐ valódi Ads-konverziót; 90 napos ablakban
   visszamenőleg is érvényes. Minden infra kész és tesztelt.
2. **[USER, Ads UI] Conversion goals rendbetétele**: a Purchase és Qualified lead
   account-default célok „Misconfigured"-ek (0 primary action van bennük) →
   mindkettőt KIVENNI az account defaultból (Célok → Konverziók → Beállítások).
   Később, ha folyik az offline adat: Lead qualified→Primary, nyers leadek→
   Secondary (licit-döntés, csak adattal!). Plusz UI-ban ellenőrizni, hogy a
   futó BF|Search|HU (24036678930) és EN (24041731430) kampány account-default
   célokat használ-e vagy szelektívet.
3. **[USER, Ads UI] EC per-action bekapcsolás** az 5 webes actionön (fiókszinten
   terms + ECL már enabled=true).
4. **[USER, GA4 admin] booking_click key eventté jelölése** (49 esemény/12 nap,
   domináns jel). NEM átnevezni!
5. **[USER, GA4 admin] 14 custom dimension felvétele** (event scope):
   conversion_type, calculator_name, device, step_id, step_index, total_steps,
   option_value, source, form_name, last_field, scroll_percentage,
   newsletter_salon, route, safe. (session_id/event_id NEM — magas kardinalitás.)
6. **[AGENT, ha Pipeboard MCP él]** a 2 anomália-lead click-szintű egyeztetése;
   `campaign.selective_optimization` lekérdezés; konverzió-számok követése
   (`metrics.all_conversions_by_conversion_date`, LAST_7_DAYS).
7. **[AGENT, kód]** belső utm_source-ok cseréje `?src=`-re (session-attribúció).
8. **[dönteni]** repo GTM-exportok (tracking-kit/gtm/container.json,
   tracking/GTM-W8V3BVGD_fixed.json) elavultak a live v38-hoz képest —
   friss export vagy törlés.

## VALIDÁCIÓ (miből látszik, hogy tényleg megy)

- CRM-kvalifikálás után ~5 perccel:
  `npx wrangler d1 execute event-gateway-ledger --remote --command
  "SELECT * FROM lead_status WHERE site_id='beautyflow'"` →
  `uploaded_to_gads=1`, `gads_error_code=NULL`.
- Másnap GAQL: `SELECT conversion_action.id, metrics.all_conversions_by_conversion_date
  FROM conversion_action WHERE segments.date DURING LAST_3_DAYS` →
  7701849534 soron ≥1.
- Webes actionök: első valódi consentes+gclid-es leadnél; az „Inactive" státusz
  ettől vált át.

## CSAPDÁK (ebbe már beleléptünk, ne újra)

- wrangler d1 `--json` kimenete üres eredménynél is dobhat KeyError-t a naiv
  parserben — ellenőrizd a nyers kimenetet, mielőtt „nincs adat"-ot mondasz.
- Deploy CSAK `--keep-vars`-szal (Sheets-vars wipe incidens volt).
- A GA4 key eventek (generate_lead, phone_click) átnevezése töri az Ads-importot.
- A CRM lokális repója (d:/soborbo-crm) aktív fejlesztés alatt lehet — CRM-deploy
  előtt egyeztess a userrel.
- A Playwright MCP profil sütiket őriz sessionök közt — consent-teszthez előbb
  törölj sütit.
