// Foglalási linkek EGY helyen (D-BF5). BOOKING_PROVIDER: 'notino' = a mai állapot; 'crm' = a saját
// online foglaló (crm.beautyflow.pro/book). Visszaállás = ez az egy sor.
export type BookingSite = 'buda' | 'pest' | 'any';
export const BOOKING_PROVIDER = 'notino' as 'notino' | 'crm';
export const bookingIsNotino: boolean = BOOKING_PROVIDER === 'notino';

// Az 'any' a Buda-szalon partner-linkje (a Notino ezen a slugon listázza a céget); az árak-oldal eddig is
// ezt használta, a köszönő-oldal paraméter nélkül — mostantól mind a partner-paraméteres alakot kapja.
const NOTINO_BUDA = 'https://www.notino.hu/szalonok/beautyflow?source_caller=ui&shortlink=lbbsjxf8&c=salon_detail_redirect&pid=notino_partner&deep_link_value=https%3A%2F%2Fnotino.hu%2Fszalonok%2Fbeautyflow&af_xp=custom';
const NOTINO: Record<BookingSite, string> = {
  buda: NOTINO_BUDA,
  pest: 'https://www.notino.hu/szalonok/beautyflow-pest?source_caller=ui&shortlink=lbbsjxf8&c=salon_detail_redirect&pid=notino_partner&deep_link_value=https%3A%2F%2Fnotino.hu%2Fszalonok%2Fbeautyflow-pest&af_xp=custom',
  any: NOTINO_BUDA,
};
export const CRM_BOOKING_URL = 'https://crm.beautyflow.pro/book';

export function bookingUrl(site: BookingSite): string {
  if (BOOKING_PROVIDER === 'notino') return NOTINO[site];
  const u = new URL(CRM_BOOKING_URL);
  if (site !== 'any') u.searchParams.set('site', site);
  return u.toString();
}

/** A Notino új fülön nyílik, a saját foglaló ugyanabban. */
export function bookingTargetAttrs(): Record<string, string> {
  return bookingIsNotino ? { target: '_blank', rel: 'noopener' } : {};
}

/** `<a {...bookingLinkAttrs('buda')}>` — href + konverzió-jelölés + fül-viselkedés. */
export function bookingLinkAttrs(site: BookingSite): Record<string, string> {
  return { href: bookingUrl(site), 'data-track': 'booking_click', ...bookingTargetAttrs() };
}
