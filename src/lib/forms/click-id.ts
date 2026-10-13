/**
 * A lead-űrlapok Google klikk-ID-je — EGY feloldó a három űrlapnak ÉS a szervernek.
 *
 * A hiba: mindhárom űrlap (ContactForm, konzultációs kalkulátor, kvíz) KULCSONKÉNT
 * fésülte össze a két tracking-forrást:
 *
 *     gclid: t.gclid || a.gclid,  gbraid: t.gbraid || a.gbraid, …
 *
 * Mindkét forrás külön-külön helyesen EGY ID-t ad, de ha az egyik `gclid`-et, a
 * másik `gbraid`-et talált, az összefésülés KETTŐT küldött — két különböző
 * kattintás azonosítóját ugyanahhoz a leadhez. A Google Ads offline/Enhanced
 * Conversions feltöltés ilyenkor a rossz kattintáshoz köthet, némán.
 *
 * A szabály (a tracking-kit `google-click-id.ts` authorityjére építve):
 *   • a források sorrendben jönnek (a hívó a FRISS URL-t / consent-kapuzott
 *     `collectAttribution()`-t adja elsőnek);
 *   • az ELSŐ forrás nyer, amelyikben van bármilyen Google klikk-ID;
 *   • azon belül `gclid` > `gbraid` > `wbraid`;
 *   • a kimenetben LEGFELJEBB EGY mező nem üres.
 *
 * A szerver ugyanezt futtatja a beérkező body-n (egyetlen forrásként), így egy
 * régi, gyorsítótárazott kliens kettős ID-je sem jut el a CRM-be / Sheetsbe /
 * a gateway-be.
 */
import { pickGoogleClickId, type ClickIdSource } from '@tracking/lib/google-click-id';

export interface GoogleClickIdFields {
  gclid: string;
  gbraid: string;
  wbraid: string;
}

export function resolveLeadGoogleClickId(...sources: ClickIdSource[]): GoogleClickIdFields {
  const out: GoogleClickIdFields = { gclid: '', gbraid: '', wbraid: '' };
  for (const source of sources) {
    const hit = pickGoogleClickId(source);
    if (hit) {
      out[hit.key] = hit.value;
      return out;
    }
  }
  return out;
}

/**
 * Szerveroldali normalizálás: a body Google klikk-ID mezőit helyben átírja úgy,
 * hogy legfeljebb egy maradjon (a többi üres string). Nem-string értéket
 * figyelmen kívül hagy.
 */
export function normalizeLeadGoogleClickId<T extends Partial<Record<keyof GoogleClickIdFields, unknown>>>(
  data: T,
): T {
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const resolved = resolveLeadGoogleClickId({
    gclid: str(data.gclid),
    gbraid: str(data.gbraid),
    wbraid: str(data.wbraid),
  });
  Object.assign(data, resolved);
  return data;
}
