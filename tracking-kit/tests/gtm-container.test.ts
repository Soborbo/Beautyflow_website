import { describe, it, expect } from 'vitest';
// Importing the JSON proves it parses (resolveJsonModule) and runs in jsdom
// without node:fs. It must also cover the canonical browser side.
import container from '../gtm/container.json';
import beautyflowContainer from '../../tracking/GTM-W8V3BVGD_fixed.json';

describe('gtm/container.json — importable export', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = container as any;
  const cv = c.containerVersion;

  it('has the GTM export schema shape', () => {
    expect(c.exportFormatVersion).toBe(2);
    expect(cv.container.usageContext).toContain('WEB');
    expect(Array.isArray(cv.tag)).toBe(true);
    expect(Array.isArray(cv.trigger)).toBe(true);
    expect(Array.isArray(cv.variable)).toBe(true);
  });

  it('emits every canonical GA4 event name (CANONICAL-EVENTS.md)', () => {
    const ga4Names = cv.tag
      .filter((t: { type: string }) => t.type === 'gaawe')
      .map((t: { parameter: { key: string; value: string }[] }) =>
        t.parameter.find((p) => p.key === 'eventName')?.value);
    for (const name of [
      'contact_form_submit', 'callback_conversion', 'phone_conversion',
      'email_conversion', 'whatsapp_conversion', 'booking_click',
      'quote_calculator_conversion', 'newsletter_signup', 'calculator_result_view',
    ]) {
      expect(ga4Names).toContain(name);
    }
  });

  it('has a Custom Event trigger per canonical dataLayer event', () => {
    const events = cv.trigger
      .filter((t: { type: string }) => t.type === 'CUSTOM_EVENT')
      .map((t: { customEventFilter: { parameter: { key: string; value: string }[] }[] }) =>
        t.customEventFilter[0].parameter.find((p) => p.key === 'arg1')?.value);
    for (const name of [
      'lead_submit', 'contact_submit', 'callback_click', 'phone_click',
      'email_click', 'whatsapp_click', 'booking_click', 'calculator_complete',
      'calculator_start', 'calculator_step', 'calculator_option', 'form_abandon',
      'scroll_depth', 'newsletter_signup', 'calculator_result_view',
    ]) {
      expect(events).toContain(name);
    }
  });

  it('Meta Pixel tags use the shared event_id for dedup', () => {
    const pixelTags = cv.tag.filter((t: { name: string }) => t.name.startsWith('Meta Pixel - '));
    const lead = pixelTags.find((t: { name: string }) => t.name.endsWith('Lead'));
    const html = lead.parameter.find((p: { key: string }) => p.key === 'html').value as string;
    expect(html).toContain('{{DLV - event_id}}');
  });

  it('does not count calculator_complete as a second Meta Lead', () => {
    const calculatorTrigger = cv.trigger.find(
      (t: { name: string }) => t.name === 'CE - calculator_complete',
    );
    const lead = cv.tag.find((t: { name: string }) => t.name === 'Meta Pixel - Lead');
    expect(lead.firingTriggerId).not.toContain(calculatorTrigger.triggerId);
  });

  it('User-Provided Data variable reads the side-channel, NOT a Data Layer Variable', () => {
    const upd = cv.variable.find((v: { name: string }) => v.name === 'CJS - User Provided Data');
    expect(upd.type).toBe('jsm');
    const js = upd.parameter.find((p: { key: string }) => p.key === 'javascript').value as string;
    expect(js).toContain('window.__sbUserData');
    // The variable must return the side-channel object AS-IS (no reshaping):
    // the lib already writes the gtag user_provided_data shape, names nested
    // under `address` — a transforming variable here would break that contract.
    expect(js).toContain('return window.__sbUserData || {}');
    expect(js).toContain('address');
  });

  it('uses built-in Consent Mode for Google tags and explicit consent for custom pixels', () => {
    const googleTags = cv.tag.filter((t: { type: string }) =>
      ['googtag', 'gaawe', 'awct'].includes(t.type));
    expect(googleTags.length).toBeGreaterThan(0);
    for (const tag of googleTags) {
      expect(tag.consentSettings.consentStatus, tag.name).toBe('NOT_SET');
    }

    const pixelTags = cv.tag.filter((t: { name: string }) => t.name.startsWith('Meta Pixel - '));
    for (const tag of pixelTags) {
      const types = tag.consentSettings.consentType.list.map((x: { value: string }) => x.value);
      expect(types, tag.name).toContain('ad_storage');
      expect(types, tag.name).toContain('ad_user_data');
    }
  });

  it('loads the modern Google tag on every page with the GA4 measurement id', () => {
    const config = cv.tag.find((t: { name: string }) => t.name === 'GA4 - Configuration');
    expect(config.type).toBe('googtag');
    expect(config.firingTriggerId).toContain('2147479553');
    expect(config.parameter.find((p: { key: string }) => p.key === 'tagId')?.value)
      .toBe('{{Const - GA4 Measurement ID}}');
  });

  it('uses the current GA4 event parameter schema and the GA4 id override', () => {
    const eventTags = cv.tag.filter((t: { type: string }) => t.type === 'gaawe');
    expect(eventTags.length).toBeGreaterThan(0);
    for (const tag of eventTags) {
      expect(tag.parameter.some((p: { key: string }) => p.key === 'eventSettingsTable'), tag.name)
        .toBe(true);
      expect(tag.parameter.find((p: { key: string }) => p.key === 'measurementIdOverride')?.value)
        .toBe('{{Const - GA4 Measurement ID}}');
    }
  });

  it('enables Enhanced Conversions directly on every Google Ads conversion tag', () => {
    const adsTags = cv.tag.filter((t: { type: string }) => t.type === 'awct');
    expect(adsTags.length).toBeGreaterThan(0);
    for (const tag of adsTags) {
      expect(tag.parameter.find((p: { key: string }) => p.key === 'enableEnhancedConversionsCheckbox')?.value)
        .toBe(true);
      expect(tag.parameter.find((p: { key: string }) => p.key === 'userProvidedData')?.value)
        .toBe('{{CJS - User Provided Data}}');
    }
  });
});

describe('Beautyflow production GTM import', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cv = (beautyflowContainer as any).containerVersion;

  function constant(name: string): string | undefined {
    const variable = cv.variable.find((v: { name: string }) => v.name === name);
    return variable?.parameter.find((p: { key: string }) => p.key === 'value')?.value;
  }

  it('targets the real Beautyflow container and contains no placeholders', () => {
    expect(cv.container.publicId).toBe('GTM-W8V3BVGD');
    expect(constant('Const - GA4 Measurement ID')).toBe('G-774BY4X64P');
    expect(constant('Const - Meta Pixel ID')).toBe('915395591548632');
    expect(constant('Const - Google Ads Conversion ID')).toBe('AW-17613140258');
    expect(JSON.stringify(beautyflowContainer)).not.toMatch(/XXXXXXXX|META_PIXEL_ID|CONVERSION_LABEL/);
  });

  it('does not misreport booking as the Contact Google Ads conversion', () => {
    const bookingTrigger = cv.trigger.find((t: { name: string }) => t.name === 'CE - booking_click');
    const adsTags = cv.tag.filter((t: { type: string }) => t.type === 'awct');
    expect(adsTags.some((t: { firingTriggerId: string[] }) =>
      t.firingTriggerId.includes(bookingTrigger.triggerId))).toBe(false);
    expect(cv.tag.some((t: { name: string }) => t.name === 'GA4 - booking_click')).toBe(true);
    expect(cv.tag.some((t: { name: string }) => t.name === 'Meta Pixel - InitiateCheckout')).toBe(true);
  });

  it('keeps the known Contact and Phone actions separate', () => {
    expect(constant('Const - Google Ads Contact Label')).toBe('s1NzCOWX76kbEKLizM5B');
    expect(constant('Const - Google Ads Phone Label')).toBe('D0UgCMKZ-6kbEKLizM5B');
    expect(cv.tag.some((t: { name: string }) => t.name === 'Google Ads - Contact / Lead')).toBe(true);
    expect(cv.tag.some((t: { name: string }) => t.name === 'Google Ads - Phone')).toBe(true);
  });

  it('loads CookieYes outside GTM so consent has one source of truth', () => {
    expect(cv.tag.some((t: { name: string }) => /CookieYes/i.test(t.name))).toBe(false);
  });
});
