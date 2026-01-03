# Astro Performance Optimization Skill
**Version:** 1.0  
**Author:** Based on Beautyflow.pro optimization session  
**Last Updated:** 2026-01  
**License:** MIT - Free to use and modify

---

## 🎯 OVERVIEW

Complete performance optimization guide for Astro websites targeting **95-100 Lighthouse mobile scores**.

### What This Skill Does
- ✅ Reduces font payload by 70-80%
- ✅ Eliminates ALL render-blocking CSS
- ✅ Reduces JavaScript by 50%+
- ✅ Optimizes images for responsive delivery
- ✅ Implements SEO-ready sitemap with i18n
- ✅ Achieves 95-100 Lighthouse mobile score

### Expected Results
| Metric | Typical Improvement |
|--------|---------------------|
| Font payload | -74% (250KB → 65KB) |
| JavaScript | -50% (117KB → 59KB) |
| CSS blocking | -100% (eliminated) |
| Images (mobile) | -75% (200KB → 50KB) |
| Lighthouse Score | +10-15 points (→ 95-100) |

---

## 📋 WHEN TO USE

Use this skill when you encounter:
- PageSpeed Insights performance issues
- Mobile Lighthouse score below 90
- Render-blocking resources warnings
- Large JavaScript bundles (>100KB)
- Font loading delays
- Missing or misconfigured sitemap

---

## ⚙️ PREREQUISITES

- Astro project (SSR or static)
- Node.js 18+ and npm
- Basic understanding of web performance
- Access to project source code

---

## 🚀 IMPLEMENTATION GUIDE

---

### STEP 1: FONT OPTIMIZATION

**Goal:** Reduce font payload by 70-80% and eliminate render-blocking requests.

#### 1.1 Switch to Variable Fonts

Install variable font package (dev dependency only):
```bash
npm install -D @fontsource-variable/[your-font-name]
# Example: npm install -D @fontsource-variable/cormorant
```

Copy font files to public directory:
```bash
mkdir -p public/fonts
cp node_modules/@fontsource-variable/[font-name]/files/*-wght-normal.woff2 public/fonts/
```

You'll need:
- `[font]-latin-wght-normal.woff2` (basic Latin characters)
- `[font]-latin-ext-wght-normal.woff2` (accented characters: áéíóöőúüű)

#### 1.2 Update global.css

**Remove all @import statements:**
```css
/* ❌ DELETE these - they cause render-blocking */
@import "@fontsource/font-name/400.css";
@import "@fontsource/font-name/700.css";
/* ... delete all font imports */
```

**Add inline @font-face:**
```css
@import "tailwindcss";

/* Variable font - Latin subset */
@font-face {
  font-family: 'YourFont';
  src: url('/fonts/your-font-latin-wght-normal.woff2') format('woff2');
  font-weight: 300 700;  /* Variable: all weights in ONE file */
  font-style: normal;
  font-display: swap;    /* CRITICAL: show text immediately with fallback */
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}

/* Variable font - Latin Extended (accented: áéíóöőúüű etc.) */
@font-face {
  font-family: 'YourFont';
  src: url('/fonts/your-font-latin-ext-wght-normal.woff2') format('woff2');
  font-weight: 300 700;
  font-style: normal;
  font-display: swap;
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}

@theme {
  /* System font stack - INSTANT RENDER, ZERO DOWNLOAD */
  --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;

  /* Custom font only for headings - single file, all weights */
  --font-heading: "YourFont", Georgia, serif;
}

@layer base {
  html {
    font-family: var(--font-sans);  /* Body uses system fonts */
  }

  h1, h2, h3, h4, h5, h6 {
    font-family: var(--font-heading);  /* Headings use custom font */
  }
}
```

#### 1.3 Add Font Preload

**In src/layouts/Layout.astro:**
```astro
<head>
  <meta charset="UTF-8" />
  <!-- ... other meta tags ... -->

  <!-- 
    Font preload: Custom font for headings ONLY
    Body uses system fonts (no preload needed)
    CRITICAL: crossorigin attribute is REQUIRED for fonts
  -->
  <link 
    rel="preload" 
    href="/fonts/your-font-latin-wght-normal.woff2" 
    as="font" 
    type="font/woff2" 
    crossorigin 
  />
  <link 
    rel="preload" 
    href="/fonts/your-font-latin-ext-wght-normal.woff2" 
    as="font" 
    type="font/woff2" 
    crossorigin 
  />
</head>
```

**⚠️ CRITICAL:** `crossorigin` attribute is REQUIRED for font preload to work!

#### 1.4 Clean Up Dependencies

```bash
# Remove old font packages
npm uninstall @fontsource/old-font @fontsource/another-font
```

**✅ Font Optimization Complete**

---

### STEP 2: CSS OPTIMIZATION

**Goal:** Inline ALL CSS to eliminate external stylesheets and render-blocking.

#### 2.1 Install Critters

```bash
npm install astro-critters
```

#### 2.2 Configure Astro Build

**In astro.config.mjs:**
```javascript
import { defineConfig } from 'astro/config';
import critters from 'astro-critters';

export default defineConfig({
  integrations: [
    critters({
      Critters: {
        preload: 'media',        // Preload non-critical CSS with media query trick
        inlineFonts: false,      // Don't inline fonts (we preload manually)
        preloadFonts: false,     // Don't auto-preload fonts (we control this)
        pruneSource: true,       // Remove inlined CSS from external files
        mergeStylesheets: false, // Keep separate for better caching
      }
    })
  ],

  build: {
    inlineStylesheets: 'always',  // 🔥 CRITICAL: Inline ALL CSS
  },
});
```

#### 2.3 Verify After Build

```bash
npm run build

# Check for external CSS (should be 0)
grep -o '<link rel="stylesheet"' dist/index.html | wc -l

# Check inline CSS (should be 1+)
grep -o '<style' dist/index.html | wc -l

# Check gzipped HTML size
gzip -c dist/index.html | wc -c | awk '{printf "%.1f KB\n", $1/1024}'
```

**✅ CSS Optimization Complete**

---

### STEP 3: JAVASCRIPT OPTIMIZATION

**Goal:** Reduce JavaScript by 50%+ by removing non-critical animations.

#### 3.1 Identify Non-Critical Code

**❌ Remove these (NOT business critical):**
- Rating number animations (IntersectionObserver + requestAnimationFrame)
- Scroll-triggered card reveals
- Number counter animations
- Decorative fade-ins and transitions
- Parallax effects

**✅ Keep these (BUSINESS critical):**
- Mobile menu toggle
- Form functionality
- Conversion tracking (GTM, dataLayer)
- CTA buttons and interactions
- Payment/checkout flows

#### 3.2 Replace Animations with Simple Display

**BEFORE (52 lines of unnecessary code):**
```javascript
<script>
  function initRatingAnimation() {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ratingElements = document.querySelectorAll('.rating-number');

    if (prefersReducedMotion) {
      ratingElements.forEach(el => {
        el.textContent = el.getAttribute('data-target') || '5.0';
      });
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const target = parseFloat(el.getAttribute('data-target') || '5.0');
          animateRating(el, target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    ratingElements.forEach(el => observer.observe(el));
  }

  function animateRating(element, target) {
    const duration = 1500;
    const start = 1;
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = start + (target - start) * easeOut;

      element.textContent = current.toFixed(1);

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }

    requestAnimationFrame(update);
  }

  document.addEventListener('DOMContentLoaded', initRatingAnimation);
  document.addEventListener('astro:page-load', initRatingAnimation);
</script>
```

**AFTER (3 lines, same result):**
```javascript
<script>
  // Show rating immediately without animation
  document.querySelectorAll('.rating-number').forEach(el => {
    el.textContent = el.getAttribute('data-target') || '5.0';
  });
</script>
```

#### 3.3 Preserve Critical Functions

**Example of what to KEEP:**

```javascript
// ✅ Mobile menu (UX critical)
function openMobileMenu() {
  mobileMenu?.classList.remove('translate-x-full');
  mobileMenu?.classList.add('translate-x-0');
  document.body.style.overflow = 'hidden';
}

// ✅ GTM tracking (conversion critical)
whatsappBtn.addEventListener('click', () => {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: 'whatsapp_click',
    click_location: 'floating_button'
  });
});

// ✅ Delayed CTA (business critical)
setTimeout(() => {
  ctaBar.classList.add('show');
}, 10000);
```

**✅ JavaScript Optimization Complete**

---

### STEP 4: IMAGE OPTIMIZATION

**Goal:** Reduce image payload with responsive images.

#### 4.1 Local Images (Astro Image Component)

```astro
---
import { Image } from 'astro:assets';
import heroImage from '../assets/hero.jpg';
---

<Image
  src={heroImage}
  alt="Hero image description"
  widths={[320, 640, 960, 1280]}
  sizes="(max-width: 1024px) 100vw, 50vw"
  loading="eager"
  fetchpriority="high"
  decoding="async"
/>
```

#### 4.2 YouTube Thumbnails (External URLs)

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
<!-- Above-the-fold images -->
<img loading="eager" fetchpriority="high" />

<!-- Below-the-fold images -->
<img loading="lazy" decoding="async" />
```

**✅ Image Optimization Complete**

---

### STEP 5: SITEMAP IMPLEMENTATION

**Goal:** Generate SEO-ready sitemap with i18n support.

#### 5.1 Install Plugin

```bash
npm install @astrojs/sitemap
```

#### 5.2 Configure Sitemap

**In astro.config.mjs:**
```javascript
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://yoursite.com',  // REQUIRED: your domain

  integrations: [
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: {
          en: 'en',
          hu: 'hu',  // Add your languages
        },
      },
    }),
  ],
});
```

#### 5.3 Add Prerender to Pages

**Add to ALL page files:**
```astro
---
export const prerender = true;  // Required for sitemap generation
// ... rest of your page code
---
```

#### 5.4 Create /sitemap.xml Redirect

**Create src/pages/sitemap.xml.ts:**
```typescript
// Redirect /sitemap.xml to /sitemap-index.xml
// Dynamic endpoint (not prerendered) for proper 301 redirect
export const prerender = false;

export async function GET({ site }) {
  const sitemapIndexUrl = new URL('/sitemap-index.xml', site || 'https://yoursite.com');

  return new Response(null, {
    status: 301,
    headers: {
      'Location': sitemapIndexUrl.href,
    }
  });
}
```

#### 5.5 Add Cloudflare Fallback

**Create public/_redirects:**
```
/sitemap.xml /sitemap-index.xml 301
```

#### 5.6 Update robots.txt

**Update public/robots.txt:**
```
User-agent: *
Allow: /

Sitemap: https://yoursite.com/sitemap-index.xml
```

#### 5.7 Verify Sitemap

```bash
npm run build
ls -lh dist/sitemap*.xml
```

Expected files:
- `sitemap-index.xml` (main sitemap)
- `sitemap-0.xml` (contains URLs)

**✅ Sitemap Complete**

---

## 📋 COMPLETE CHECKLIST

### Pre-Optimization
- [ ] Run baseline PageSpeed Insights test
- [ ] Note current Lighthouse mobile score
- [ ] Create feature branch for changes
- [ ] Backup current configuration

### Font Optimization
- [ ] Install variable font package (dev dependency)
- [ ] Copy font files to public/fonts/
- [ ] Remove ALL @import statements from CSS
- [ ] Add inline @font-face with font-display: swap
- [ ] Configure system fonts for body text
- [ ] Add font preload links with crossorigin
- [ ] Remove old @fontsource packages
- [ ] Build and test font rendering

### CSS Optimization
- [ ] Install astro-critters package
- [ ] Configure Critters in astro.config.mjs
- [ ] Set inlineStylesheets: 'always'
- [ ] Build project
- [ ] Verify 0 external CSS files
- [ ] Check gzipped HTML size is reasonable

### JavaScript Optimization
- [ ] Identify all animations and interactions
- [ ] Mark business-critical vs decorative
- [ ] Remove/simplify non-critical animations
- [ ] Test GTM/analytics still functioning
- [ ] Test mobile menu functionality
- [ ] Verify conversion tracking works
- [ ] Check JavaScript bundle size reduction

### Image Optimization
- [ ] Use Astro Image for local images
- [ ] Add responsive srcset for external images
- [ ] Implement proper loading strategy
- [ ] Add decoding="async" where appropriate
- [ ] Test image loading on mobile/desktop

### Sitemap
- [ ] Install @astrojs/sitemap
- [ ] Configure with site URL
- [ ] Add i18n configuration if multilingual
- [ ] Add prerender to all pages
- [ ] Create sitemap.xml redirect endpoint
- [ ] Add _redirects file for Cloudflare
- [ ] Update robots.txt
- [ ] Build and verify sitemap files

### Final Testing
- [ ] Run full build without errors
- [ ] Test on local preview server
- [ ] Verify all critical functionality works
- [ ] Run PageSpeed Insights
- [ ] Check Lighthouse mobile score
- [ ] Test on real mobile device
- [ ] Verify GTM events firing
- [ ] Check sitemap in browser

---

## 🎯 EXPECTED RESULTS

### Typical Performance Gains

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| **Fonts** | 10 files, 250KB | 2 files, 65KB | **-74%** |
| **JavaScript** | 117KB | 59KB | **-50%** |
| **CSS (external)** | 1+ files | 0 files | **-100%** |
| **Images (mobile)** | 200KB | 50KB | **-75%** |
| **Total Payload** | ~600KB | ~200KB | **-66%** |
| **Lighthouse Score** | 85-90 | 95-100 | **+10-15** |

### HTML Size Impact
- Uncompressed: 50KB → 170KB (+240%)
- Gzipped: 15KB → 25KB (+67%)
- **This is acceptable** - gzip compression is excellent on inline CSS/JS

### Core Web Vitals
- **LCP**: Improved (no render-blocking CSS, optimized fonts)
- **FID**: Improved (50% less JavaScript)
- **CLS**: Maintained (no layout changes)

---

## ⚠️ COMMON MISTAKES

### ❌ DON'T DO THIS

```javascript
// ❌ Don't use @import for fonts (render-blocking)
@import "@fontsource/font/400.css";

// ❌ Don't forget crossorigin on font preload
<link rel="preload" href="/font.woff2" as="font" type="font/woff2" />

// ❌ Don't use inlineStylesheets: 'auto'
build: { inlineStylesheets: 'auto' }

// ❌ Don't remove GTM/analytics tracking
// window.dataLayer.push({ ... })  // Keep this!

// ❌ Don't preload ALL fonts
<link rel="preload" />  // Only critical fonts!

// ❌ Don't remove business-critical scripts
function checkout() { ... }  // Keep payment flows!
```

### ✅ DO THIS INSTEAD

```javascript
// ✅ Use inline @font-face
@font-face { 
  src: url('/fonts/...'); 
  font-display: swap;  // Always include this!
}

// ✅ Always include crossorigin for fonts
<link rel="preload" href="/font.woff2" as="font" type="font/woff2" crossorigin />

// ✅ Always inline CSS for maximum performance
build: { inlineStylesheets: 'always' }

// ✅ Keep conversion tracking intact
window.dataLayer = window.dataLayer || [];
window.dataLayer.push({ event: 'conversion' });

// ✅ Preload strategically (headings only, not body)
<link rel="preload" href="/heading-font.woff2" ... />
<!-- Body uses system fonts - no preload needed -->

// ✅ Keep business-critical functionality
// Mobile menu, forms, checkout, analytics
```

---

## 🔧 TROUBLESHOOTING

### Issue: Fonts not loading

**Symptoms:** Custom fonts not appearing, fallback fonts shown

**Solutions:**
1. Check `crossorigin` attribute on preload links
2. Verify font files are in `public/fonts/` directory
3. Check browser console for CORS errors
4. Ensure font-display: swap is set

### Issue: CSS still external after build

**Symptoms:** `<link rel="stylesheet">` still in HTML

**Solutions:**
1. Verify `inlineStylesheets: 'always'` in astro.config.mjs
2. Clear dist/ folder and rebuild
3. Check Critters is installed and configured

### Issue: JavaScript bundle still large

**Symptoms:** >100KB JavaScript after optimization

**Solutions:**
1. Ensure you removed ALL non-critical animations
2. Check for unused libraries in package.json
3. Use build analysis: `npm run build -- --verbose`

### Issue: Sitemap not generating

**Symptoms:** No sitemap-*.xml files in dist/

**Solutions:**
1. Add `export const prerender = true` to all pages
2. Verify `site` is configured in astro.config.mjs
3. Check build logs for errors

### Issue: 403 error when pushing to master

**Symptoms:** Git push rejected with HTTP 403

**Solutions:**
1. Push to feature branch with `claude/` prefix
2. Create Pull Request on GitHub
3. Don't push directly to master/main

---

## 🚀 DEPLOYMENT CHECKLIST

### Before Deploy
- [ ] All tests passing
- [ ] Build completes without errors
- [ ] Local preview looks correct
- [ ] Lighthouse score 95+ on local

### After Deploy
- [ ] Run PageSpeed Insights on production URL
- [ ] Verify Lighthouse mobile score 95-100
- [ ] Test sitemap: https://yoursite.com/sitemap-index.xml
- [ ] Submit sitemap to Google Search Console
- [ ] Monitor Core Web Vitals in GA4
- [ ] Test on real mobile devices
- [ ] Verify GTM events in preview mode

---

## 📚 RESOURCES

### Official Documentation
- [Astro Docs - Images](https://docs.astro.build/en/guides/images/)
- [Astro Docs - Performance](https://docs.astro.build/en/guides/performance/)
- [Critters GitHub](https://github.com/GoogleChromeLabs/critters)

### Performance Tools
- [PageSpeed Insights](https://pagespeed.web.dev/)
- [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci)
- [WebPageTest](https://www.webpagetest.org/)

### Learning Resources
- [web.dev - Font Best Practices](https://web.dev/font-best-practices/)
- [web.dev - Optimize CSS](https://web.dev/extract-critical-css/)
- [web.dev - Optimize JavaScript](https://web.dev/reduce-javascript-payloads/)

---

## 📝 MAINTENANCE

### When Adding New Pages
1. Always add `export const prerender = true`
2. Use system fonts for body text
3. Minimize inline scripts
4. Use lazy loading for images below-the-fold

### When Adding Features
1. Evaluate: Is this animation business-critical?
2. Prefer CSS animations over JavaScript when possible
3. Test bundle size impact after adding features
4. Re-run PageSpeed Insights after changes

### Regular Audits
- Monthly: Run PageSpeed Insights
- Quarterly: Review JavaScript bundle size
- Bi-annually: Check for outdated dependencies
- Yearly: Full performance audit

---

## 📄 LICENSE

MIT License - Free to use, modify, and distribute.

Created based on real-world optimization of Beautyflow.pro achieving 95-100 Lighthouse mobile scores.

---

## 📧 SUPPORT

For questions or issues with this skill:
1. Check troubleshooting section above
2. Review Astro documentation
3. Test in isolation (new Astro project)
4. Check browser console for errors

---

## 📊 VERSION HISTORY

**v1.0 (January 2026)**
- Initial release
- Font optimization with variable fonts
- CSS inline strategy with Critters
- JavaScript reduction techniques
- Image optimization with responsive srcset
- Sitemap implementation with i18n
- Complete checklist and troubleshooting

---

## 🎉 SUCCESS STORY

This skill is based on the optimization of **Beautyflow.pro**, achieving:

- **Font payload:** 250KB → 65KB (-74%)
- **JavaScript:** 117KB → 59KB (-50%)
- **CSS blocking:** Eliminated completely
- **Lighthouse mobile:** 85-90 → 95-100
- **Total payload reduction:** ~393KB (-66%)

**Time to implement:** 2-4 hours for experienced developer

**Maintenance:** Minimal - optimizations are permanent

---

**END OF SKILL**

Copy this entire document to your `.claude/skills/` directory and reference it in Claude Code conversations!
