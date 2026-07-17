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
  // Knowledge Base / Tudástár
  { hu: '/tudastar', en: '/knowledge-base' },
  { hu: '/tudastar/dioda-lezeres-szortelenites-minden-amit-tudnod-kell', en: '/knowledge-base/diode-laser-hair-removal-everything-you-need-to-know' },
];

// Get the equivalent route in another language
export function getAlternateRoute(currentPath: string, fromLang: Locale, toLang: Locale): string {
  const normalizedPath = stripTrailingSlash(currentPath);

  // Find the mapping for the current path
  const mapping = routeMappings.find(m => m[fromLang] === normalizedPath);

  if (mapping) {
    const targetPath = mapping[toLang];
    return getLocalizedPath(targetPath, toLang);
  }

  // If no mapping found, return the same path with proper localization
  return getLocalizedPath(normalizedPath, toLang);
}
