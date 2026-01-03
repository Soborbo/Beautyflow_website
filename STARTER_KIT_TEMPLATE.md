# Beautyflow Starter Kit - Új Projektekhez

Ez a dokumentum összefoglalja azokat a komponenseket, konfigurációkat és optimalizációkat, amelyeket érdemes **rögtön az első pillanattól** átvenni új projektekbe.

---

## 1. ASTRO KONFIGURÁCIÓ (astro.config.mjs)

### Kötelező Pluginek

```javascript
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import critters from 'astro-critters';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://your-domain.com',

  // Multi-language sitemap
  integrations: [
    sitemap({
      i18n: {
        defaultLocale: 'hu',
        locales: { hu: 'hu-HU', en: 'en-US' },
      },
    }),
    // Critical CSS inlining - HUGE performance boost
    critters({
      preload: 'media',
      pruneSource: true,
      mergeStylesheets: false,
    }),
  ],

  // Tailwind Vite plugin
  vite: {
    plugins: [tailwindcss()],
  },

  // CSS inlining
  build: {
    inlineStylesheets: 'always',
  },

  // i18n routing
  i18n: {
    defaultLocale: 'hu',
    locales: ['hu', 'en'],
    routing: { prefixDefaultLocale: false },
  },

  // Cloudflare adapter
  adapter: cloudflare({
    imageService: 'compile',
    routes: { strategy: 'include', include: ['/*'], exclude: ['/fonts/*', '/images/*'] },
  }),
});
```

### NPM Dependenciák

```json
{
  "dependencies": {
    "@astrojs/cloudflare": "^12.6.12",
    "@astrojs/sitemap": "^3.6.0",
    "astro": "^5.7.13",
    "astro-critters": "^2.2.1"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.1.17",
    "tailwindcss": "^4.1.17"
  }
}
```

---

## 2. FONT OPTIMALIZÁCIÓ (src/styles/global.css)

### A rendszer:
- **Body**: System font stack (0 KB letöltés, instant render)
- **Heading**: 1 db Variable font (minden súly egy fájlban)

```css
/* Font preload a Layout.astro <head>-ben */
<link rel="preload" href="/fonts/your-heading-font.woff2" as="font" type="font/woff2" crossorigin />

/* global.css */
@font-face {
  font-family: 'HeadingFont';
  src: url('/fonts/your-heading-font.woff2') format('woff2');
  font-weight: 300 700; /* Variable font range */
  font-style: normal;
  font-display: swap;
}

:root {
  --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-heading: "HeadingFont", Georgia, serif;
}

body {
  font-family: var(--font-sans);
}

h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-heading);
}
```

---

## 3. RESPONSIVE IMAGE KOMPONENSEK (src/components/images/)

### Viewport-alapú Image System

| Komponens | Szélesség | Használat |
|-----------|-----------|-----------|
| `HeroImage` | 100vw | Full-width hero |
| `ContentImage` | 50vw | 50/50 split layout |
| `CardImage` | 33vw | 3 oszlopos grid |
| `QuarterImage` | 25vw | 4 oszlopos grid |
| `FixedImage` | px | Avatar, ikon |

### Alap konfiguráció minden image komponenshez:

```astro
---
// BaseImage.astro példa
import { Image } from 'astro:assets';

interface Props {
  src: ImageMetadata;
  alt: string;
  loading?: 'lazy' | 'eager';
  fetchpriority?: 'high' | 'low' | 'auto';
}

const { src, alt, loading = 'lazy', fetchpriority = 'auto' } = Astro.props;
---

<Image
  src={src}
  alt={alt}
  widths={[320, 480, 640, 960, 1280, 1600]}
  sizes="(min-width: 1024px) 50vw, 100vw"
  formats={['avif', 'webp', 'jpg']}
  quality={60}
  loading={loading}
  decoding="async"
  fetchpriority={fetchpriority}
/>
```

### LCP Tracker (fejlesztői segédeszköz)

```astro
<!-- Csak dev módban mutatja, ha több kép van fetchpriority="high"-al -->
{import.meta.env.DEV && <LCPTracker />}
```

---

## 4. CTA KOMPONENSEK

### 4.1 StickyMobileCTA (alsó ragadós sáv mobilon)

**Fájl**: `src/components/StickyMobileCTA.astro`

```astro
---
const { lang = 'hu' } = Astro.props;
const labels = {
  hu: { call: 'Hívás', callback: 'Visszahívást kérek' },
  en: { call: 'Call Now', callback: 'Request Callback' }
};
const t = labels[lang];
---

<div
  id="sticky-cta"
  class="fixed bottom-0 left-0 right-0 z-50 lg:hidden translate-y-full transition-transform duration-300"
>
  <div class="bg-white shadow-lg border-t border-gray-200 px-4 py-3">
    <div class="flex gap-3 max-w-lg mx-auto">
      <a href="tel:+36123456789" class="btn btn-outline flex-1 text-center">
        {t.call}
      </a>
      <a href="/kapcsolat" class="btn btn-primary flex-1 text-center">
        {t.callback}
      </a>
    </div>
  </div>
</div>

<script>
  let shown = false;
  const cta = document.getElementById('sticky-cta');

  const showCTA = () => {
    if (!shown && cta) {
      cta.classList.remove('translate-y-full');
      shown = true;
    }
  };

  // Megjelenik 10 mp görgetés után
  let scrollTime = 0;
  let scrollTimer: number;

  window.addEventListener('scroll', () => {
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => {
      scrollTime += 500;
      if (scrollTime >= 10000) showCTA();
    }, 500);
  }, { passive: true });
</script>
```

### 4.2 WhatsApp Floating Button

**Fájl**: `src/components/WhatsAppButton.astro`

```astro
<a
  id="whatsapp-btn"
  href="https://wa.me/36123456789"
  target="_blank"
  rel="noopener"
  class="fixed bottom-6 right-6 z-40 hidden lg:block opacity-0 transition-opacity duration-300"
  aria-label="WhatsApp"
>
  <div class="bg-[#25D366] p-3 rounded-full shadow-lg hover:scale-110 transition-transform">
    <!-- WhatsApp SVG icon -->
  </div>
</a>

<script>
  setTimeout(() => {
    const btn = document.getElementById('whatsapp-btn');
    if (btn) btn.classList.replace('opacity-0', 'opacity-100');
  }, 6000);
</script>
```

### 4.3 Consultation Section (pink CTA blokk)

```astro
<section class="bg-[#c53f75] py-16">
  <div class="container">
    <div class="bg-white rounded-2xl p-8 lg:p-12 grid lg:grid-cols-2 gap-8">
      <!-- Bal oldal: kép -->
      <div class="relative">
        <ContentImage src={consultantPhoto} alt="..." />
        <div class="absolute bottom-4 left-4 bg-white/90 px-4 py-2 rounded">
          <span class="font-heading font-semibold">Név</span>
        </div>
      </div>

      <!-- Jobb oldal: tartalom -->
      <div>
        <h2>Ingyenes konzultáció</h2>
        <ul class="space-y-2 my-6">
          <li class="flex items-start gap-2">
            <span class="text-green-500">✓</span>
            <span>Előny 1</span>
          </li>
          <!-- ... -->
        </ul>
        <div class="flex flex-col sm:flex-row gap-4">
          <a href="tel:..." class="btn btn-outline">Hívjon most</a>
          <a href="/konzultacio" class="btn btn-primary">Időpontfoglalás</a>
        </div>
      </div>
    </div>
  </div>
</section>
```

---

## 5. TRACKING LIBRARY (src/lib/tracking/)

### Fájl struktúra:

```
src/lib/tracking/
├── index.ts      # Unified export
├── gtm.ts        # Google Tag Manager
├── gclid.ts      # GCLID/UTM persistence
├── dataLayer.ts  # GA4 Enhanced Conversions
├── zaraz.ts      # Meta CAPI (Cloudflare)
└── consent.ts    # CookieYes integration
```

### 5.1 GTM Events (gtm.ts)

```typescript
declare global {
  interface Window {
    dataLayer: Record<string, unknown>[];
  }
}

export const pushEvent = (event: string, data: Record<string, unknown> = {}) => {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...data });
};

export const trackCTAClick = (location: string, text: string) => {
  pushEvent('cta_click', { cta_location: location, cta_text: text });
};

export const trackPhoneClick = (phone: string) => {
  pushEvent('phone_click', { phone_number: phone });
};

export const trackFormSubmit = (formName: string) => {
  pushEvent('form_submit', { form_name: formName });
};
```

### 5.2 GCLID Persistence (gclid.ts)

```typescript
const STORAGE_KEY = 'bf_gclid_data';
const EXPIRY_DAYS = 90;

interface GCLIDData {
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  fbclid?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  landing_page?: string;
  timestamp: number;
}

export const captureGCLID = () => {
  const params = new URLSearchParams(window.location.search);
  const data: GCLIDData = {
    gclid: params.get('gclid') || undefined,
    gbraid: params.get('gbraid') || undefined,
    wbraid: params.get('wbraid') || undefined,
    fbclid: params.get('fbclid') || undefined,
    utm_source: params.get('utm_source') || undefined,
    utm_medium: params.get('utm_medium') || undefined,
    utm_campaign: params.get('utm_campaign') || undefined,
    landing_page: window.location.pathname,
    timestamp: Date.now(),
  };

  // Csak mentjük, ha van új adat
  if (data.gclid || data.fbclid || data.utm_source) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
};

export const getStoredGCLID = (): GCLIDData | null => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;

  const data = JSON.parse(stored) as GCLIDData;
  const expiryMs = EXPIRY_DAYS * 24 * 60 * 60 * 1000;

  if (Date.now() - data.timestamp > expiryMs) {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }

  return data;
};
```

### 5.3 Consent Management (consent.ts)

```typescript
type ConsentCategory = 'analytics' | 'marketing' | 'functional' | 'necessary';

export const hasConsent = (category: ConsentCategory): boolean => {
  // Dev módban mindig true
  if (import.meta.env.DEV) return true;

  // CookieYes check
  if (typeof window !== 'undefined' && window.getCkyConsent) {
    return window.getCkyConsent().categories[category] === true;
  }

  return false;
};

export const waitForConsent = (category: ConsentCategory): Promise<boolean> => {
  return new Promise((resolve) => {
    if (hasConsent(category)) {
      resolve(true);
      return;
    }

    document.addEventListener('cookieyes_consent_update', () => {
      resolve(hasConsent(category));
    }, { once: true });

    // Timeout after 5s
    setTimeout(() => resolve(false), 5000);
  });
};
```

### 5.4 Unified Tracking (index.ts)

```typescript
import { pushEvent } from './gtm';
import { trackMetaLead } from './zaraz';
import { hasConsent } from './consent';
import { getStoredGCLID } from './gclid';

interface ConversionData {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  value?: number;
  currency?: string;
}

export const trackFullConversion = async (data: ConversionData) => {
  const gclidData = getStoredGCLID();

  // GTM (GA4 + Google Ads)
  if (hasConsent('analytics')) {
    pushEvent('generate_lead', {
      ...data,
      gclid: gclidData?.gclid,
      traffic_source: gclidData?.utm_source,
    });
  }

  // Meta CAPI
  if (hasConsent('marketing')) {
    trackMetaLead({
      email: data.email,
      phone: data.phone,
      value: data.value,
      currency: data.currency || 'HUF',
    });
  }
};
```

---

## 6. i18n RENDSZER (src/i18n/)

### 6.1 Struktúra

```
src/i18n/
├── index.ts   # Exports
├── ui.ts      # Translation strings
└── utils.ts   # Helper functions
```

### 6.2 Translation Strings (ui.ts)

```typescript
export const languages = {
  hu: 'Magyar',
  en: 'English',
} as const;

export const defaultLang = 'hu';

export const ui = {
  hu: {
    'nav.home': 'Főoldal',
    'nav.services': 'Szolgáltatások',
    'nav.contact': 'Kapcsolat',
    'cta.bookNow': 'Foglaljon időpontot',
    'cta.callUs': 'Hívjon minket',
    'meta.siteName': 'Cégnév',
    // ...
  },
  en: {
    'nav.home': 'Home',
    'nav.services': 'Services',
    'nav.contact': 'Contact',
    'cta.bookNow': 'Book Now',
    'cta.callUs': 'Call Us',
    'meta.siteName': 'Company Name',
    // ...
  },
} as const;
```

### 6.3 Route Mappings (utils.ts)

```typescript
import { defaultLang, ui } from './ui';

// Bidirectional route mapping
export const routeMap: Record<string, string> = {
  // hu -> en
  '/szolgaltatasok': '/en/services',
  '/kapcsolat': '/en/contact',
  '/rolunk': '/en/about',
  // en -> hu
  '/en/services': '/szolgaltatasok',
  '/en/contact': '/kapcsolat',
  '/en/about': '/rolunk',
};

export const getLangFromUrl = (url: URL): 'hu' | 'en' => {
  const path = url.pathname;
  if (path.startsWith('/en')) return 'en';
  return 'hu';
};

export const useTranslations = (lang: 'hu' | 'en') => {
  return (key: keyof typeof ui['hu']): string => {
    return ui[lang][key] || ui[defaultLang][key] || key;
  };
};

export const getAlternateRoute = (currentPath: string, targetLang: 'hu' | 'en'): string => {
  // Keresés a route map-ben
  const mapped = routeMap[currentPath];
  if (mapped) return mapped;

  // Fallback: prefix hozzáadás/eltávolítás
  if (targetLang === 'en' && !currentPath.startsWith('/en')) {
    return `/en${currentPath}`;
  }
  if (targetLang === 'hu' && currentPath.startsWith('/en')) {
    return currentPath.replace('/en', '') || '/';
  }

  return currentPath;
};
```

---

## 7. SEO KOMPONENSEK

### 7.1 Layout Meta Tags (Layout.astro)

```astro
---
interface Props {
  title: string;
  description?: string;
  ogImage?: string;
  noindex?: boolean;
}

const { title, description, ogImage, noindex = false } = Astro.props;
const currentLang = getLangFromUrl(Astro.url);
const canonicalURL = new URL(Astro.url.pathname, Astro.site);
const alternateRoute = getAlternateRoute(Astro.url.pathname, currentLang === 'hu' ? 'en' : 'hu');
---

<html lang={currentLang}>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <title>{title}</title>
  <meta name="description" content={description} />

  <!-- Canonical -->
  <link rel="canonical" href={canonicalURL} />

  <!-- Hreflang -->
  <link rel="alternate" hreflang="hu" href={new URL(currentLang === 'hu' ? Astro.url.pathname : alternateRoute, Astro.site)} />
  <link rel="alternate" hreflang="en" href={new URL(currentLang === 'en' ? Astro.url.pathname : alternateRoute, Astro.site)} />
  <link rel="alternate" hreflang="x-default" href={new URL(currentLang === 'hu' ? Astro.url.pathname : alternateRoute, Astro.site)} />

  <!-- Open Graph -->
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={canonicalURL} />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content={currentLang === 'hu' ? 'hu_HU' : 'en_US'} />
  {ogImage && <meta property="og:image" content={ogImage} />}

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />

  <!-- Robots -->
  {noindex && <meta name="robots" content="noindex, nofollow" />}

  <!-- Fonts preload -->
  <link rel="preload" href="/fonts/heading-font.woff2" as="font" type="font/woff2" crossorigin />
</head>
```

### 7.2 Structured Data (JSON-LD)

```astro
<!-- index.astro vagy bármely page -->
<script type="application/ld+json" set:html={JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LocalBusiness", // vagy WebSite, Organization, stb.
  "name": "Cégnév",
  "url": "https://domain.com",
  "telephone": "+36 1 234 5678",
  "email": "info@domain.com",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Utca 123.",
    "addressLocality": "Budapest",
    "postalCode": "1234",
    "addressCountry": "HU"
  },
  "openingHoursSpecification": [
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      "opens": "09:00",
      "closes": "18:00"
    }
  ],
  "sameAs": [
    "https://www.facebook.com/cegnev",
    "https://www.instagram.com/cegnev"
  ]
})} />
```

---

## 8. FORM HANDLING (src/pages/api/contact.ts)

### Cloudflare Workers API Route

```typescript
import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  const formData = await request.formData();

  // Honeypot check
  if (formData.get('website')) {
    return new Response(JSON.stringify({ success: false }), { status: 400 });
  }

  const data = {
    name: formData.get('name') as string,
    email: formData.get('email') as string,
    phone: formData.get('phone') as string,
    message: formData.get('message') as string,
  };

  // Validation
  if (!data.name || !data.email || !data.phone) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Hiányzó mezők'
    }), { status: 400 });
  }

  try {
    // 1. Email küldés (Resend, SendGrid, stb.)
    await sendEmail(data);

    // 2. Google Sheets backup (opcionális)
    await appendToSheet(data);

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Szerverhiba'
    }), { status: 500 });
  }
};
```

---

## 9. CSS UTILITIES (global.css)

### Button Stílusok

```css
@layer components {
  .btn {
    @apply inline-flex items-center justify-center px-6 py-3 rounded-lg font-medium transition-all duration-200;
  }

  .btn-primary {
    @apply bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)];
  }

  .btn-outline {
    @apply border-2 border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white;
  }

  .btn-white {
    @apply bg-white text-[var(--color-primary)] hover:bg-gray-100;
  }
}
```

### Container & Section

```css
@layer components {
  .container {
    @apply max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8;
  }

  .section {
    @apply py-16 lg:py-24;
  }

  .section-gray {
    @apply section bg-[var(--color-gray-light)];
  }
}
```

### CSS Variables

```css
:root {
  --color-primary: #c53f75;
  --color-primary-dark: #a33460;
  --color-heading: #1e293b;
  --color-body: #334155;
  --color-gray-light: #f8f8f8;
  --color-gray-border: #e5e7eb;
}
```

---

## 10. CHECKLIST ÚJ PROJEKTHEZ

### Első nap setup:

- [ ] Astro projekt létrehozása
- [ ] `astro.config.mjs` másolása és testreszabása
- [ ] Tailwind CSS beállítása
- [ ] Font fájlok hozzáadása + preload
- [ ] `global.css` CSS változók és utilities
- [ ] Layout.astro létrehozása (meta tags, hreflang)
- [ ] Image komponensek másolása
- [ ] i18n rendszer beállítása (ha kell)

### Tracking & Analytics:

- [ ] GTM container ID beállítása
- [ ] Tracking library másolása
- [ ] GCLID capture beállítása
- [ ] CookieYes/Consent management
- [ ] Meta Pixel (Zaraz) konfiguráció

### CTA Komponensek:

- [ ] StickyMobileCTA
- [ ] WhatsAppButton (ha releváns)
- [ ] ConsultationSection
- [ ] BookingSection

### SEO:

- [ ] JSON-LD structured data
- [ ] Sitemap konfiguráció
- [ ] Robots.txt
- [ ] OG image generálás

---

## ÖSSZEFOGLALÓ: TOP 5 LEGFONTOSABB

1. **astro-critters** - Critical CSS inlining, instant FCP
2. **Image komponens rendszer** - AVIF/WebP, responsive sizes, lazy loading
3. **Font optimalizáció** - System fonts + 1 variable font preload
4. **Tracking library** - GCLID persistence, consent-aware, unified API
5. **StickyMobileCTA** - Konverziónövelő mobil CTA

Ezek együtt 90+ Lighthouse score-t és magas konverziós rátát biztosítanak az első naptól!
