# GTM container update — `GTM-W8V3BVGD`

A meglevő GTM container a régi `@leadgen/conversion-tracking` package event-/param-neveire épült. Az új `tracking-kit` más neveket használ. Ez a doksi + a `gtm-transform.py` script hozza össze a kettőt.

## Mit csinál a script

| Régi név | Új név | Hol |
|---|---|---|
| `contact_form` | `contact_form_submit` | Trigger arg1 |
| `form_abandon` | `form_abandonment` | Trigger arg1 |
| `calculator_step` | `form_step_complete` | Trigger arg1 |
| `phone_click` | `phone_conversion` | Trigger arg1 |
| `calculator_start` | `form_start` | Trigger arg1 |
| `lead_id` (DLV) | `event_id` | Variable + minden hivatkozás (`orderId`, GA4 params) |
| `step` (DLV) | `step_number` | Variable + hivatkozások |
| `form_id` (DLV) | `form_name` | Variable + hivatkozások |
| `currency` default `GBP` | `HUF` | DLV default érték |

## Mit ad hozzá

- **Trigger:** `CE - booking_click` — Notino "Időpontfoglalás" gomb kattintásra
- **Tag:** `GA4 Event - booking_click`
- **Tag:** `GAds Conversion - Booking Click` (a meglévő Contact label-t használja — ha külön Google Ads konverzió kell rá, módosítsd az új konverzió ID-t hozzá az új label-lal)
- **DLV-k:** `event_id`, `source`, `service`

## Mit hagy érintetlenül

Az alábbi triggerek a régi tracking-ből megmaradnak, **DE soha nem fognak tüzelni**, mert a tracking-kit nem ezeket az event-eket lövi:
- `calculator_option` (a kit nem trackeli az egyes opció kiválasztásokat)
- `callback_request` (nincs külön callback formunk)
- `quote_request` (nincs külön quote formunk)

Ha akarod, ezeket törölheted a GTM UI-ban kézzel — nem ártanak, de rendetlenséget okoznak.

## Használat

1. **Export a GTM container-t:**
   GTM dashboard → Admin → Container → Export Container → Choose a workspace + version → Export. Kapsz egy `GTM-W8V3BVGD_workspace<N>.json` fájlt.

2. **Futtasd a transform-ot:**
   ```bash
   python tracking/gtm-transform.py path/to/GTM-W8V3BVGD_workspace.json path/to/output.json
   ```

3. **Import:**
   GTM dashboard → Admin → Container → Import Container → válaszd ki az `output.json`-t → "Existing" workspace VAGY hozz létre egy újat → "Merge" (vagy "Overwrite" ha biztos vagy) → Confirm.

4. **Submit & Publish** egy új container version-nel ("Migrate to tracking-kit" üzenettel).

## A scripten kívül elvégzendő (kézi) lépések

A script csak a GTM container JSON-t kezeli. Még ezek kellenek GTM-en kívül:

1. **PII side-channel** Google Ads Enhanced Conversions-höz. A tracking-kit a PII-t (email, telefon, név) a `#__bf_user_data__` hidden div data-attribute-jaira teszi. Egy Custom JS Variable kell ami ezt olvassa, és a Google Tag → Shared event settings → `user_data` mezőjébe kerül. Részletek a [tracking-kit SETUP.md](https://github.com/Soborbo/claudeskills/blob/main/tracking-kit/SETUP.md) "GTM" szekciójában.

2. **Meta Pixel tag.** A jelen container-ben **nincs Meta Pixel base tag**. Ha kell a Meta tracking (Pixel ID: `915395591548632`):
   - Új Custom HTML tag, Meta standard pixel snippet a Pixel ID-vel
   - Firing: Consent Initialization - All Pages, `ad_storage = granted` required
   - Új trigger-eken (`contact_form_submit`, `booking_click`, `phone_conversion`, stb.) lőj `fbq('track', 'Contact', {eventID: '{{DLV - event_id}}'})` Custom HTML tageket — az `eventID` kritikus a server CAPI dedup-hoz.

3. **GA4 event név mapping (opcionális):** az új trigger-ek után az `eventName` mezőben a tagek még a régi név alatt küldik az event-et GA4-be (pl. a `form_start` trigger-re csatolt tag `calculator_start` néven küldi GA4-be). Ez a riportokhoz jó — nem szakad meg az adatfolyam. Ha akarod, később át lehet nevezni egységesen.

## Ha bárhol kérdés van

A tracking-kit által pushed teljes event lista: [tracking-kit EVENTS.md](https://github.com/Soborbo/claudeskills/blob/main/tracking-kit/EVENTS.md).
