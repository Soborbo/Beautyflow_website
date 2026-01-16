# Performance Optimization Guide
## Mobil 100 Lighthouse Score Eléréséhez

Ez az útmutató lépésről lépésre bemutatja, hogyan kell implementálni a teljes performance optimalizációt egy Astro projektben az elejétől, bughunt nélkül.

## 1. Lépés: Package telepítések

```bash
# Sitemap
npm install @astrojs/sitemap

# Critical CSS inline
npm install astro-critters

# Variable font (csak dev dependency, build után nem kell)
npm install -D @fontsource-variable/cormorant
```

## 2. Lépés: Font fájlok előkészítése

### Cormorant Variable font másolása (vagy más variable font)

```bash
# Készíts fonts mappát
mkdir -p public/fonts

# Másold a variable font fájlokat node_modules-ból
cp node_modules/@fontsource-variable/cormorant/files/cormorant-latin-wght-normal.woff2 public/fonts/
cp node_modules/@fontsource-variable/cormorant/files/cormorant-latin-ext-wght-normal.woff2 public/fonts/
```

**Miért variable font?**
- 1 fájl tartalmazza az összes font weight-et (300-700)
- Kisebb méret mint több különálló font fájl
- Kevesebb HTTP request

## 3. Lépés: astro.config.mjs konfiguráció

```javascript
// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import critters from 'astro-critters';

export default defineConfig({
  site: 'https://yoursite.com', // FONTOS: saját domain
  output: 'server',

  integrations: [
    // Sitemap generálás
    sitemap({
      i18n: {
        defaultLocale: 'hu',
        locales: {
          hu: 'hu',
          en: 'en',
        },
      },
    }),

    // Critical CSS inline + CSS optimization
    critters({
      Critters: {
        // Inline critical CSS for above-the-fold content
        preload: 'media',        // Non-critical CSS preload media query trükkel
        inlineFonts: false,      // NE inline-olja a fontokat (mi manuálisan preload-oljuk)
        preloadFonts: false,     // NE preload-olja a fontokat (mi manuálisan csináljuk)
        pruneSource: true,       // Távolítsa el az inline-olt CSS-t a külső stylesheet-ekből
        mergeStylesheets: false, // NE merge-elje a stylesheet-eket (jobb caching)
      }
    })
  ],

  // KRITIKUS: Inline ALL CSS to eliminate render-blocking
  build: {
    inlineStylesheets: 'always', // Minden CSS inline -> 0 render-blocking request
  },

  i18n: {
    defaultLocale: 'hu',
    locales: ['hu', 'en'],
    routing: {
      prefixDefaultLocale: false
    }
  },

  adapter: cloudflare({
    imageService: 'compile',
    routes: {
      strategy: 'include',
      include: ['/*'],
      exclude: ['/_astro/*', '/images/*', '/favicon.svg']
    }
  }),

  image: {
    domains: [],
  },
});
```

### Critters beállítások magyarázat:

| Beállítás | Érték | Miért? |
|-----------|-------|--------|
| `preload: 'media'` | Media query trick | Non-critical CSS-t később tölti be, nem blocking |
| `inlineFonts: false` | Ne inline-olja | Font fájlok maradjanak külön (cache-elhetők) |
| `preloadFonts: false` | Ne auto-preload | Mi manuálisan kontrolláljuk a font preload-ot |
| `pruneSource: true` | Igen | Eltávolítja az inline-olt CSS-t a külső file-okból (kisebb méret) |
| `mergeStylesheets: false` | Ne merge-elje | Külön stylesheet-ek jobb cache-elést eredményeznek |

**KRITIKUS**: `build.inlineStylesheets: 'always'` -> Ez eliminálja az összes render-blocking CSS request-et!

## 4. Lépés: global.css optimalizálás

**NE használj @import-okat fontokhoz!** Ez render-blocking critical request chain-t hoz létre.

```css
@import "tailwindcss";

/*
 * Font optimization strategy:
 * - Body: system font stack (zero download, instant render)
 * - Headings: Cormorant Variable (1 file, all weights 300-700)
 * - font-display: swap (allows content to render immediately)
 * - Preloaded in Layout.astro for optimal performance
 */

/* Cormorant Variable Font - Latin subset */
@font-face {
  font-family: 'Cormorant';
  src: url('/fonts/cormorant-latin-wght-normal.woff2') format('woff2');
  font-weight: 300 700;  /* Variable font: all weights */
  font-style: normal;
  font-display: swap;    /* KRITIKUS: render text with fallback first */
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}

/* Cormorant Variable Font - Latin Extended (Magyar karakterek: áéíóöőúüű) */
@font-face {
  font-family: 'Cormorant';
  src: url('/fonts/cormorant-latin-ext-wght-normal.woff2') format('woff2');
  font-weight: 300 700;
  font-style: normal;
  font-display: swap;
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}

@theme {
  --color-primary: #c53f75;
  --color-primary-dark: #a33460;
  --color-heading: #1e293b;
  --color-body: #334155;

  /* System font stack for body - INSTANT RENDER, ZERO DOWNLOAD */
  --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;

  /* Cormorant variable for headings - 1 file, all weights */
  --font-heading: "Cormorant", Georgia, serif;
}

@layer base {
  html {
    font-family: var(--font-sans);  /* System fonts -> instant render */
    font-size: 15px;
    line-height: 1.65;
    color: var(--color-body);
  }

  h1, h2, h3, h4, h5, h6 {
    font-family: var(--font-heading);  /* Custom font csak heading-ekhez */
    color: var(--color-heading);
    font-weight: 700;
  }
}
```

### Font stratégia magyarázat:

1. **Body text**: System font stack
   - 0 download
   - Instant render
   - Natív OS font minőség

2. **Headings**: Cormorant Variable
   - 2 fájl összesen (~65KB): latin + latin-ext
   - 1 fájl = összes weight (300-700)
   - `font-display: swap` = text látszik fallback fonttal amíg betölt

3. **Unicode-range splitting**:
   - `latin`: alapvető karakterek
   - `latin-ext`: magyar ékezetes karakterek (áéíóöőúüű)
   - Böngésző csak a szükséges fájlt tölti le

## 5. Lépés: Layout.astro font preload

```astro
---
import '../styles/global.css';
// ... other imports
---

<!DOCTYPE html>
<html lang={currentLang}>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content={description} />
    <link rel="icon" type="image/png" href="/images/favicon.png" />
    <title>{title}</title>

    <!--
      Font preloading: Cormorant Variable for headings
      Body uses system fonts (no download needed)
      Variable font contains all weights (300-700) in one file
    -->
    <link rel="preload" href="/fonts/cormorant-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="/fonts/cormorant-latin-ext-wght-normal.woff2" as="font" type="font/woff2" crossorigin />

    <link rel="canonical" href={canonicalUrl} />

    <!-- Alternate language links for SEO -->
    <link rel="alternate" hreflang="hu" href={`https://yoursite.com${huUrl}`} />
    <link rel="alternate" hreflang="en" href={`https://yoursite.com${enUrl}`} />
    <link rel="alternate" hreflang="x-default" href={xDefaultUrl} />

    <!-- Open Graph / Twitter cards ... -->
  </head>
  <body>
    <!-- ... -->
  </body>
</html>
```

**KRITIKUS**:
- `crossorigin` attribute a preload-nál kötelező fontokhoz
- Csak a critical fontokat preload-old (heading font)
- Body font = system, nem kell preload

## 6. Lépés: robots.txt

```txt
# https://www.robotstxt.org/robotstxt.html
User-agent: *
Allow: /

# Sitemap
Sitemap: https://yoursite.com/sitemap-index.xml
```

## 7. Lépés: Prerender minden oldal (SSR mode-ban)

Minden `.astro` oldal tetejére:

```astro
---
export const prerender = true;  // KRITIKUS: sitemap generáláshoz kell
// ... rest of your code
---
```

## 8. Lépés: Build és ellenőrzés

```bash
# Build
npm run build

# Ellenőrzések
echo "=== Sitemap check ==="
ls -lh dist/sitemap*.xml

echo "=== CSS inline check (should be 0) ==="
grep -o '<link rel="stylesheet"' dist/index.html | wc -l

echo "=== Inline style check (should be 1+) ==="
grep -o '<style' dist/index.html | wc -l

echo "=== HTML size ==="
wc -c dist/index.html
```

## Mi történik build után?

1. **Sitemap generálás**: `sitemap-index.xml` + `sitemap-0.xml` (35 URLs with i18n)
2. **CSS inline**: Minden CSS inline `<style>` tag-ben -> 0 render-blocking CSS
3. **Critters**: Critical CSS extracted és inline-olva a `<head>`-ben
4. **Font optimization**: 2 font file preload, body instant render system fonttal

## Eredmények

| Metrika | Előtte | Utána | Javulás |
|---------|--------|-------|---------|
| Font fájlok | 10 (~250KB) | 2 (65KB) | 74% ↓ |
| Body font | Download szükséges | Instant (system) | 100% ↓ |
| CSS requests | 1 render-blocking | 0 (inline) | 100% ↓ |
| HTML méret | ~50KB | ~170KB (25KB gzip) | +240% (acceptable) |
| Lighthouse Mobile | 85-90 | 95-100 | +10-15 pont |

## Gyakori hibák, amiket elkerülj

### ❌ NE csináld
```css
/* NE: @import render-blocking */
@import "@fontsource/cormorant/latin-400.css";
@import "@fontsource/cormorant/latin-700.css";
```

```javascript
// NE: auto stylesheet-ek
build: {
  inlineStylesheets: 'auto',  // ❌ Külső CSS file-ok maradnak
}
```

```javascript
// NE: Critters auto font preload
critters({
  Critters: {
    preloadFonts: true,  // ❌ Kontrollálatlan font preload
  }
})
```

### ✅ Csináld helyette
```css
/* ✅ Inline @font-face */
@font-face {
  font-family: 'Cormorant';
  src: url('/fonts/cormorant-latin-wght-normal.woff2') format('woff2');
  font-display: swap;
}
```

```javascript
// ✅ Always inline CSS
build: {
  inlineStylesheets: 'always',
}
```

```javascript
// ✅ Manual font preload control
critters({
  Critters: {
    preloadFonts: false,  // ✅ Manual control
  }
})
```

## Checklist új projekt indításhoz

- [ ] 1. Install packages: `@astrojs/sitemap`, `astro-critters`, variable font package
- [ ] 2. Copy font files to `public/fonts/`
- [ ] 3. Configure `astro.config.mjs`:
  - [ ] sitemap with i18n
  - [ ] critters with correct settings
  - [ ] `build.inlineStylesheets: 'always'`
- [ ] 4. Update `global.css`:
  - [ ] Remove all `@import` for fonts
  - [ ] Add inline `@font-face` with `font-display: swap`
  - [ ] Use system fonts for body
  - [ ] Use variable font for headings
- [ ] 5. Update `Layout.astro`:
  - [ ] Add font preload for critical fonts
  - [ ] Include `crossorigin` attribute
- [ ] 6. Add `export const prerender = true` to all pages
- [ ] 7. Update `robots.txt` with sitemap URL
- [ ] 8. Build and verify

## Tesztelés

```bash
# Local build
npm run build

# Preview
npm run preview

# PageSpeed Insights
# https://pagespeed.web.dev/analysis/https-yoursite-com/...
```

## Összefoglalás

**3 fő princípium**:
1. **Zero render-blocking requests**: Inline CSS + system fonts for body
2. **Minimal custom fonts**: Variable font (1 file, all weights) csak heading-ekhez
3. **Critters + inlineStylesheets**: Critical CSS inline + all CSS inline

Kövesd ezt a guide-ot lépésről lépésre és 95-100 Lighthouse score-t érhetsz el első nekifutásra, bughunt nélkül! 🚀
