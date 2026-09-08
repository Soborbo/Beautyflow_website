# Canonical event map (source of truth for names)

This file is **authoritative** for event names in this skill. (`EVENTS.md` is the
funnel-adaptation guide; in case of a name conflict, THIS file wins.)

## The two channels and the GA4 double-counting (IMPORTANT)

- **Meta** deduplicates by `event_id` (browser Pixel ↔ server CAPI) → it can safely
  fire on both channels.
- **GA4 does NOT deduplicate.** If the browser GTM GA4 tag AND the gateway GA4 MP both
  fire for the same event → it **double-counts**. So for GA4, pick **one channel**:
  - **Default (recommended): GA4 = browser (GTM)**, with the gateway GA4 MP **skipped**.
    How: in the site KV config **omit the `ga4` block** → the gateway does not send
    GA4 MP. This way Meta CAPI + Google Ads run server-side, while GA4 stays browser-side.
  - **Or: GA4 = server MP backstop** (for adblock/JS-blocked users), in which case
    the browser GA4 tag must be handled carefully. Only do this if you deliberately
    accept the overlap. For most lead-gen sites the default is the right choice.

## Canonical conversion table

> **2026-09-08 — eseménynév-cutover.** A `Browser dataLayer` oszlop a KANONIKUS
> neveket hozza (a `tracking-kit/lib/` 15/15 fájlon a kanonikus 6.6.8). A GTM-triggerek
> a párhuzamos futás alatt `matches RegEx ^(legacy|kanonikus)$`-szal MINDKÉT nevet
> elfogadják. A **GA4 oszlopot ekkor ÚJRAMÉRTEM az élő konténerből** (`GTM-W8V3BVGD`):
> hat sorban sodródott — a tagek `generate_lead`-et küldenek, nem azt, amit ez a
> táblázat állított. A GA4-nevek a cutovertől **nem** változnak (mindegyik tag
> bedrótozott `eventName`-et használ), tehát a riport-folytonosság megmarad.

| Conversion | Browser dataLayer (events.ts) | **GA4 event name** (élő GTM-tag) | Gateway `event_name` | Meta | GA4 Key Event? |
|---|---|---|---|---|:--:|
| Quote/lead form | `quote_calculator_submitted` | `generate_lead` | `quote_calculator_submitted` | Lead | ✅ |
| Contact form | `contact_form_submitted` | `generate_lead` | `contact_form_submitted` | Contact | ✅ |
| Callback | `callback_request_submitted` | `generate_lead` | `callback_request_submitted` | Lead | ✅ |
| Phone click | `phone_number_clicked` | `phone_click` | `phone_number_clicked` | Contact | ✅ |
| Email click | `email_address_clicked` | `email_click` | `email_address_clicked` | Contact | ✅ |
| WhatsApp click | `whatsapp_button_clicked` | `whatsapp_click` | `whatsapp_button_clicked` | Contact | ✅ |
| Booking hand-off | `begin_checkout` | `booking_click` | `begin_checkout` | InitiateCheckout | ✅ |

> **A „kalkulátor kész" sor megszűnt, nem elveszett.** A kanonikus névtérben a
> mérföldkő és a quote-konverzió UGYANAZ az esemény (`quote_calculator_submitted`),
> ezért a `trackCalculatorComplete` hívás kikerült a három konverziós folyamatból —
> különben egy folyamatban KÉTSZER tüzelne, az elsőnél `event_id` nélkül (duplikált,
> dedupálhatatlan Meta Lead + `orderId` nélküli Ads-konverzió). Részletek:
> Serverside `docs/EVENT-CUTOVER-BEAUTYFLOW.md` §3.

**The "GA4 event name" column is the key:** in GTM the browser tag emits THIS name
(e.g. the GA4 tag firing on the `quote_calculator_submitted` dataLayer event has GA4
event name `generate_lead`). If you also use the gateway GA4 MP, it sends the SAME name —
so reporting stays unified (but see the double-counting warning above).

## Engagement (NOT a conversion, does NOT go to the gateway, NOT a Key Event)

| dataLayer event | Purpose | GA4 |
|---|---|---|
| `quote_calculator_opened` / `quote_calculator_step_completed` / `quote_calculator_option_selected` | funnel | regular event |
| `form_abandoned` | form abandonment | regular event |
| `scroll_depth` (25/50/75/100) | scroll | regular event |
| `newsletter_signup` | newsletter success | regular event |
| `calculator_result_view` | result-page view | regular event |
| `cta_click` | internal CTA click (`data-track="cta_click"`) | regular event — **no GTM trigger by design** |

> **`cta_click` deliberately has no GTM trigger**, and that is the point of the event.
> The booking hand-off (`begin_checkout`) IS a conversion, so it only belongs on a real
> hand-off (a click that leaves the site for Notino); in Ads the GA4-imported
> `booking_click` is a PRIMARY
> goal. Putting an internal CTA — a link that merely navigates to
> `/ingyenes-konzultacio` — on that event would book a conversion before the visitor
> submits anything, on top of the lead the form itself reports. `cta_click` is the
> engagement-only alternative: browser dataLayer, analytics consent, no gateway leg,
> **not** a GA4 key event and **not** imported into Ads.
>
> The trigger check knows this: the event is declared in
> [`../gtm/no-trigger-events.json`](../gtm/no-trigger-events.json), and
> `npm run check:events` fails if a trigger ever appears for it (a stale exemption)
> or if the declaration outlives the code that emits it.

## GA4 admin tasks (once per property)

1. **Key Events (Admin → Events → Mark as key event)** — a GA4-nevek, az élő
   konténerből mérve: `generate_lead`, `phone_click`, `email_click`,
   `whatsapp_click`, `booking_click`.
2. **Custom dimensions (Admin → Custom definitions → event-scoped):**
   `event_id`, `session_id`, `source`, `service`, `device`,
   `calculator_name`, `step_id`. (The campaign parameters — source/medium/campaign —
   flow natively with the `campaign_details` event, no custom dimension needed.)
3. **Measurement check:** GA4 DebugView + Meta Test Events + GTM Preview.

## Adding a new conversion
1. In `events.ts`, push to the browser dataLayer event (without PII).
2. GTM: Custom Event trigger + GA4 tag (with the canonical GA4 event name) + optionally
   a Meta Pixel tag (`eventID` = DLV event_id) + Google Ads tag.
3. Gateway: extend `ALLOWED_EVENT_NAMES` + `EVENT_NAME_MAP` (Meta) in the Serverside repo,
   and add the Google Ads action ID in the site KV `conversion_actions`.
4. GA4: mark as Key Event + register custom dimension as needed.
