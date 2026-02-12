# Blog Rendszer Specifikáció

Részletes technikai specifikáció a Beautyflow blog (Tudástár) felépítéséhez.
Célja: ugyanilyen minőségű blog reprodukálása más weboldalon.

---

## 1. Technológiai Stack

| Technológia | Szerep | Verzió |
|-------------|--------|--------|
| **Astro** | Static site generator (SSR/SSG hybrid) | 5.x |
| **Tailwind CSS** | Utility-first CSS framework | 4.x |
| **TypeScript** | Típusbiztonság | strict mode |
| **Sharp** | Szerver-oldali képoptimalizálás | — |
| **Cloudflare** | Hosting + edge adapter | — |
| **astro-critters** | Critical CSS inline | — |
| **@astrojs/sitemap** | Automatikus sitemap generálás | — |

### Telepítendő csomagok

```bash
npm install astro @astrojs/sitemap astro-critters @astrojs/cloudflare
npm install -D tailwindcss @fontsource-variable/cormorant sharp
```

---

## 2. Könyvtárstruktúra

```
src/
├── pages/
│   ├── tudastar/                          # Blog listing + cikkek (HU)
│   │   ├── index.astro                    # Blog főoldal / listing
│   │   └── [slug].astro                   # Egyedi blog cikk
│   └── en/
│       └── knowledge-base/                # Blog listing + cikkek (EN)
│           ├── index.astro
│           └── [slug].astro
├── layouts/
│   └── Layout.astro                       # Fő layout wrapper
├── components/
│   ├── Header.astro                       # Navigáció
│   ├── Footer.astro                       # Lábléc
│   ├── StickyMobileCTA.astro              # Mobil CTA gomb
│   └── images/                            # Képkomponensek
│       ├── index.ts                       # Re-export barrel file
│       ├── ContentImage.astro             # 50vw képek (cikk tartalom)
│       ├── CardImage.astro                # 33vw képek (kártya rácsok)
│       ├── HeroImage.astro                # 100vw hős képek
│       ├── FixedImage.astro               # Fix méretű képek (avatar)
│       └── LCPTracker.astro               # LCP figyelmeztetés dev-ben
├── styles/
│   └── global.css                         # Globális stílusok + @font-face
├── assets/
│   └── images/                            # Képek (NEM public/ mappába!)
│       ├── originals/                     # Nagy felbontású forrásképek
│       └── *.jpg / *.webp                 # Általános képek
└── i18n/
    ├── index.ts                           # i18n export
    └── utils.ts                           # Nyelvi segédfüggvények + route mapping
```

---

## 3. Blog Listing Oldal (index.astro)

### 3.1 Adatstruktúra

```typescript
const posts = [
  {
    title: string,          // Cikk címe
    description: string,    // SEO leírás / előnézet szöveg
    href: string,           // URL path pl. "/tudastar/slug-nev"
    category: string,       // Kategória pl. "Szőrtelenítés"
    date: string,           // Formázott dátum pl. "2025. január 15."
    readTime: string,       // Olvasási idő pl. "12 perc"
    image: ImageMetadata,   // Astro import-olt kép
    featured: boolean,      // Kiemelt cikk-e
    author: {
      name: string,         // Szerző neve
      avatar: ImageMetadata // Szerző profilképe
    }
  }
];

const meta = {
  title: string,            // Oldal <title>
  description: string       // SEO meta description
};
```

### 3.2 Oldal felépítése (fentről lefelé)

```
┌─────────────────────────────────────────────────────┐
│  HERO SECTION                                       │
│  - Breadcrumb: Főoldal / Tudástár                   │
│  - H1 cím: "Tudástár"                               │
│  - Alcím szöveg                                      │
│  - Háttér: gradient (from-[#fff9f7] to-white)        │
│  - Padding: py-16 lg:py-24                           │
├─────────────────────────────────────────────────────┤
│  KIEMELT CIKK SECTION (featured=true)               │
│  ┌────────────────┬──────────────────────┐          │
│  │  ContentImage   │  Kategória badge    │          │
│  │  16/10 arány    │  Olvasási idő      │          │
│  │  hover:scale    │  H2 cím (hover szín)│          │
│  │  "Kiemelt cikk" │  Leírás szöveg     │          │
│  │   badge         │  Szerző avatar 48px │          │
│  │                 │  Szerző név + dátum │          │
│  └────────────────┴──────────────────────┘          │
│  Layout: grid lg:grid-cols-2 gap-8                   │
├─────────────────────────────────────────────────────┤
│  ÖSSZES CIKK GRID                                    │
│  ┌──────┐ ┌──────┐ ┌──────┐                        │
│  │ Card │ │ Card │ │ Card │                         │
│  │ Image│ │ Image│ │ Image│  Háttér: bg-gray-50     │
│  │ Info │ │ Info │ │ Info │  Grid: lg:grid-cols-3   │
│  └──────┘ └──────┘ └──────┘                        │
│  Kártya: CardImage, kategória, cím, leírás,          │
│          szerző avatar 32px + név + dátum             │
├─────────────────────────────────────────────────────┤
│  CTA SECTION                                        │
│  - Gradient háttér: from-[#c53f75] to-[#a33460]     │
│  - H2 + leírás + CTA gomb (white bg, rounded-full)  │
└─────────────────────────────────────────────────────┘
```

### 3.3 Avatar generálás (1x/2x srcset)

```typescript
// Featured post avatar: 48x48 megjelenítés
const featuredAvatarImages = await Promise.all(
  posts.filter(p => p.featured).map(async (post) => {
    const img1x = await getImage({
      src: post.author.avatar, width: 48, height: 48,
      format: 'webp', quality: 60
    });
    const img2x = await getImage({
      src: post.author.avatar, width: 96, height: 96,
      format: 'webp', quality: 60
    });
    return { img1x, img2x };
  })
);

// Grid post avatar: 32x32 megjelenítés
const gridAvatarImages = await Promise.all(
  posts.map(async (post) => {
    const img1x = await getImage({
      src: post.author.avatar, width: 32, height: 32,
      format: 'webp', quality: 60
    });
    const img2x = await getImage({
      src: post.author.avatar, width: 64, height: 64,
      format: 'webp', quality: 60
    });
    return { img1x, img2x };
  })
);
```

**HTML használat:**
```html
<img
  src={avatarImg.img1x.src}
  srcset=`${avatarImg.img1x.src} 1x, ${avatarImg.img2x.src} 2x`
  alt="Szerző neve"
  class="w-12 h-12 rounded-full object-cover border-2 border-[#c53f75]/20"
  width="48" height="48"
  loading="lazy" decoding="async"
/>
```

### 3.4 Schema.org (Listing)

```json
{
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "name": "Tudástár - Szépségápolási Útmutatók",
  "description": "...",
  "url": "https://domain.com/tudastar",
  "mainEntity": {
    "@type": "ItemList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "url": "https://domain.com/tudastar/slug",
        "name": "Cikk címe"
      }
    ]
  }
}
```

---

## 4. Blog Cikk Oldal (egyedi post)

### 4.1 Metadata

```typescript
const meta = {
  title: string,       // Cikk teljes címe
  description: string, // SEO leírás
  pubDate: string,     // ISO dátum: "2025-01-15"
  category: string,    // Kategória
  readTime: string     // "8\u00A0perc" (non-breaking space!)
};
```

### 4.2 Cikk oldal felépítése

```
┌─────────────────────────────────────────────────────┐
│  MOBILE PROGRESS BAR (lg:hidden)                    │
│  - Fix pozíció top-0, z-50                          │
│  - Háttér: gray-200, kitöltés: #c53f75              │
│  - Magasság: h-1 (4px)                              │
│  - Scroll alapján 0-100% szélesség                   │
├─────────────────────────────────────────────────────┤
│  ARTICLE HEADER (max-w-4xl, centered)               │
│  - H1 cím (text-2xl md:text-4xl, text-center)       │
│  - Szerző blokk:                                     │
│    [Avatar 70px] Név / Titulus    Olvasási idő: Xp  │
│  - border-b border-gray-100                          │
├─────────────────────────────────────────────────────┤
│  MAIN CONTENT AREA (max-w-7xl)                       │
│  ┌────────────┬──────────────────────────────┐      │
│  │ SIDEBAR    │  MAIN CONTENT                │      │
│  │ (Desktop)  │  (lg:flex-1, max-w-4xl)      │      │
│  │ lg:w-72    │                              │      │
│  │ xl:w-80    │  Bevezető bekezdés           │      │
│  │            │  CTA gomb                     │      │
│  │ STICKY TOC │  MOBILE TOC (lg:hidden)       │      │
│  │ top-24     │  Hero kép (ContentImage)      │      │
│  │            │                              │      │
│  │ 1. Szekció │  SECTION 1 (id="...")         │      │
│  │ 2. Szekció │    H2 cím                     │      │
│  │ 3. Szekció │    Bekezdések                 │      │
│  │ ...        │    Kép (ContentImage)          │      │
│  │            │    Info box (bg-gray-50)       │      │
│  │ CTA gomb   │    CTA gombok                 │      │
│  │ (sidebar)  │                              │      │
│  │            │  SECTION 2...                 │      │
│  │            │  ...                          │      │
│  │            │  SECTION N (kártya grid)       │      │
│  │            │    md:grid-cols-2              │      │
│  │            │    lg:grid-cols-3              │      │
│  └────────────┴──────────────────────────────┘      │
└─────────────────────────────────────────────────────┘
```

### 4.3 Tartalomjegyzék (TOC) - Desktop Sidebar

```html
<aside class="hidden lg:block lg:w-72 xl:w-80 flex-shrink-0">
  <nav id="sticky-toc" class="sticky top-24 bg-white border border-gray-100
                               rounded-xl p-5 shadow-sm">
    <h2 class="text-sm font-bold text-gray-900 mb-4
               uppercase tracking-wide">Tartalomjegyzék</h2>
    <ol class="space-y-2 text-sm text-gray-600">
      <li>
        <a href="#section-id"
           class="toc-link block py-1 hover:text-[#c53f75]
                  transition-colors border-l-2 border-transparent
                  pl-3 -ml-px">
          Szekció neve
        </a>
      </li>
      <!-- ... -->
    </ol>
    <!-- CTA gomb a sidebar alján -->
    <div class="mt-6 pt-4 border-t border-gray-100">
      <a href="/konzultacio"
         class="block w-full text-center bg-[#c53f75] text-white
                font-semibold py-3 rounded-full hover:bg-[#a83363]
                transition-colors text-sm">
        Ingyenes konzultáció
      </a>
    </div>
  </nav>
</aside>
```

### 4.4 Tartalomjegyzék (TOC) - Mobil

```html
<nav id="main-toc" class="lg:hidden bg-gray-50 rounded-xl p-6 mb-12">
  <h2 class="text-lg font-bold text-gray-900 mb-4">Tartalomjegyzék</h2>
  <ol class="space-y-2 text-gray-700">
    <li>
      <a href="#section-id" class="hover:text-[#c53f75] transition-colors">
        1. Szekció teljes neve
      </a>
    </li>
    <!-- Mobilon sorszámozva és teljes szekciónévvel -->
  </ol>
</nav>
```

### 4.5 Szekció struktúra

Minden fő szekció azonos mintát követ:

```html
<section id="section-slug" class="mb-16 scroll-mt-24">
  <h2 class="text-2xl font-bold text-gray-900 mb-6">
    Szekció címe
  </h2>

  <p class="text-gray-700 leading-relaxed mb-6">
    Tartalom bekezdés...
  </p>

  <!-- Opcionális: kép -->
  <div class="mb-8">
    <ContentImage src={image} alt="Leírás" class="w-full rounded-xl" />
  </div>

  <!-- Opcionális: info box -->
  <div class="bg-gray-50 rounded-xl p-6 mb-8">
    <p class="text-gray-700 mb-4"><strong>1. pont:</strong> Szöveg</p>
  </div>

  <!-- Opcionális: összehasonlító táblázat -->
  <div class="overflow-x-auto mb-8">
    <table class="w-full border-collapse text-sm">...</table>
  </div>

  <!-- Opcionális: lista -->
  <ul class="list-disc list-inside text-gray-700 space-y-2 mb-8">
    <li>Elem</li>
  </ul>

  <!-- Opcionális: CTA gomb(ok) -->
  <div class="text-center">
    <a href="/konzultacio"
       class="inline-block bg-[#c53f75] text-white font-semibold
              px-8 py-4 rounded-full hover:bg-[#a83363] transition-colors">
      CTA szöveg
    </a>
  </div>
</section>
```

### 4.6 Kártya Grid szekció (felkészülés / utógondozás)

```html
<section id="section-id" class="mb-16 scroll-mt-24">
  <h2 class="text-2xl font-bold text-gray-900 mb-6">Szekció címe</h2>

  <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
    <!-- Kártya ismétlés -->
    <div class="bg-gray-50 rounded-xl overflow-hidden">
      <CardImage
        src={cardImage}
        alt="Kártya alt"
        class="w-full aspect-[4/3] object-contain bg-white"
      />
      <div class="p-5">
        <h3 class="font-semibold text-gray-900 mb-2">Kártya címe</h3>
        <p class="text-gray-600 text-sm">Kártya leírás szövege.</p>
      </div>
    </div>
    <!-- ... további kártyák -->
  </div>
</section>
```

### 4.7 Schema.org (Article)

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://domain.com/#organization",
      "name": "Cégnév",
      "url": "https://domain.com"
    },
    {
      "@type": "Person",
      "@id": "https://domain.com/#author-nev",
      "name": "Szerző Neve",
      "jobTitle": "Beosztás"
    },
    {
      "@type": "Article",
      "headline": "Cikk címe",
      "description": "SEO leírás",
      "datePublished": "2025-01-15",
      "author": { "@id": "https://domain.com/#author-nev" },
      "publisher": { "@id": "https://domain.com/#organization" }
    }
  ]
}
```

---

## 5. JavaScript funkcionalitás

### 5.1 Mobil Progress Bar

```javascript
function initArticleFeatures() {
  const progressBar = document.getElementById('progress-bar');
  const article = document.querySelector('article');

  if (progressBar && article) {
    function updateProgress() {
      const articleRect = article.getBoundingClientRect();
      const articleTop = articleRect.top + window.scrollY;
      const articleHeight = article.offsetHeight;
      const windowHeight = window.innerHeight;
      const scrolled = window.scrollY - articleTop + windowHeight;
      const progress = Math.min(
        Math.max((scrolled / articleHeight) * 100, 0), 100
      );
      progressBar.style.width = progress + '%';
    }

    window.addEventListener('scroll', updateProgress, { passive: true });
    updateProgress();
  }
```

### 5.2 Aktív TOC Link Kiemelés

```javascript
  const tocLinks = document.querySelectorAll('.toc-link');
  const sections = document.querySelectorAll('section[id]');

  if (tocLinks.length && sections.length) {
    function updateActiveLink() {
      let currentSection = '';

      sections.forEach(section => {
        const sectionTop = section.offsetTop - 150;
        if (window.scrollY >= sectionTop) {
          currentSection = section.getAttribute('id');
        }
      });

      tocLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href === '#' + currentSection) {
          link.classList.add(
            'text-[#c53f75]', 'border-[#c53f75]', 'font-semibold'
          );
          link.classList.remove('border-transparent');
        } else {
          link.classList.remove(
            'text-[#c53f75]', 'border-[#c53f75]', 'font-semibold'
          );
          link.classList.add('border-transparent');
        }
      });
    }

    window.addEventListener('scroll', updateActiveLink, { passive: true });
    updateActiveLink();
  }
}

// Astro-kompatibilis inicializálás
document.addEventListener('DOMContentLoaded', initArticleFeatures);
document.addEventListener('astro:page-load', initArticleFeatures);
```

### 5.3 Cikk-specifikus CSS

```css
html {
  scroll-behavior: smooth;
}

article p {
  hyphens: auto;  /* Automatikus elválasztás */
}

table {
  font-size: 0.9rem;
}

@media (max-width: 640px) {
  table { font-size: 0.75rem; }
  th, td { padding: 0.5rem 0.25rem !important; }
}
```

---

## 6. Képkezelés

### 6.1 Képkomponensek használata

| Komponens | Szélességarány | Használat | Min. forráskép |
|-----------|----------------|-----------|----------------|
| `HeroImage` | 100vw | Teljes szélességű hős kép | 2560px |
| `ContentImage` | 50vw | Cikk tartalom képek | 1600px |
| `CardImage` | 33vw | Kártya rács elemek | 1280px |
| `FixedImage` | fix px | Avatar, ikon | 2x méret |

### 6.2 Képimport minta

```typescript
// Képek MINDIG src/assets/ mappából importálandók (NEM public/)
import heroImage from '../../assets/images/originals/hero-image.jpg';
import cardImage from '../../assets/images/originals/card-image.jpg';
import authorAvatar from '../../assets/images/author-avatar.jpg';
```

### 6.3 Képoptimalizálási beállítások

```typescript
// Formátumok: avif, webp → jpg fallback
// Minőség: 60 (webp/avif)
// Lazy loading: minden kép KIVÉVE az első (hero/LCP)

// ContentImage widths:
[320, 480, 640, 960, 1280, 1600]
sizes: '(min-width: 1024px) 50vw, 100vw'

// CardImage widths:
[256, 384, 480, 640, 853, 1280]
sizes: '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw'
```

### 6.4 Szabályok

1. **Egy `priority={true}` oldalanként** — csak a LCP (hero) képre
2. **Képek MINDIG `/src/assets/`** mappában — soha nem `/public/`
3. **Aspect ratio mindig megadva** — CLS megelőzés
4. **`loading="lazy"`** minden below-fold képre
5. **`<LCPTracker />`** a Layout-ba — dev módban figyelmeztet

---

## 7. SEO & Meta

### 7.1 Layout szintű meta tagek

```html
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content={description} />

  <!-- Font preload -->
  <link rel="preload" href="/fonts/heading-font.woff2"
        as="font" type="font/woff2" crossorigin />

  <!-- Canonical -->
  <link rel="canonical" href={canonicalUrl} />

  <!-- Hreflang (többnyelvű) -->
  <link rel="alternate" hreflang="hu" href="https://domain.com/tudastar" />
  <link rel="alternate" hreflang="en" href="https://domain.com/en/knowledge-base" />
  <link rel="alternate" hreflang="x-default" href="https://domain.com/tudastar" />

  <!-- Open Graph -->
  <meta property="og:locale" content="hu_HU" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={canonicalUrl} />
  <meta property="og:site_name" content="Cégnév" />
  <meta property="og:image" content="https://domain.com/images/og-image.jpg" />

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="https://domain.com/images/og-image.jpg" />

  <title>{title}</title>
</head>
```

### 7.2 JSON-LD beillesztés

```html
<script type="application/ld+json" set:html={JSON.stringify(schema)} />
```

---

## 8. Stílus rendszer

### 8.1 Színpaletta

| Változó | Érték | Használat |
|---------|-------|-----------|
| `--color-primary` | `#c53f75` | Fő szín (CTA, linkek, badge-ek) |
| `--color-primary-dark` | `#a33460` | Hover állapot, gradient vég |
| `--color-heading` | `#1e293b` | Címsorok (sötét szürke) |
| `--color-body` | `#334155` | Szövegtörzs (közép szürke) |
| `--color-link` | `#212121` | Linkek alapállapot |
| `--color-gray-light` | `#f8f8f8` | Háttér szekciók |

### 8.2 Tipográfia

```css
/* Body: Rendszer fontok (0 letöltés, azonnali megjelenés) */
--font-sans: system-ui, -apple-system, "Segoe UI", Roboto,
             "Helvetica Neue", Arial, sans-serif;

/* Címsorok: Egyedi variable font (1 fájl, 300-700 weight) */
--font-heading: "Cormorant", Georgia, serif;

html {
  font-size: 15px;
  line-height: 1.65;
}

/* @font-face: font-display: swap KÖTELEZŐ */
```

### 8.3 Responsive breakpointok

| Breakpoint | Tailwind prefix | Használat |
|------------|-----------------|-----------|
| < 640px | (alapértelmezett) | Mobil: 1 oszlop, rejtett sidebar |
| >= 640px | `sm:` | Kis táblagép |
| >= 768px | `md:` | Táblagép: 2 oszlopos kártyagrid |
| >= 1024px | `lg:` | Desktop: sidebar megjelenik, 3 oszlop |
| >= 1280px | `xl:` | Nagy desktop: szélesebb sidebar |

### 8.4 Ismétlődő UI minták

**CTA gomb:**
```html
<a class="inline-block bg-[#c53f75] text-white font-semibold
          px-8 py-4 rounded-full hover:bg-[#a83363] transition-colors">
```

**Kategória badge:**
```html
<span class="bg-[#c53f75]/10 text-[#c53f75] px-3 py-1
             rounded-full text-sm font-medium">
```

**Kártya (grid elem):**
```html
<div class="bg-gray-50 rounded-xl overflow-hidden">
```

**Gradient CTA szekció:**
```html
<section class="py-16 bg-gradient-to-br from-[#c53f75] to-[#a33460] text-white">
```

---

## 9. Többnyelvűség (i18n)

### 9.1 Konfiguráció (astro.config.mjs)

```javascript
i18n: {
  defaultLocale: 'hu',
  locales: ['hu', 'en'],
  routing: {
    prefixDefaultLocale: false  // /tudastar NEM /hu/tudastar
  }
}
```

### 9.2 Route mapping (utils.ts)

```typescript
const routeMappings = [
  { hu: '/tudastar', en: '/knowledge-base' },
  { hu: '/tudastar/cikk-slug', en: '/knowledge-base/article-slug' },
];
```

### 9.3 Segédfüggvények

```typescript
getLangFromUrl(url: URL): Locale
// URL-ből kinyeri a nyelvet (/en/* -> 'en', egyébként 'hu')

useTranslations(lang: Locale): (key: string) => string
// Fordítási kulcs alapján visszaadja a szöveget

getAlternateRoute(path: string, fromLang: Locale, toLang: Locale): string
// Útvonal leképezés egyik nyelvről a másikra
```

### 9.4 URL struktúra

| Nyelv | Blog listing | Blog cikk |
|-------|-------------|-----------|
| Magyar (alapértelmezett) | `/tudastar` | `/tudastar/[slug]` |
| Angol | `/en/knowledge-base` | `/en/knowledge-base/[slug]` |

---

## 10. Performance optimalizáció

### 10.1 Astro Config beállítások

```javascript
build: {
  inlineStylesheets: 'always'  // 0 render-blocking CSS request
},

integrations: [
  critters({
    Critters: {
      preload: 'media',
      inlineFonts: false,
      preloadFonts: false,
      pruneSource: true,
      mergeStylesheets: false,
    }
  }),
  sitemap({ /* i18n config */ })
]
```

### 10.2 Statikus előgenerálás

Minden blog oldal tetejére:
```typescript
export const prerender = true;
```

### 10.3 Font stratégia

1. **Body**: System font stack → 0 letöltés, azonnali render
2. **Heading**: Variable font (1 fájl, összes weight) → `font-display: swap`
3. **Font preload**: Csak a heading fontot preload-old `crossorigin` attribútummal
4. **Unicode-range splitting**: Latin + Latin Extended külön fájlok

### 10.4 Kép stratégia

1. **Formátumok**: avif → webp → jpg (automatikus)
2. **Lazy loading**: Minden below-fold kép
3. **Priority**: Csak 1 kép/oldal (LCP hero)
4. **srcset**: Automatikus responsive sizes generálás
5. **Avatar**: 1x + 2x `getImage()` manual srcset

### 10.5 Elvárt Lighthouse eredmények

| Metrika | Cél |
|---------|-----|
| Performance | 95-100 |
| Accessibility | 95-100 |
| Best Practices | 95-100 |
| SEO | 95-100 |

---

## 11. Navigáció integráció

A blog menüpontot a Header.astro-ban kell felvenni:

```
Magyar menü: "Tippek" → /tudastar (főmenü szint)
  └── Alcím → /tudastar/cikk-slug (almenü)

Angol menü: "Guides" → /knowledge-base
  └── Subtitle → /knowledge-base/article-slug
```

---

## 12. Új blog cikk létrehozása - Checklist

### 12.1 Fájl létrehozása
- [ ] Új `.astro` fájl: `src/pages/tudastar/[slug].astro`
- [ ] Angol verzió: `src/pages/en/knowledge-base/[slug].astro`
- [ ] `export const prerender = true;` az elejére

### 12.2 Tartalom
- [ ] Meta objektum: title, description, pubDate, category, readTime
- [ ] Képek importálása `src/assets/images/` mappából
- [ ] Szekciók `id` attribútummal (TOC-hoz)
- [ ] `scroll-mt-24` minden szekción
- [ ] Szerző avatar: 70x70 megjelenítés, 1x/2x srcset
- [ ] Minimum 1 CTA gomb szekciónként

### 12.3 SEO
- [ ] Schema.org Article JSON-LD (@graph formátum)
- [ ] Hreflang route mapping hozzáadása `i18n/utils.ts`-hez
- [ ] `<Layout title={meta.title + " | Brand"} description={meta.description}>`

### 12.4 Képek
- [ ] Hero kép: ContentImage, `priority={true}`
- [ ] Tartalom képek: ContentImage (min 1600px forrás)
- [ ] Kártya képek: CardImage (min 1280px forrás)
- [ ] Aspect ratio: `aspect-[16/10]` vagy `aspect-[4/3]`

### 12.5 Listing oldal frissítése
- [ ] Új post hozzáadása a `posts` tömbhöz az `index.astro`-ban
- [ ] Featured flag beállítása
- [ ] Szerző avatar import

### 12.6 Navigáció
- [ ] Header.astro menüpont frissítése (ha szükséges)
- [ ] Sitemap automatikusan generálódik build-kor

---

## 13. Összefoglaló - Architektúra Döntések

| Döntés | Megoldás | Indoklás |
|--------|----------|----------|
| Tartalom formátum | Astro (.astro) fájlok | Teljes kontroll layout és komponensek felett |
| Képoptimalizálás | Astro Picture komponensek | Automatikus avif/webp, responsive srcset |
| CSS | Tailwind + inline | 0 render-blocking, utility-first |
| Font | System + 1 variable | Minimális letöltés, azonnali render |
| TOC | Sticky sidebar (desktop) + collapsible (mobil) | UX: mindig elérhető navigáció |
| Progress | Mobil scroll progress bar | Olvasási élmény visszajelzés |
| SEO | Schema.org @graph + hreflang + OG | Strukturált adat + többnyelvű SEO |
| Hosting | Cloudflare + SSG prerender | Edge delivery, gyors TTFB |
| i18n | Astro built-in + route mapping | Tiszta URL-ek, hreflang támogatás |
