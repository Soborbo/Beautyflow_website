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
next_id = max(int(tid) for tid in existing_trigger_ids) + 1

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
next_var = max(existing_var_ids) + 1

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
next_tag = max(existing_tag_ids) + 1

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

# Save the result
with open(DST, 'w', encoding='utf-8') as f:
    json.dump(container, f, indent=4, ensure_ascii=False)

print(f"Saved: {DST}")

# Summary
print("\nTrigger arg1 changes:")
for old, new in event_rename.items():
    print(f"  {old} → {new}")
print("\nDLV renames:")
for old, new in dlv_rename.items():
    print(f"  {old} → {new}")
print("\nAdded:")
print(f"  Trigger: CE - booking_click (ID {booking_trigger_id})")
print(f"  Tag: GA4 Event - booking_click")
print(f"  Tag: GAds Conversion - Booking Click")
print(f"  DLVs: {', '.join(new_dlvs)}")
