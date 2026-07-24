# Beautyflow GTM — candidate container (NOT production-ready)

> **Do not import this as-is.** A 2026-07-24 review against the live container
> (`GTM-W8V3BVGD`, workspace 36) and the live GA4/Ads accounts found breaking
> differences that are unresolved — see "Known breaks" below. The live container
> was instead fixed surgically via the GTM API; this artifact is a candidate for
> a future consolidation, not a drop-in replacement.

The candidate container is:

`tracking/GTM-W8V3BVGD_fixed.json`

It is generated deterministically from:

- `tracking-kit/gtm/gen-container.mjs` — canonical tag/trigger logic
- `tracking/beautyflow.gtm.json` — Beautyflow's public IDs and existing conversion labels

Regenerate both the generic template and the Beautyflow artifact:

```sh
npm run generate:gtm
```

## Known breaks (2026-07-24 review)

Verified against the live GA4 property `495936197` and Ads customer `9796138635`:

1. **GA4 key events would zero out.** The property has exactly two key events:
   `generate_lead` (9) and `phone_click` (12). This container renames them to
   `contact_form_submit` / `callback_conversion` / `quote_calculator_conversion`
   and `phone_conversion`. The Ads-imported actions `7610658671` and `7611053431`
   depend on the old names.
2. **Conversion Linker regression.** Live has `enableCrossDomain=true`,
   `linkerDomains = beautyflow.pro, szepsegkastely.hu`, `enableUrlPassthrough=true`.
   This container sets only `enableCrossDomain=false`, dropping cross-domain
   linking and the URL passthrough that carries `gclid` under denied consent.
3. **Clarity downgrade.** Live uses the official template (`cvt_MQDKZ`) wired to
   `{{Analytics Session ID}}` / `{{Analytics Client ID}}`; this container ships a
   raw HTML snippet, losing the Clarity↔GA4 join.
4. **`callback_click` loses its Ads conversion.** Live tag 86 fires it on the
   Callback label; here the Contact/Lead tag fires only on `lead_submit` and
   `contact_submit`.

## What v6 changes

- The modern Google tag uses `G-774BY4X64P` and sends `page_view` on every page.
  Note: GA4 was **not** silent beforehand — the live property received 15 787
  `page_view` hits over 90 days, because `G-774BY4X64P` is a linked destination
  of the `AW-` Google tag. Changing the base tag ID is optional, not a fix.
- Every dataLayer event emitted by the site has a GTM trigger and GA4 event tag:
  `lead_submit`, `contact_submit`, `callback_click`, `phone_click`, `email_click`,
  `whatsapp_click`, `booking_click`, `calculator_complete`, `calculator_start`,
  `calculator_step`, `calculator_option`, `form_abandon`, `scroll_depth`,
  `newsletter_signup`, `calculator_result_view`.
- GA4 emits the canonical names from `tracking-kit/docs/CANONICAL-EVENTS.md`.
- Enhanced Conversions reads `window.__sbUserData` without reshaping it and is
  enabled directly on each Google Ads conversion tag.
- Contact/lead and phone use separate Google Ads conversion labels.
- `booking_click` is no longer falsely reported as the Contact Ads action.
- A completed calculator followed by `lead_submit` produces one Meta Lead, not
  two Leads with different event IDs.
- CookieYes is loaded directly by `Tracking.astro`, after the denied consent
  default and before GTM. The container must not contain a second CookieYes tag.
- Google tags use their built-in Consent Mode checks. Custom Meta/Clarity tags
  retain explicit additional consent checks.

## Import and publish

1. GTM → Admin → Import Container.
2. Select `tracking/GTM-W8V3BVGD_fixed.json`.
3. Choose a new workspace.
4. Use **Overwrite** for container `GTM-W8V3BVGD`. Merge would leave the obsolete
   CookieYes tag and old duplicate conversion tags behind.
5. Review the diff, then Preview.
6. Verify:
   - one CookieYes script;
   - GA4 `page_view` to `G-774BY4X64P`;
   - `contact_form_submit`, `phone_conversion`, `email_conversion`,
     `whatsapp_conversion`, and `booking_click` in GA4 DebugView;
   - Contact and Phone Ads tags use different labels;
   - Meta browser/server events share the same `event_id`.
7. Publish as `Beautyflow Tracking — canonical v6`.

## Google Ads booking action

Verified in Ads customer `9796138635` on 2026-07-24: there is **no** dedicated
Booking conversion action. All four GTM label constants (Contact, Quote,
Callback, Booking) resolve to `s1NzCOWX76kbEKLizM5B`, i.e. the single action
`7335562213 "Thank you page visited"`. Phone uses `D0UgCMKZ-6kbEKLizM5B`
(`7335759042 "Click to call"`). This container therefore tracks booking in GA4
and Meta but deliberately does not send it to the Contact Google Ads action.

Create a separate Website conversion action for booking in Google Ads, then add
its label as `google_ads_conversion_labels.booking` in
`tracking/beautyflow.gtm.json`, regenerate, preview, and publish.

Never reuse the Contact label for booking: that makes bidding and reporting
unable to distinguish a form lead from a Notino hand-off.

## Legacy files

- `tracking/GTM-W8V3BVGD_migrated.json`
- `tracking/gtm-transform.py`

These are retained only as migration history. They are not safe production
inputs and must not be imported. Tests validate the `_fixed.json` artifact.
