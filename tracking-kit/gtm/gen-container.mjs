// Generates a valid, importable GTM container export for soborbo-tracking.
// Implements docs/gtm-setup.md + docs/CANONICAL-EVENTS.md (browser side).
import { readFileSync, writeFileSync } from 'node:fs';

const out = process.argv[2];
const configPath = process.argv[3];
if (!out) {
  throw new Error('Usage: node gen-container.mjs <output.json> [site-config.json]');
}

const site = configPath
  ? JSON.parse(readFileSync(configPath, 'utf8'))
  : {};

const ACC = String(site.account_id || '0');
const CNT = String(site.container_id || '0');
const PUBLIC_ID = site.container_public_id || 'GTM-XXXXXXX';
const CONTAINER_NAME = site.container_name || 'Soborbo Tracking';
const VERSION_NAME = site.version_name || 'Soborbo Tracking — canonical (v6)';
const GA4_MEASUREMENT_ID = site.ga4_measurement_id || 'G-XXXXXXXXXX';
const META_PIXEL_ID = site.meta_pixel_id || 'META_PIXEL_ID';
const GOOGLE_ADS_ID = site.google_ads_conversion_id || 'AW-XXXXXXXXX';
const ADS_LABELS = site.google_ads_conversion_labels || {
  contact: 'CONTACT_CONVERSION_LABEL',
  phone: 'PHONE_CONVERSION_LABEL',
  booking: 'BOOKING_CONVERSION_LABEL',
};
const CLARITY_PROJECT_ID = site.clarity_project_id || null;

// ── id counters ──────────────────────────────────────────────────────
let tId = 0, gId = 0, vId = 0;
const nextTag = () => String(++tId);
const nextTrig = () => String(++gId);
const nextVar = () => String(++vId);

// Reserved built-in trigger ids
const ALL_PAGES = '2147479553';

const tags = [], triggers = [], variables = [];

// ── helpers ──────────────────────────────────────────────────────────
const tmpl = (key, value) => ({ type: 'TEMPLATE', key, value });
const bool = (key, value) => ({ type: 'BOOLEAN', key, value });
const consent = (...types) => ({
  consentStatus: 'NEEDED',
  consentType: { type: 'LIST', list: types.map((t) => ({ type: 'TEMPLATE', value: t })) },
});
const builtinConsent = { consentStatus: 'NOT_SET' };

function dlv(name, dataLayerName) {
  const variableId = nextVar();
  variables.push({
    accountId: ACC, containerId: CNT, variableId,
    name: `DLV - ${name}`, type: 'v',
    parameter: [
      { type: 'INTEGER', key: 'dataLayerVersion', value: '2' },
      bool('setDefaultValue', false),
      tmpl('name', dataLayerName),
    ],
    fingerprint: '0',
  });
  return `{{DLV - ${name}}}`;
}

function constVar(name, value) {
  const variableId = nextVar();
  variables.push({
    accountId: ACC, containerId: CNT, variableId,
    name: `Const - ${name}`, type: 'c',
    parameter: [tmpl('value', value)],
    fingerprint: '0',
  });
  return `{{Const - ${name}}}`;
}

function customEventTrigger(eventName) {
  const triggerId = nextTrig();
  triggers.push({
    accountId: ACC, containerId: CNT, triggerId,
    name: `CE - ${eventName}`, type: 'CUSTOM_EVENT',
    customEventFilter: [{
      type: 'EQUALS',
      parameter: [tmpl('arg0', '{{_event}}'), tmpl('arg1', eventName)],
    }],
    fingerprint: '0',
  });
  return triggerId;
}

function tag(name, type, parameter, firingTriggerId, extra = {}) {
  const t = {
    accountId: ACC, containerId: CNT, tagId: nextTag(),
    name, type, parameter,
    fingerprint: '0', firingTriggerId,
    tagFiringOption: 'ONCE_PER_EVENT',
    ...extra,
  };
  tags.push(t);
  return t;
}

// ── Constants (placeholders to replace on import) ────────────────────
const GA4_ID = constVar('GA4 Measurement ID', GA4_MEASUREMENT_ID);
const PIXEL_ID = constVar('Meta Pixel ID', META_PIXEL_ID);
const ADS_ID = constVar('Google Ads Conversion ID', GOOGLE_ADS_ID);
const ADS_CONTACT_LABEL = ADS_LABELS.contact
  ? constVar('Google Ads Contact Label', ADS_LABELS.contact)
  : null;
const ADS_PHONE_LABEL = ADS_LABELS.phone
  ? constVar('Google Ads Phone Label', ADS_LABELS.phone)
  : null;
const ADS_BOOKING_LABEL = ADS_LABELS.booking
  ? constVar('Google Ads Booking Label', ADS_LABELS.booking)
  : null;

// ── Data Layer Variables (PII-free) ──────────────────────────────────
const V_EVENT_ID = dlv('event_id', 'event_id');
const V_VALUE = dlv('value', 'value');
const V_CURRENCY = dlv('currency', 'currency');
const V_SESSION = dlv('session_id', 'session_id');
const V_DEVICE = dlv('device', 'device');
const V_CALC = dlv('calculator_name', 'calculator_name');
const V_STEP_ID = dlv('step_id', 'step_id');
const V_STEP_IDX = dlv('step_index', 'step_index');
const V_FORM_ID = dlv('form_id', 'form_id');
const V_LAST_FIELD = dlv('last_field', 'last_field');
const V_SCROLL = dlv('scroll_percentage', 'scroll_percentage');
const V_SOURCE = dlv('source', 'source');
const V_SERVICE = dlv('service', 'service');
const V_ROUTE = dlv('route', 'route');
const V_SAFE = dlv('safe', 'safe');

// ── Custom JS variable: User-Provided Data side-channel (Task 2) ─────
const V_UPD = (() => {
  const variableId = nextVar();
  variables.push({
    accountId: ACC, containerId: CNT, variableId,
    name: 'CJS - User Provided Data', type: 'jsm',
    parameter: [tmpl('javascript',
      'function(){\n' +
      '  // PII is written by setUserDataForEC() to a hidden side-channel,\n' +
      '  // NOT the dataLayer (GDPR). Shape: email, phone_number, address.{first_name,last_name}.\n' +
      '  try { return window.__sbUserData || {}; } catch (e) { return {}; }\n' +
      '}')],
    fingerprint: '0',
  });
  return '{{CJS - User Provided Data}}';
})();

// ── Triggers (Custom Event) ──────────────────────────────────────────
const T_LEAD = customEventTrigger('lead_submit');
const T_CONTACT = customEventTrigger('contact_submit');
const T_CALLBACK = customEventTrigger('callback_click');
const T_PHONE = customEventTrigger('phone_click');
const T_EMAIL = customEventTrigger('email_click');
const T_WHATSAPP = customEventTrigger('whatsapp_click');
const T_BOOKING = customEventTrigger('booking_click');
const T_CALC_DONE = customEventTrigger('calculator_complete');
const T_CALC_START = customEventTrigger('calculator_start');
const T_CALC_STEP = customEventTrigger('calculator_step');
const T_CALC_OPT = customEventTrigger('calculator_option');
const T_ABANDON = customEventTrigger('form_abandon');
const T_SCROLL = customEventTrigger('scroll_depth');
const T_NEWSLETTER = customEventTrigger('newsletter_signup');
const T_RESULT_VIEW = customEventTrigger('calculator_result_view');

// ── Base tags ────────────────────────────────────────────────────────
// NOTE: the Consent Mode v2 DEFAULT (denied) is intentionally NOT shipped as a GTM
// tag. It is declared inline in <Tracking/> (Tracking.astro), which runs BEFORE
// gtm.js loads — the only correct place for the default (a GTM tag on Consent
// Initialization fires after gtm.js, too late, and duplicating it risks silent
// divergence). Tracking.astro is the single source of truth for the consent default.

tag('Conversion Linker', 'gclidw', [
  bool('enableCrossDomain', false),
], [ALL_PAGES]);

// Modern Google tag. A Google tag sends page_view by default when it loads.
tag('GA4 - Configuration', 'googtag', [
  tmpl('tagId', GA4_ID),
], [ALL_PAGES], { consentSettings: builtinConsent });

// ── GA4 event tag factory ────────────────────────────────────────────
function ga4Event(name, ga4EventName, firing, params) {
  tag(name, 'gaawe', [
    bool('sendEcommerceData', false),
    { type: 'LIST', key: 'eventSettingsTable', list: params.map(([k, v]) => ({
      type: 'MAP', map: [tmpl('parameter', k), tmpl('parameterValue', v)],
    })) },
    tmpl('eventName', ga4EventName),
    tmpl('measurementIdOverride', GA4_ID),
  ], firing, { consentSettings: builtinConsent });
}

// Conversions — canonical GA4 event names
ga4Event('GA4 - contact_form_submit', 'contact_form_submit', [T_LEAD, T_CONTACT], [
  ['value', V_VALUE], ['currency', V_CURRENCY], ['event_id', V_EVENT_ID],
  ['session_id', V_SESSION], ['device', V_DEVICE], ['source', V_SOURCE], ['service', V_SERVICE],
]);
ga4Event('GA4 - callback_conversion', 'callback_conversion', [T_CALLBACK], [
  ['event_id', V_EVENT_ID], ['session_id', V_SESSION], ['device', V_DEVICE],
]);
ga4Event('GA4 - phone_conversion', 'phone_conversion', [T_PHONE], [
  ['event_id', V_EVENT_ID], ['session_id', V_SESSION], ['device', V_DEVICE],
]);
ga4Event('GA4 - email_conversion', 'email_conversion', [T_EMAIL], [
  ['event_id', V_EVENT_ID], ['session_id', V_SESSION],
]);
ga4Event('GA4 - whatsapp_conversion', 'whatsapp_conversion', [T_WHATSAPP], [
  ['event_id', V_EVENT_ID], ['session_id', V_SESSION],
]);
ga4Event('GA4 - booking_click', 'booking_click', [T_BOOKING], [
  ['event_id', V_EVENT_ID], ['source', V_SOURCE], ['session_id', V_SESSION],
]);
ga4Event('GA4 - quote_calculator_conversion', 'quote_calculator_conversion', [T_CALC_DONE], [
  ['value', V_VALUE], ['currency', V_CURRENCY], ['event_id', V_EVENT_ID], ['calculator_name', V_CALC],
]);
// Engagement (regular events, not Key Events)
ga4Event('GA4 - calculator_start', 'calculator_start', [T_CALC_START], [
  ['calculator_name', V_CALC], ['session_id', V_SESSION],
]);
ga4Event('GA4 - calculator_step', 'calculator_step', [T_CALC_STEP], [
  ['step_id', V_STEP_ID], ['step_index', V_STEP_IDX], ['session_id', V_SESSION],
]);
ga4Event('GA4 - calculator_option', 'calculator_option', [T_CALC_OPT], [
  ['step_id', V_STEP_ID], ['session_id', V_SESSION],
]);
ga4Event('GA4 - form_abandon', 'form_abandon', [T_ABANDON], [
  ['form_id', V_FORM_ID], ['last_field', V_LAST_FIELD], ['session_id', V_SESSION],
]);
ga4Event('GA4 - scroll_depth', 'scroll_depth', [T_SCROLL], [
  ['scroll_percentage', V_SCROLL], ['session_id', V_SESSION],
]);
ga4Event('GA4 - newsletter_signup', 'newsletter_signup', [T_NEWSLETTER], [
  ['session_id', V_SESSION],
]);
ga4Event('GA4 - calculator_result_view', 'calculator_result_view', [T_RESULT_VIEW], [
  ['route', V_ROUTE], ['safe', V_SAFE], ['session_id', V_SESSION],
]);

// ── Meta Pixel ───────────────────────────────────────────────────────
tag('Meta Pixel - Base', 'html', [
  tmpl('html',
    '<script>\n' +
    "  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?\n" +
    "  n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;\n" +
    "  n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;\n" +
    "  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,\n" +
    "  document,'script','https://connect.facebook.net/en_US/fbevents.js');\n" +
    "  fbq('init','" + PIXEL_ID + "');\n" +
    "  fbq('track','PageView');\n" +
    '</script>'),
  bool('supportDocumentWrite', false),
], [ALL_PAGES], { consentSettings: consent('ad_storage', 'ad_user_data') });

// Successful calculator forms also emit lead_submit with their server-shared
// event_id. Firing Lead on calculator_complete as well would count one form as
// two Meta leads because calculator_complete has a different event_id.
tag('Meta Pixel - Lead', 'html', [
  tmpl('html',
    '<script>\n' +
    '  var v = ' + V_VALUE + ';\n' +
    "  var cd = (typeof v === 'number' && v > 0) ? { value: v, currency: '" + V_CURRENCY + "' } : {};\n" +
    "  fbq('track','Lead', cd, { eventID: '" + V_EVENT_ID + "' });\n" +
    '</script>'),
  bool('supportDocumentWrite', false),
], [T_LEAD, T_CALLBACK], { consentSettings: consent('ad_storage', 'ad_user_data') });

tag('Meta Pixel - Contact', 'html', [
  tmpl('html',
    '<script>\n' +
    "  fbq('track','Contact', {}, { eventID: '" + V_EVENT_ID + "' });\n" +
    '</script>'),
  bool('supportDocumentWrite', false),
], [T_CONTACT, T_PHONE, T_EMAIL, T_WHATSAPP], { consentSettings: consent('ad_storage', 'ad_user_data') });

tag('Meta Pixel - InitiateCheckout', 'html', [
  tmpl('html',
    '<script>\n' +
    "  fbq('track','InitiateCheckout', {}, { eventID: '" + V_EVENT_ID + "' });\n" +
    '</script>'),
  bool('supportDocumentWrite', false),
], [T_BOOKING], { consentSettings: consent('ad_storage', 'ad_user_data') });

if (CLARITY_PROJECT_ID) {
  tag('Microsoft Clarity - Base', 'html', [
    tmpl('html',
      '<script>\n' +
      `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};` +
      `t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;` +
      `y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);` +
      `})(window,document,"clarity","script","${CLARITY_PROJECT_ID}");\n` +
      '</script>'),
    bool('supportDocumentWrite', false),
  ], [ALL_PAGES], { consentSettings: consent('analytics_storage') });
}

// ── Google Ads Conversions (one action/label per business signal) ───
function googleAdsConversion(name, label, firing) {
  if (!label) return;
  tag(name, 'awct', [
    tmpl('conversionId', ADS_ID),
    tmpl('conversionLabel', label),
    tmpl('orderId', V_EVENT_ID),
    tmpl('conversionValue', V_VALUE),
    tmpl('currencyCode', V_CURRENCY),
    bool('enableConversionLinker', true),
    bool('rdp', false),
    bool('enableEnhancedConversionsCheckbox', true),
    bool('enableUserProvidedData', true),
    tmpl('userProvidedData', V_UPD),
  ], firing, {
    // Google Ads has built-in Consent Mode checks. Additional checks would
    // suppress cookieless/modelled pings and can strand first-page events.
    consentSettings: builtinConsent,
  });
}

googleAdsConversion('Google Ads - Contact / Lead', ADS_CONTACT_LABEL, [T_LEAD, T_CONTACT]);
googleAdsConversion('Google Ads - Phone', ADS_PHONE_LABEL, [T_PHONE]);
googleAdsConversion('Google Ads - Booking', ADS_BOOKING_LABEL, [T_BOOKING]);

// ── Assemble export ──────────────────────────────────────────────────
const container = {
  exportFormatVersion: 2,
  exportTime: '2026-01-01 00:00:00',
  containerVersion: {
    path: `accounts/${ACC}/containers/${CNT}/versions/0`,
    accountId: ACC,
    containerId: CNT,
    containerVersionId: '0',
    name: VERSION_NAME,
    container: {
      path: `accounts/${ACC}/containers/${CNT}`,
      accountId: ACC,
      containerId: CNT,
      name: CONTAINER_NAME,
      publicId: PUBLIC_ID,
      usageContext: ['WEB'],
      fingerprint: '0',
      tagManagerUrl: 'https://tagmanager.google.com/',
    },
    tag: tags,
    trigger: triggers,
    variable: variables,
    builtInVariable: [
      { accountId: ACC, containerId: CNT, type: 'EVENT', name: 'Event' },
      { accountId: ACC, containerId: CNT, type: 'PAGE_URL', name: 'Page URL' },
    ],
    fingerprint: '0',
  },
};

writeFileSync(out, JSON.stringify(container, null, 2) + '\n');
console.log(`Wrote ${out}: ${tags.length} tags, ${triggers.length} triggers, ${variables.length} variables`);
// Validate it round-trips
JSON.parse(JSON.stringify(container));
console.log('JSON valid ✓');
