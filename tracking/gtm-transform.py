"""
GTM-W8V3BVGD container transformer.
Maps legacy event/param names → tracking-kit event/param names.
"""
import json
import sys

SRC = sys.argv[1]
DST = sys.argv[2]

with open(SRC, encoding='utf-8') as f:
    container = json.load(f)

# 1) Trigger arg1 renames (legacy event name → tracking-kit event name)
event_rename = {
    'contact_form': 'contact_form_submit',
    'form_abandon': 'form_abandonment',
    'calculator_step': 'form_step_complete',
    'phone_click': 'phone_conversion',
    'calculator_start': 'form_start',
    # Untouched: calculator_option, callback_request, quote_request
    # (the new kit doesn't fire those — triggers stay dormant but harmless)
}

# 2) Trigger display name renames
trigger_name_rename = {
    'CE - contact_form': 'CE - contact_form_submit',
    'CE - form_abandon': 'CE - form_abandonment',
    'CE - calculator_step': 'CE - form_step_complete',
    'CE - phone_click': 'CE - phone_conversion',
    'CE - calculator_start': 'CE - form_start',
}

# 3) DataLayer Variable renames (kit pushes different param names)
dlv_rename = {
    'lead_id': 'event_id',
    'step': 'step_number',
    'form_id': 'form_name',
}

# Apply trigger updates
for trig in container['containerVersion'].get('trigger', []):
    new_name = trigger_name_rename.get(trig.get('name'))
    if new_name:
        trig['name'] = new_name
    for fil in trig.get('customEventFilter', []):
        for p in fil.get('parameter', []):
            if p.get('key') == 'arg1':
                old_val = p.get('value')
                if old_val in event_rename:
                    p['value'] = event_rename[old_val]

# Apply DLV updates (name + name parameter)
for v in container['containerVersion'].get('variable', []):
    if v.get('type') != 'v':
        continue
    # The display name is "DLV - <param>"
    name_param = None
    for p in v.get('parameter', []):
        if p.get('key') == 'name':
            name_param = p
            break
    if not name_param:
        continue
    old_field = name_param.get('value')
    if old_field in dlv_rename:
        new_field = dlv_rename[old_field]
        name_param['value'] = new_field
        v['name'] = f'DLV - {new_field}'

# Currency default: GBP → HUF
for v in container['containerVersion'].get('variable', []):
    if v.get('name') == 'DLV - currency':
        for p in v.get('parameter', []):
            if p.get('key') == 'defaultValue':
                p['value'] = 'HUF'

# Tag parameter value substitutions (DLV references)
tag_template_subst = {
    '{{DLV - lead_id}}': '{{DLV - event_id}}',
    '{{DLV - step}}': '{{DLV - step_number}}',
    '{{DLV - form_id}}': '{{DLV - form_name}}',
}

def walk_replace(obj):
    """Recursively replace template tokens inside value strings."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(v, str):
                for old, new in tag_template_subst.items():
                    if old in v:
                        obj[k] = v.replace(old, new)
                        v = obj[k]
            else:
                walk_replace(v)
    elif isinstance(obj, list):
        for item in obj:
            walk_replace(item)

# Replace DLV references in all tags
for tag in container['containerVersion'].get('tag', []):
    walk_replace(tag)
    # Also replace parameter values that are TEMPLATE type
    for p in tag.get('parameter', []):
        if p.get('type') == 'TEMPLATE' and isinstance(p.get('value'), str):
            for old, new in tag_template_subst.items():
                if old in p['value']:
                    p['value'] = p['value'].replace(old, new)

# 4) Replace event-param keys inside GA4 tag eventSettingsTable that reference renamed DLV fields
# In the eventSettingsTable, each row has {parameter: "lead_id", parameterValue: "{{DLV - lead_id}}"}
# We rename the "parameter" key too so GA4 receives event_id (not lead_id)
for tag in container['containerVersion'].get('tag', []):
    if tag.get('type') != 'gaawe':  # GA4 Event tag type
        continue
    for p in tag.get('parameter', []):
        if p.get('key') == 'eventSettingsTable':
            for row in p.get('list', []):
                cells = row.get('map', [])
                # find "parameter" cell
                param_cell = None
                value_cell = None
                for cell in cells:
                    if cell.get('key') == 'parameter':
                        param_cell = cell
                    if cell.get('key') == 'parameterValue':
                        value_cell = cell
                if param_cell and param_cell.get('value') in dlv_rename:
                    old = param_cell['value']
                    param_cell['value'] = dlv_rename[old]
                    # value cell was already updated by walk_replace above

# 5) Add new trigger: CE - booking_click
existing_trigger_ids = {t['triggerId'] for t in container['containerVersion'].get('trigger', [])}
next_id = max((int(tid) for tid in existing_trigger_ids), default=0) + 1

booking_trigger_id = str(next_id)
container['containerVersion'].setdefault('trigger', []).append({
    'accountId': '6252358257',
    'containerId': '196968106',
    'triggerId': booking_trigger_id,
    'name': 'CE - booking_click',
    'type': 'CUSTOM_EVENT',
    'customEventFilter': [
        {
            'type': 'EQUALS',
            'parameter': [
                {'type': 'TEMPLATE', 'key': 'arg0', 'value': '{{_event}}'},
                {'type': 'TEMPLATE', 'key': 'arg1', 'value': 'booking_click'},
            ],
        },
    ],
    'fingerprint': '1778666385795',
})
next_id += 1

# 6) Add a DLV for 'source' (used by booking_click / phone_conversion / source param) + service + form_name
existing_var_ids = {int(v['variableId']) for v in container['containerVersion'].get('variable', [])}
next_var = max(existing_var_ids, default=0) + 1

new_dlvs = ['source', 'service', 'event_id']
existing_dlv_fields = set()
for v in container['containerVersion'].get('variable', []):
    if v.get('type') == 'v':
        for p in v.get('parameter', []):
            if p.get('key') == 'name':
                existing_dlv_fields.add(p['value'])

for field in new_dlvs:
    if field in existing_dlv_fields:
        continue
    container['containerVersion']['variable'].append({
        'accountId': '6252358257',
        'containerId': '196968106',
        'variableId': str(next_var),
        'name': f'DLV - {field}',
        'type': 'v',
        'parameter': [
            {'type': 'INTEGER', 'key': 'dataLayerVersion', 'value': '2'},
            {'type': 'BOOLEAN', 'key': 'setDefaultValue', 'value': 'false'},
            {'type': 'TEMPLATE', 'key': 'name', 'value': field},
        ],
        'fingerprint': '1778666385790',
        'formatValue': {},
    })
    next_var += 1

# 7) Add GA4 Event tag - booking_click
existing_tag_ids = {int(t['tagId']) for t in container['containerVersion'].get('tag', [])}
next_tag = max(existing_tag_ids, default=0) + 1

container['containerVersion'].setdefault('tag', []).append({
    'accountId': '6252358257',
    'containerId': '196968106',
    'tagId': str(next_tag),
    'name': 'GA4 Event - booking_click',
    'type': 'gaawe',
    'parameter': [
        {'type': 'BOOLEAN', 'key': 'sendEcommerceData', 'value': 'false'},
        {
            'type': 'LIST',
            'key': 'eventSettingsTable',
            'list': [
                {'type': 'MAP', 'map': [
                    {'type': 'TEMPLATE', 'key': 'parameter', 'value': 'event_id'},
                    {'type': 'TEMPLATE', 'key': 'parameterValue', 'value': '{{DLV - event_id}}'},
                ]},
                {'type': 'MAP', 'map': [
                    {'type': 'TEMPLATE', 'key': 'parameter', 'value': 'source'},
                    {'type': 'TEMPLATE', 'key': 'parameterValue', 'value': '{{DLV - source}}'},
                ]},
                {'type': 'MAP', 'map': [
                    {'type': 'TEMPLATE', 'key': 'parameter', 'value': 'session_id'},
                    {'type': 'TEMPLATE', 'key': 'parameterValue', 'value': '{{DLV - session_id}}'},
                ]},
            ],
        },
        {'type': 'TEMPLATE', 'key': 'eventName', 'value': 'booking_click'},
        {'type': 'TEMPLATE', 'key': 'measurementIdOverride', 'value': '{{CONST - GA4 Measurement ID}}'},
    ],
    'fingerprint': '1778666385791',
    'firingTriggerId': [booking_trigger_id],
    'tagFiringOption': 'ONCE_PER_EVENT',
    'monitoringMetadata': {'type': 'MAP'},
    'consentSettings': {
        'consentStatus': 'NEEDED',
        'consentType': {
            'type': 'LIST',
            'list': [{'type': 'TEMPLATE', 'value': 'analytics_storage'}],
        },
    },
})
next_tag += 1

# 8) GAds Conversion tag - Booking Click (uses Contact Label by default — user can rename)
container['containerVersion']['tag'].append({
    'accountId': '6252358257',
    'containerId': '196968106',
    'tagId': str(next_tag),
    'name': 'GAds Conversion - Booking Click',
    'type': 'awct',
    'parameter': [
        {'type': 'BOOLEAN', 'key': 'enableNewCustomerReporting', 'value': 'false'},
        {'type': 'BOOLEAN', 'key': 'enableConversionLinker', 'value': 'true'},
        {'type': 'TEMPLATE', 'key': 'orderId', 'value': '{{DLV - event_id}}'},
        {'type': 'BOOLEAN', 'key': 'enableProductReporting', 'value': 'false'},
        {'type': 'TEMPLATE', 'key': 'conversionValue', 'value': '{{DLV - value}}'},
        {'type': 'TEMPLATE', 'key': 'conversionCookiePrefix', 'value': '_gcl'},
        {'type': 'BOOLEAN', 'key': 'enableShippingData', 'value': 'false'},
        {'type': 'TEMPLATE', 'key': 'conversionId', 'value': '{{CONST - GAds Conversion ID}}'},
        {'type': 'TEMPLATE', 'key': 'currencyCode', 'value': '{{DLV - currency}}'},
        # Reuses the Contact label — user can change to a dedicated Booking label if they add one in Google Ads
        {'type': 'TEMPLATE', 'key': 'conversionLabel', 'value': '{{CONST - GAds Contact Label}}'},
        {'type': 'BOOLEAN', 'key': 'rdp', 'value': 'false'},
    ],
    'fingerprint': '1778666385792',
    'firingTriggerId': [booking_trigger_id],
    'tagFiringOption': 'ONCE_PER_EVENT',
    'monitoringMetadata': {'type': 'MAP'},
    'consentSettings': {
        'consentStatus': 'NEEDED',
        'consentType': {
            'type': 'LIST',
            'list': [{'type': 'TEMPLATE', 'value': 'ad_storage'}],
        },
    },
})

next_tag += 1

# 9) Custom JavaScript variable — reads PII from the tracking-kit hidden div
#    The kit writes email/phone/name to `#__bf_user_data__` data-attributes.
#    Google Tag (below) consumes this in eventSettingsTable for Enhanced Conversions.
user_data_js = (
    "function() {\n"
    "  var el = document.getElementById('__bf_user_data__');\n"
    "  if (!el) return undefined;\n"
    "  var out = {};\n"
    "  if (el.dataset.email) out.email = el.dataset.email;\n"
    "  if (el.dataset.phone) out.phone_number = el.dataset.phone;\n"
    "  var addr = {};\n"
    "  if (el.dataset.firstName) addr.first_name = el.dataset.firstName;\n"
    "  if (el.dataset.lastName)  addr.last_name  = el.dataset.lastName;\n"
    "  if (el.dataset.city)      addr.city       = el.dataset.city;\n"
    "  if (el.dataset.postalCode) addr.postal_code = el.dataset.postalCode;\n"
    "  if (el.dataset.country)   addr.country    = el.dataset.country;\n"
    "  if (Object.keys(addr).length) out.address = addr;\n"
    "  return out;\n"
    "}"
)

existing_var_names = {v.get('name') for v in container['containerVersion'].get('variable', [])}
if 'JS - User Data Object' not in existing_var_names:
    container['containerVersion']['variable'].append({
        'accountId': '6252358257',
        'containerId': '196968106',
        'variableId': str(next_var),
        'name': 'JS - User Data Object',
        'type': 'jsm',
        'parameter': [
            {'type': 'TEMPLATE', 'key': 'javascript', 'value': user_data_js},
        ],
        'fingerprint': '1778666385793',
        'formatValue': {},
    })
    next_var += 1

# 10) Hook user_data into the Google Tag's shared event settings.
#     This is what makes Enhanced Conversions automatic for every Google Ads
#     conversion (no per-conversion-tag wiring needed).
for tag in container['containerVersion'].get('tag', []):
    if tag.get('type') != 'googtag':
        continue
    # Check if eventSettingsTable already exists; create or update
    event_settings = None
    for p in tag.get('parameter', []):
        if p.get('key') == 'eventSettingsTable':
            event_settings = p
            break
    user_data_row = {
        'type': 'MAP',
        'map': [
            {'type': 'TEMPLATE', 'key': 'parameter', 'value': 'user_data'},
            {'type': 'TEMPLATE', 'key': 'parameterValue', 'value': '{{JS - User Data Object}}'},
        ],
    }
    if event_settings:
        # Avoid duplicating if already present
        already = False
        for row in event_settings.get('list', []):
            for cell in row.get('map', []):
                if cell.get('key') == 'parameterValue' and cell.get('value') == '{{JS - User Data Object}}':
                    already = True
                    break
            if already:
                break
        if not already:
            event_settings.setdefault('list', []).append(user_data_row)
    else:
        tag.setdefault('parameter', []).append({
            'type': 'LIST',
            'key': 'eventSettingsTable',
            'list': [user_data_row],
        })

# 11) Meta Pixel base tag (Custom HTML) — fires on every page, requires ad_storage consent
META_PIXEL_ID = '915395591548632'

meta_base_html = (
    "<script>\n"
    "!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?\n"
    "n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;\n"
    "n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;\n"
    "t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,\n"
    "document,'script','https://connect.facebook.net/en_US/fbevents.js');\n"
    f"fbq('init', '{META_PIXEL_ID}');\n"
    "fbq('track', 'PageView');\n"
    "</script>\n"
    f"<noscript><img height=\"1\" width=\"1\" style=\"display:none\" src=\"https://www.facebook.com/tr?id={META_PIXEL_ID}&ev=PageView&noscript=1\" /></noscript>"
)

existing_tag_names = {t.get('name') for t in container['containerVersion'].get('tag', [])}

ALL_PAGES_TRIGGER = '2147479553'

def add_html_tag(name, html, trigger_ids, requires_ads_consent=True):
    global next_tag
    if name in existing_tag_names:
        return
    consent = {'consentStatus': 'NOT_SET'}
    if requires_ads_consent:
        consent = {
            'consentStatus': 'NEEDED',
            'consentType': {
                'type': 'LIST',
                'list': [{'type': 'TEMPLATE', 'value': 'ad_storage'}],
            },
        }
    container['containerVersion']['tag'].append({
        'accountId': '6252358257',
        'containerId': '196968106',
        'tagId': str(next_tag),
        'name': name,
        'type': 'html',
        'parameter': [
            {'type': 'TEMPLATE', 'key': 'html', 'value': html},
            {'type': 'BOOLEAN', 'key': 'supportDocumentWrite', 'value': 'false'},
        ],
        'fingerprint': '1778666385794',
        'firingTriggerId': trigger_ids,
        'tagFiringOption': 'ONCE_PER_EVENT',
        'monitoringMetadata': {'type': 'MAP'},
        'consentSettings': consent,
    })
    next_tag += 1

add_html_tag('Meta Pixel - Base', meta_base_html, [ALL_PAGES_TRIGGER])

# Resolve the renamed trigger IDs (they kept their numeric IDs after rename)
trigger_by_event = {}
for trig in container['containerVersion'].get('trigger', []):
    for fil in trig.get('customEventFilter', []):
        for p in fil.get('parameter', []):
            if p.get('key') == 'arg1':
                trigger_by_event[p['value']] = trig['triggerId']

# Meta Contact event — fires on contact_form_submit + phone_conversion + email/whatsapp
contact_triggers = [
    trigger_by_event[name]
    for name in ('contact_form_submit', 'phone_conversion')
    if name in trigger_by_event
]
if contact_triggers:
    add_html_tag(
        'Meta Pixel - Contact',
        (
            "<script>\n"
            "  if (window.fbq) {\n"
            "    fbq('track', 'Contact',\n"
            "      { value: {{DLV - value}}, currency: '{{DLV - currency}}' },\n"
            "      { eventID: '{{DLV - event_id}}' }\n"
            "    );\n"
            "  }\n"
            "</script>"
        ),
        contact_triggers,
    )

# Meta Lead event — fires on contact_form_submit (gives Meta both Lead + Contact for the form)
if 'contact_form_submit' in trigger_by_event:
    add_html_tag(
        'Meta Pixel - Lead',
        (
            "<script>\n"
            "  if (window.fbq) {\n"
            "    fbq('track', 'Lead',\n"
            "      { value: {{DLV - value}}, currency: '{{DLV - currency}}' },\n"
            "      { eventID: '{{DLV - event_id}}' }\n"
            "    );\n"
            "  }\n"
            "</script>"
        ),
        [trigger_by_event['contact_form_submit']],
    )

# Meta InitiateCheckout event — fires on booking_click (Notino redirect)
if 'booking_click' in trigger_by_event:
    add_html_tag(
        'Meta Pixel - InitiateCheckout',
        (
            "<script>\n"
            "  if (window.fbq) {\n"
            "    fbq('track', 'InitiateCheckout',\n"
            "      { value: {{DLV - value}}, currency: '{{DLV - currency}}' },\n"
            "      { eventID: '{{DLV - event_id}}' }\n"
            "    );\n"
            "  }\n"
            "</script>"
        ),
        [trigger_by_event['booking_click']],
    )

# Save the result
with open(DST, 'w', encoding='utf-8') as f:
    json.dump(container, f, indent=4, ensure_ascii=False)

print(f"Saved: {DST}")

# Summary
print("\nTrigger arg1 changes:")
for old, new in event_rename.items():
    print(f"  {old} -> {new}")
print("\nDLV renames:")
for old, new in dlv_rename.items():
    print(f"  {old} -> {new}")
print("\nAdded:")
print(f"  Trigger: CE - booking_click (ID {booking_trigger_id})")
print(f"  Tag: GA4 Event - booking_click")
print(f"  Tag: GAds Conversion - Booking Click")
print(f"  DLVs: {', '.join(new_dlvs)}")
