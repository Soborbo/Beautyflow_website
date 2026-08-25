import { ui, defaultLang, type UIKey } from './ui';

export type Locale = keyof typeof ui;

// Canonical form: root stays '/', everything else has no trailing slash and no
// `.html` suffix. Astro's `Astro.url.pathname` returns `/foo.html` during
// prerender when `build.format: 'file'` is set, so we strip both here before
// anything builds a canonical/hreflang/breadcrumb URL.
// Matches Cloudflare's `drop-trailing-slash` and astro.config `trailingSlash: 'never'`.
export function stripTrailingSlash(path: string): string {
  if (!path) return '/';
  const noHtml = path.replace(/\.html$/, '');
  if (noHtml === '/' || noHtml === '') return '/';
  return noHtml.replace(/\/+$/, '') || '/';
}

export function getLangFromUrl(url: URL): Locale {
  const [, lang] = url.pathname.split('/');
  if (lang in ui) return lang as Locale;
  return defaultLang;
}

export function useTranslations(lang: Locale) {
  return function t(key: UIKey): string {
    return ui[lang][key] || ui[defaultLang][key] || key;
  };
}

export function getRouteFromUrl(url: URL): string {
  const pathname = url.pathname;
  const lang = getLangFromUrl(url);

  if (lang === defaultLang) {
    return pathname;
  }

  // Remove language prefix
  const pathWithoutLang = pathname.replace(`/${lang}`, '') || '/';
  return pathWithoutLang;
}

export function getLocalizedPath(path: string, lang: Locale): string {
  const normalized = stripTrailingSlash(path);
  if (lang === defaultLang) {
    return normalized;
  }
  return `/${lang}${normalized === '/' ? '' : normalized}`;
}

// Bidirectional route mappings between Hungarian and English
export const routeMappings: Array<{ hu: string; en: string }> = [
  { hu: '/', en: '/' },
  { hu: '/rolunk', en: '/about' },
  { hu: '/bordiagnosztika', en: '/skin-diagnostics' },
  { hu: '/arak', en: '/prices' },
  { hu: '/gyakran-ismetelt-kerdesek', en: '/faq' },
  { hu: '/ingyenes-konzultacio', en: '/free-consultation' },
  { hu: '/dioda-lezeres-szortelenites', en: '/laser-hair-removal' },
  { hu: '/sminktetovalas', en: '/permanent-makeup' },
  { hu: '/lezeres-tetovalas-eltavolitas', en: '/tattoo-removal' },
  { hu: '/pigmentfolt-eltavolitas', en: '/pigment-removal' },
  { hu: '/carbon-peeling', en: '/carbon-peeling' },
  { hu: '/hydrabeauty', en: '/hydrabeauty' },
  { hu: '/green-sea-peel', en: '/green-sea-peel' },
  { hu: '/biopen-q2', en: '/biopen-q2' },
  { hu: '/anti-aging', en: '/anti-aging' },
  { hu: '/beautyflow-pest', en: '/beautyflow-pest' },
  { hu: '/beautyflow-buda', en: '/beautyflow-buda' },
  { hu: '/adatvedelmi-tajekoztato', en: '/privacy-policy' },
  { hu: '/aszf', en: '/terms-and-conditions' },
  { hu: '/hazirend', en: '/house-rules' },
  { hu: '/koszonjuk', en: '/thank-you' },
  // Knowledge Base / Tudástár
  { hu: '/tudastar', en: '/knowledge-base' },
  { hu: '/tudastar/dioda-lezeres-szortelenites-minden-amit-tudnod-kell', en: '/knowledge-base/diode-laser-hair-removal-everything-you-need-to-know' },
];

// Magyar-only szekciók: NINCS angol párjuk, és nem is lesz egyhamar (a kvíz és a
// 16 Baumann-bőrtípusoldal magyar tartalom). Ezek nélkül a nyelvváltó vakon
// `/en/<ugyanaz>`-ra mutatott, ami 404 — a Layout hreflangja pedig egy nem
// létező URL-t hirdetett. Prefix-egyezés, hogy az aloldalak is bejöjjenek.
const HU_ONLY_PREFIXES = ['/bortipus', '/boranalizis', '/eredmeny'];

/** Van-e a megadott (nyelv-prefix nélküli) útvonalnak párja a másik nyelven? */
export function hasAlternateRoute(path: string): boolean {
  const normalized = stripTrailingSlash(path);
  return !HU_ONLY_PREFIXES.some(
    (p) => normalized === p || normalized.startsWith(`${p}/`),
  );
}

// Get the equivalent route in another language
export function getAlternateRoute(currentPath: string, fromLang: Locale, toLang: Locale): string {
  const normalizedPath = stripTrailingSlash(currentPath);

  // Find the mapping for the current path
  const mapping = routeMappings.find(m => m[fromLang] === normalizedPath);

  if (mapping) {
    const targetPath = mapping[toLang];
    return getLocalizedPath(targetPath, toLang);
  }

  // Magyar-only szekció (kvíz, bőrtípusoldalak): a MÁSIK nyelven nincs hova
  // mutatni — a nyelvváltó a főoldalra visz 404 helyett. A saját nyelvére
  // kérdezve viszont önmagát kell visszaadnia (különben a hreflang="hu" is a
  // főoldalra mutatna a 16 bőrtípusoldalon).
  if (toLang !== fromLang && !hasAlternateRoute(normalizedPath)) {
    return getLocalizedPath('/', toLang);
  }

  // If no mapping found, return the same path with proper localization
  return getLocalizedPath(normalizedPath, toLang);
}
