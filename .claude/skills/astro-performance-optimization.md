# Astro Performance Optimization Skill

## Description
Comprehensive performance optimization for Astro websites targeting 95-100 Lighthouse mobile scores. Optimizes fonts, CSS, JavaScript, images, and implements SEO essentials.

## When to Use
- When PageSpeed Insights shows performance issues
- Mobile Lighthouse score below 90
- Render-blocking resources detected
- Large JavaScript bundles (>100KB)
- Font loading issues
- Missing sitemap

## Prerequisites
- Astro project with SSR or static output
- Node.js and npm installed
- Basic understanding of web performance metrics

---

## STEP 1: FONT OPTIMIZATION

### Goal
Reduce font payload by 70-80% and eliminate render-blocking font requests.

### Implementation

#### 1.1 Switch to Variable Fonts + System Fonts

**Install variable font package (dev dependency only):**
```bash
npm install -D @fontsource-variable/[font-name]
```

**Copy font files to public/fonts/:**
```bash
mkdir -p public/fonts
cp node_modules/@fontsource-variable/[font-name]/files/*-wght-normal.woff2 public/fonts/
```

**Example fonts needed:**
- `[font-name]-latin-wght-normal.woff2`
- `[font-name]-latin-ext-wght-normal.woff2` (for accented characters)

#### 1.2 Update global.css

**Remove all @import statements:**
```css
/* ❌ DELETE these */
@import "@fontsource/font-name/400.css";
@import "@fontsource/font-name/700.css";
```

**Add inline @font-face:**
```css
@import "tailwindcss";

/* Variable font - Latin subset */
@font-face {
  font-family: 'FontName';
  src: url('/fonts/font-name-latin-wght-normal.woff2') format('woff2');
  font-weight: 300 700;  /* Variable: all weights in one file */
  font-style: normal;
  font-display: swap;    /* CRITICAL: show text with fallback first */
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}

/* Variable font - Latin Extended (accented characters: áéíóöőúüű) */
@font-face {
  font-family: 'FontName';
  src: url('/fonts/font-name-latin-ext-wght-normal.woff2') format('woff2');
  font-weight: 300 700;
  font-style: normal;
  font-display: swap;
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}

@theme {
  /* System font stack for body - INSTANT RENDER, ZERO DOWNLOAD */
  --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;

  /* Custom variable font for headings - 1 file, all weights */
  --font-heading: "FontName", Georgia, serif;
}

@layer base {
  html {
    font-family: var(--font-sans);  /* System fonts → instant */
  }

  h1, h2, h3, h4, h5, h6 {
    font-family: var(--font-heading);  /* Custom font only for headings */
  }
}
```

#### 1.3 Add Font Preload in Layout

**src/layouts/Layout.astro:**
```astro
<head>
  <!-- Other meta tags -->

  <!-- Font preload: Custom font for headings only -->
  <!-- Body uses system fonts (no preload needed) -->
  <link rel="preload" href="/fonts/font-name-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="preload" href="/fonts/font-name-latin-ext-wght-normal.woff2" as="font" type="font/woff2" crossorigin />
</head>
```

**CRITICAL NOTES:**
- `crossorigin` attribute is REQUIRED for font preload
- Only preload fonts actually used above-the-fold
- Body text should use system fonts (no download)

#### 1.4 Clean Up package.json

```bash
npm uninstall @fontsource/old-font-name @fontsource/other-font
```

### Expected Results
- Font files: 10+ → 2 (-80%)
- Font payload: ~250KB → 65KB (-74%)
- Body font: Instant render (system font)
- Headings: Single variable font file

---

## STEP 2: CSS OPTIMIZATION (ELIMINATE RENDER-BLOCKING)

### Goal
Inline all CSS to eliminate external stylesheet requests and render-blocking.

### Implementation

#### 2.1 Configure Astro Build

**astro.config.mjs:**
```javascript
import { defineConfig } from 'astro/config';
import critters from 'astro-critters';

export default defineConfig({
  integrations: [
    critters({
      Critters: {
        preload: 'media',        // Preload non-critical CSS with media query
        inlineFonts: false,      // Don't inline fonts (we preload manually)
        preloadFonts: false,     // Don't auto-preload fonts
        pruneSource: true,       // Remove inlined CSS from external files
        mergeStylesheets: false, // Keep separate for better caching
      }
    })
  ],

  build: {
    inlineStylesheets: 'always',  // CRITICAL: Inline ALL CSS
  },
});
```

#### 2.2 Install astro-critters

```bash
npm install astro-critters
```

### Expected Results
- External CSS files: 1+ → 0 (-100%)
- Render-blocking CSS: Eliminated
- HTML size: Increased (acceptable with gzip)
- First paint: Faster (no CSS blocking)

### Verification
```bash
# After build, check for external CSS (should be 0)
grep -o '<link rel="stylesheet"' dist/index.html | wc -l

# Check inline CSS (should be 1+)
grep -o '<style' dist/index.html | wc -l
```

---

## STEP 3: JAVASCRIPT OPTIMIZATION

### Goal
Reduce JavaScript payload by 50%+ by removing non-critical animations.

### Strategy
**Keep ONLY business-critical scripts:**
- ✅ Mobile menu (UX critical)
- ✅ Conversion tracking (GTM, analytics)
- ✅ CTAs and forms
- ❌ Decorative animations
- ❌ Scroll effects
- ❌ Number counters
- ❌ Rating animations

### Implementation

#### 3.1 Identify Non-Critical Animations

Look for these patterns in components:
```javascript
// ❌ Remove these
IntersectionObserver + requestAnimationFrame
Scroll-triggered animations on decorative elements
Number counter animations
Rating number animations
Card reveal animations
```

#### 3.2 Replace with Simple Display

**BEFORE (52 lines):**
```javascript
function initRatingAnimation() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = parseFloat(el.getAttribute('data-target'));
        animateRating(el, target);  // 30+ lines of animation code
      }
    });
  });
  // ...more code
}
```

**AFTER (3 lines):**
```javascript
// Show immediately without animation
document.querySelectorAll('.rating-number').forEach(el => {
  el.textContent = el.getAttribute('data-target') || '5.0';
});
```

#### 3.3 Preserve Critical Functions

**ALWAYS keep:**
```javascript
// ✅ Mobile menu toggle
function openMobileMenu() { /* ... */ }
function closeMobileMenu() { /* ... */ }

// ✅ GTM tracking
whatsappBtn.addEventListener('click', () => {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: 'whatsapp_click',
    click_location: 'floating_button'
  });
});

// ✅ Delayed CTAs
setTimeout(() => { ctaBar.classList.add('show'); }, 10000);
```

### Expected Results
- Inline JS: ~94KB → ~36KB (-62%)
- Total JS: ~117KB → ~59KB (-50%)
- Code complexity: Simplified
- Lighthouse score: Improved

---

## STEP 4: IMAGE OPTIMIZATION

### Goal
Reduce image payload with responsive images and modern formats.

### Implementation

#### 4.1 Use Astro Image Component

**For local images:**
```astro
---
import { Image } from 'astro:assets';
import heroImage from '../assets/hero.jpg';
---

<Image
  src={heroImage}
  alt="Description"
  widths={[320, 640, 960, 1280]}
  sizes="(max-width: 1024px) 100vw, 50vw"
  loading="eager"
  fetchpriority="high"
/>
```

#### 4.2 YouTube Thumbnails (Responsive)

**For YouTube embed placeholders:**
```html
<img
  srcset="
    https://i.ytimg.com/vi/VIDEO_ID/hqdefault.jpg 480w,
    https://i.ytimg.com/vi/VIDEO_ID/sddefault.jpg 640w,
    https://i.ytimg.com/vi/VIDEO_ID/maxresdefault.jpg 1280w
  "
  sizes="(max-width: 1024px) 100vw, 50vw"
  src="https://i.ytimg.com/vi/VIDEO_ID/sddefault.jpg"
  alt="Video thumbnail"
  loading="lazy"
  decoding="async"
/>
```

#### 4.3 Loading Strategy

```html
<!-- Above-the-fold (hero images) -->
<img loading="eager" fetchpriority="high" />

<!-- Below-the-fold -->
<img loading="lazy" decoding="async" />
```

### Expected Results
- Mobile images: -75% (200KB → 50KB)
- Tablet images: -60% (200KB → 80KB)
- Desktop: Maintained quality
- Lazy loading: Faster initial load

---

## STEP 5: SITEMAP IMPLEMENTATION

### Goal
Generate SEO-ready sitemap with i18n support.

### Implementation

#### 5.1 Install Sitemap Plugin

```bash
npm install @astrojs/sitemap
```

#### 5.2 Configure Sitemap

**astro.config.mjs:**
```javascript
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://yoursite.com',  // REQUIRED

  integrations: [
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: {
          en: 'en',
          // Add other languages
        },
      },
    }),
  ],
});
```

#### 5.3 Ensure Pages are Prerendered

**Add to all page files:**
```astro
---
export const prerender = true;
// ... rest of your code
---
```

#### 5.4 Create /sitemap.xml Redirect

**src/pages/sitemap.xml.ts:**
```typescript
// Redirect /sitemap.xml to /sitemap-index.xml
export const prerender = false;

export async function GET({ site }) {
  return new Response(null, {
    status: 301,
    headers: {
      'Location': new URL('/sitemap-index.xml', site).href,
    }
  });
}
```

#### 5.5 Add Cloudflare Fallback

**public/_redirects:**
```
/sitemap.xml /sitemap-index.xml 301
```

#### 5.6 Update robots.txt

**public/robots.txt:**
```
User-agent: *
Allow: /

Sitemap: https://yoursite.com/sitemap-index.xml
```

### Verification
```bash
npm run build
ls -lh dist/sitemap*.xml
```

Expected output:
- `sitemap-index.xml` (main file)
- `sitemap-0.xml` (contains URLs)

---

## STEP 6: BUILD AND VERIFY

### Build Commands
```bash
# Clean build
rm -rf dist/
npm run build

# Verify optimizations
echo "=== CSS Check (should be 0) ==="
grep -o '<link rel="stylesheet"' dist/index.html | wc -l

echo "=== JS Size ==="
du -ch dist/_astro/*.js | tail -1

echo "=== HTML Size ==="
wc -c dist/index.html

echo "=== Gzipped Size ==="
gzip -c dist/index.html | wc -c | awk '{printf "%.1f KB\n", $1/1024}'

echo "=== Sitemap ==="
ls -lh dist/sitemap*.xml
```

---

## CHECKLIST

### Pre-Optimization
- [ ] Run PageSpeed Insights baseline test
- [ ] Note current Lighthouse score
- [ ] Backup current branch

### Font Optimization
- [ ] Install variable font package (dev)
- [ ] Copy font files to public/fonts/
- [ ] Remove @import from global.css
- [ ] Add inline @font-face with font-display: swap
- [ ] Use system fonts for body text
- [ ] Add font preload in Layout.astro
- [ ] Remove old @fontsource packages
- [ ] Test font rendering

### CSS Optimization
- [ ] Install astro-critters
- [ ] Configure Critters in astro.config.mjs
- [ ] Set inlineStylesheets: 'always'
- [ ] Build and verify 0 external CSS files
- [ ] Check gzipped HTML size

### JavaScript Optimization
- [ ] Identify non-critical animations
- [ ] Remove or simplify animations
- [ ] Keep business-critical scripts
- [ ] Verify GTM/analytics still work
- [ ] Test mobile menu functionality
- [ ] Check conversion tracking

### Image Optimization
- [ ] Use Astro Image for local images
- [ ] Add responsive srcset for external images
- [ ] Implement lazy loading strategy
- [ ] Add decoding="async" where appropriate

### Sitemap
- [ ] Install @astrojs/sitemap
- [ ] Configure with i18n if needed
- [ ] Add prerender to all pages
- [ ] Create /sitemap.xml redirect
- [ ] Add _redirects file
- [ ] Update robots.txt
- [ ] Verify sitemap generation

### Testing
- [ ] Run build without errors
- [ ] Test on local preview
- [ ] Verify all critical functions work
- [ ] Run PageSpeed Insights
- [ ] Check Lighthouse mobile score
- [ ] Test on real mobile device

---

## EXPECTED RESULTS

| Metric | Typical Before | Typical After | Improvement |
|--------|---------------|---------------|-------------|
| Fonts | 10 files, 250KB | 2 files, 65KB | -74% |
| JavaScript | 117KB | 59KB | -50% |
| CSS blocking | 1+ files | 0 files | -100% |
| Images (mobile) | 200KB | 50KB | -75% |
| Lighthouse Score | 85-90 | 95-100 | +10-15 |

**Total payload reduction: ~60-70%**

---

## COMMON MISTAKES TO AVOID

### ❌ DON'T
```javascript
// Don't use @import for fonts
@import "@fontsource/font/400.css";

// Don't skip crossorigin on font preload
<link rel="preload" href="/font.woff2" as="font" type="font/woff2" />

// Don't use inlineStylesheets: 'auto'
build: { inlineStylesheets: 'auto' }

// Don't remove GTM tracking scripts
window.dataLayer.push({ ... })  // Keep this!

// Don't preload all fonts
<link rel="preload" />  // Only critical fonts
```

### ✅ DO
```javascript
// Use inline @font-face
@font-face { src: url('/fonts/...'); font-display: swap; }

// Include crossorigin
<link rel="preload" href="/font.woff2" as="font" type="font/woff2" crossorigin />

// Always inline CSS
build: { inlineStylesheets: 'always' }

// Keep conversion tracking
window.dataLayer = window.dataLayer || [];

// Preload strategically
// Only heading font, not body (use system fonts)
```

---

## TROUBLESHOOTING

### Issue: Fonts not loading
**Solution:** Check crossorigin attribute on preload links

### Issue: CSS still external
**Solution:** Verify `inlineStylesheets: 'always'` in astro.config.mjs

### Issue: High JavaScript still
**Solution:** Remove ALL non-critical animations, not just some

### Issue: Sitemap not generating
**Solution:** Ensure `export const prerender = true` on all pages

### Issue: 403 error pushing to master
**Solution:** Use feature branch with `claude/` prefix or create PR

---

## MAINTENANCE

### When Adding New Pages
1. Add `export const prerender = true`
2. Use system fonts for body text
3. Minimize inline scripts
4. Use lazy loading for images

### When Adding Features
1. Evaluate if animation is business-critical
2. Prefer CSS animations over JavaScript
3. Test impact on bundle size
4. Re-run PageSpeed Insights

---

## ADVANCED OPTIMIZATION

### Code Splitting (if needed)
```javascript
// astro.config.mjs
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor': ['large-library'],
      }
    }
  }
}
```

### Service Worker (PWA)
```bash
npm install @vite-pwa/astro
```

### CDN Configuration
- Enable Brotli compression
- Set Cache-Control headers
- Configure image optimization

---

## SUCCESS METRICS

### Target Lighthouse Scores (Mobile)
- Performance: 95-100
- Accessibility: 100
- Best Practices: 100
- SEO: 100

### Core Web Vitals
- LCP: < 2.5s
- FID: < 100ms
- CLS: < 0.1

### Bundle Sizes
- HTML (gzipped): < 50KB
- JavaScript: < 100KB
- CSS: Inline (no external)
- Fonts: < 100KB total

---

## RESOURCES

- [Astro Docs - Image Optimization](https://docs.astro.build/en/guides/images/)
- [web.dev - Font Loading](https://web.dev/font-best-practices/)
- [Critters Documentation](https://github.com/GoogleChromeLabs/critters)
- [PageSpeed Insights](https://pagespeed.web.dev/)

---

## VERSION HISTORY

- v1.0 (2026-01): Initial skill based on Beautyflow optimization session
  - Font optimization with variable fonts
  - CSS inline strategy
  - JavaScript reduction techniques
  - Image optimization
  - Sitemap implementation
