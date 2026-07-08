# Tracking verification — does it work in reality? (2026-07-08)

**Scope:** live site (beautyflow.pro), live GTM container `GTM-W8V3BVGD` (v29),
GA4 property `495936197` (G-774BY4X64P), Google Ads `979-613-8635` (AW-17613140258),
event-gateway worker, and the `Soborbo/claudeskills → soborbo-tracking` skill
that claims to describe this setup.

## TL;DR

- **The pipeline infrastructure works** (GTM loads, CookieYes + Consent Mode v2,
  GA4 receives hits, gateway worker deployed). Proof: `page_view`/sessions flow
  daily; `booking_click` (27) and `calculator_option` still land in GA4 in July.
- **All conversion-critical browser events are DEAD since the 2026-06-28 deploy**
  of the v5 tracking migration (`a6ed9b1`, 2026-06-27): the new tracking-kit
  pushes **different dataLayer event names than the live GTM triggers listen to**.
  GA4 last saw: `generate_lead` 06-21, `phone_click` 06-14, `calculator_step`
  06-21, `form_abandonment` 06-22 — all **0 in July** while sessions continue.
- **Google Ads: the account CAN be restarted** (status ENABLED, billing APPROVED,
  GA4 link live, auto-tagging on; both campaigns merely PAUSED) — **but do NOT
  restart until the GTM event-name mismatch is fixed**, otherwise Smart Bidding
  runs blind again (February 2026: 3,083 clicks, ~£579 spend, **0 recorded
  conversions**).
- The **skill does not describe reality**: it uses a third, newer event
  vocabulary (canonical `quote_calculator_submitted`, …) that matches neither
  the deployed kit (`lead_submit`, …) nor the live GTM (`contact_form_submit`, …).

## The three-way event-name drift (root cause)

| Deployed kit pushes (dataLayer) | Live GTM v29 trigger expects | Skill canonical (claudeskills) | Result in GA4/Ads |
|---|---|---|---|
| `lead_submit` | `contact_form_submit` / `quote_request` / `callback_request` | `contact_form_submitted` / `quote_calculator_submitted` / `callback_request_submitted` | ❌ generate_lead + 3 AWCT + Meta Lead never fire |
| `contact_submit` | — (no trigger) | `contact_form_submitted` | ❌ lost |
| `phone_click` | `phone_conversion` | `phone_number_clicked` | ❌ GA4 phone_click + AWCT Phone dead |
| `callback_click` | `callback_request` | `callback_request_submitted` | ❌ lost |
| `email_click` / `whatsapp_click` | — (no trigger/tag at all) | `email_address_clicked` / `whatsapp_button_clicked` | ❌ lost (never wired in GTM) |
| `calculator_start` / `calculator_step` | `form_start` / `form_step_complete` | `quote_calculator_opened` / `…_step_completed` | ❌ funnel dead |
| `form_abandon` | `form_abandonment` | `form_abandoned` | ❌ dead (v29's rename fixed the GA4 *output* name, then the kit changed the *input* name) |
| `calculator_option` | `calculator_option` | `quote_calculator_option_selected` | ✅ works |
| `booking_click` (site component) | `booking_click` | — | ✅ works |

Notes:
- The `eventName: 'contact_form_submit'` argument passed to `trackLeadSubmit()`
  goes **only to the gateway** (`dispatchToGateway`); the dataLayer push is
  hardcoded `lead_submit` (`tracking-kit/lib/events.ts` → `pushLeadConversion`).
  So the **server channel (Meta CAPI) likely still gets leads**, while browser
  GA4 + Google Ads get nothing.
- The GTM container templates don't match the live container either:
  `tracking-kit/gtm/container.json` (kit names, no booking_click/CookieYes/Clarity)
  and the skill's `gtm/container.json` (canonical names). The repo artifact
  `tracking/GTM-W8V3BVGD_migrated.json` lags live v29 (20 vs 22 tags; missing
  CookieYes CMP + MS Clarity tags, stale trigger IDs).

## What was verified working

| Check | Result |
|---|---|
| GTM v29 live, 22 tags, 9 triggers | ✅ (published 2026-06-16, "Unify abandonment event name") |
| CookieYes CMP tag (Consent Init) + Consent Mode v2 defaults (`wait_for_update: 2000`) | ✅ |
| GA4 G-774BY4X64P receiving daily traffic (5–40 sessions/day) | ✅ |
| GA4 key events configured: `generate_lead`, `phone_click` (booking_click is NOT a key event — open item from LEAD-FLOW-INCIDENT.md still open) | ⚠️ |
| Meta Pixel base `915395591548632` (GTM), Lead/Contact/InitiateCheckout event tags | ✅ (browser side; blocked for events with mismatched names) |
| `event-gateway` worker deployed (2026-07-02) + `GATEWAY` service binding + static `/api/event/*` routes | ✅ |
| GA4 ↔ Google Ads link to 979-613-8635 (created 2025-10-31) | ✅ |
| MS Clarity tag (project x2xfksq6xq) | ✅ |

## Google Ads account state (can it be restarted?)

- Account **ENABLED**, billing setup **APPROVED**, auto-tagging ON,
  conversion tracking id `17613140258` = the AW id used in GTM. Currency **GBP**
  (site sends HUF values — Ads converts; budgets are £27/£28 per day).
- Campaigns: `Szőrtelenítés | Search` and `Lézeres szőrtelenítés | Perfmax`,
  both **PAUSED**. Last activity 2026-02: 3,083 clicks, 0 conversions.
- Conversion actions (ENABLED): phone AD_CALL + Click-to-call (`D0UgCMKZ…` label ✅
  primary, counted); **"Thank you page visited"** (`s1NzCO…` label) —
  `include_in_conversions_metric = false` → even when the tag fires it does
  **not** count in the Conversions column; `Revenue confirmed (server)`
  (UPLOAD_CLICKS, secondary).
- **Label collision:** GTM's Contact-, Quote-, Callback- AND Booking-Click AWCT
  tags all use the same `s1NzCO…` label. Once fixed, Notino `booking_click`
  (~119/30d) would flood the same conversion action that real leads (~7/30d)
  use → Smart Bidding would optimize for cheap outbound clicks.

**Verdict: yes, it can be restarted — after the fixes below. Restarting today
would repeat February (spend with zero conversion signal).**

## Fix plan (GTM-first, no code deploy needed)

1. In GTM, retarget the custom-event triggers to the names the deployed kit
   actually pushes:
   - `CE - contact_form_submit`: event `contact_form_submit` → **`lead_submit`**
   - `CE - phone_conversion`: → **`phone_click`**
   - `CE - callback_request`: → **`callback_click`**
   - `CE - quote_request`: **pause/delete its AWCT + GA4 tag** (every lead now
     arrives as `lead_submit`; keeping both Contact and Quote tags on the same
     event would double-count)
   - `CE - form_start` → **`calculator_start`**, `CE - form_step_complete` →
     **`calculator_step`**, `CE - form_abandonment` → **`form_abandon`**
2. Give Booking Click its **own** Ads conversion action (secondary) — or drop
   the AWCT booking tag and keep it GA4-only.
3. In Google Ads set **"Thank you page visited" to Primary / counted** so lead
   forms actually appear in the Conversions column Smart Bidding uses.
4. (Optional) Add GTM triggers/tags for `email_click`, `whatsapp_click`,
   `calculator_complete` — currently never tracked in the browser.
5. Verify with GTM Preview + GA4 Realtime (submit a test lead, click a tel:
   link), confirm the AWCT tags fire, **then** re-enable the campaigns.
6. Mark `booking_click` as a GA4 key event (still-open item from
   LEAD-FLOW-INCIDENT.md).

Longer term, pick ONE vocabulary. The skill's canonical names are the declared
end-state; migrating means updating site kit + GTM together (the skill's
`gtm/container.json` is generated for canonical names). Until then the skill's
docs must not be treated as a description of this site's live wiring.
