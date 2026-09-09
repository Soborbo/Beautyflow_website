import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';

/**
 * Media-scoped `<link rel="preload" as="image">` attribútumok egy reszponzív
 * `<Picture>`-höz.
 *
 * MIÉRT KELL. Ha egy hero két KÜLÖN elemként renderel (desktop-oszlop + mobil
 * banner, egymást `display:none`-nal kizárva), akkor a `loading`/`fetchpriority`
 * attribútummal nem lehet breakpointonként priorizálni: a szerver nem tudja,
 * melyik törésponton vagyunk. Az `eager` kép viszont AKKOR IS letöltődik, ha
 * `display:none` — tehát a „tegyük prioritásosra a desktopot" megoldás mobilon
 * egy láthatatlan képet tölt le nagy prioritással, miközben a VALÓDI LCP-kép
 * `lazy`-ként várakozik.
 *
 * A `media` attribútumos preload ezt oldja meg: a böngésző csak azon a
 * törésponton kezdi a letöltést, ahol a kép látszik.
 *
 * MIÉRT ITT, ÉS NEM A HÍVÓ OLDALON. A preload csak akkor ér valamit, ha a
 * `srcset`-je BETŰRE ugyanaz, mint a renderelt `<source>`-é — különben a
 * böngésző MÁSIK fájlt tölt le, és a preload nem gyorsít, hanem duplikál. Ezért
 * a helper a hívó komponens SAJÁT `widths`/`sizes`/`quality` konstansait kapja
 * meg: a két érték nem tud szétcsúszni, mert egy forrásból származik.
 *
 * KORLÁT (tudatos): csak az `avif` ágra adunk preloadot. A `<Picture>` avif →
 * webp → jpg sorrendben kínál; avif-ot ma minden érintett böngésző ismer, a
 * ritka kivétel pedig egyszerűen figyelmen kívül hagyja a nem támogatott
 * `type`-ú preloadot — vagyis a mai (preload nélküli) viselkedést kapja, nem
 * rosszabbat. Több formátumra preloadolni HIBA lenne: a böngésző mindet
 * letöltené.
 */
export async function buildResponsivePreload(opts: {
  src: ImageMetadata;
  widths: number[];
  sizes: string;
  quality: number;
  media: string;
}): Promise<{ imagesrcset: string; imagesizes: string; media: string }> {
  const image = await getImage({
    src: opts.src,
    widths: opts.widths,
    format: 'avif',
    quality: opts.quality,
  });

  return {
    imagesrcset: image.srcSet.attribute,
    imagesizes: opts.sizes,
    media: opts.media,
  };
}
