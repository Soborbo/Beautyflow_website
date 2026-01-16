# Image Components

Responsive image components with optimized widths, sizes, quality, and formats built in.

## Usage

```astro
import { HeroImage, ContentImage, CardImage } from '../components/images';

<HeroImage src={heroImg} alt="Hero" priority={true} />
<ContentImage src={aboutImg} alt="About section" />
<CardImage src={cardImg} alt="Service card" />
```

## Component Reference

| Component | Width | Use Case |
|-----------|-------|----------|
| HeroImage | 100vw | Full-bleed hero banners |
| TwoThirdsImage | 66vw | Split 66/33 (image dominant) |
| LargeImage | 60vw | Split 60/40 (image dominant) |
| ContentImage | 50vw | Split 50/50, checkerboard |
| SmallImage | 40vw | Split 40/60 (text dominant) |
| CardImage | 33vw | 3-column grids |
| QuarterImage | 25vw | 4-column grids, team photos |
| FifthImage | 20vw | 5-column grids |
| SixthImage | 16vw | 6-column grids, partner logos |
| FixedImage | px | Avatars, icons (specify width) |
| Logo | px | Brand logos (specify width) |

## Props

**All Picture components:**
- `src` (required) - Imported image
- `alt` (required) - Alt text
- `class` - CSS classes
- `priority` - Set `true` for above-fold LCP image (max ONE per page)

**FixedImage & Logo:**
- `width` (required) - Display width in px
- `height` - Display height in px (defaults to width)

## Rules

1. **Pick component by rendered width** - not by image shape
2. **One `priority={true}` per page** - only for the main hero/LCP image
3. **Same component works for any aspect ratio** - landscape, portrait, square

## LCP Enforcement

Add `<LCPTracker />` to your base layout to get console warnings if multiple priority images exist:

```astro
---
import { LCPTracker } from '../components/images';
---
<html>
  <body>
    <slot />
    <LCPTracker />
  </body>
</html>
```

Dev mode only — no production overhead.

## Examples

```astro
<!-- Full-width hero -->
<HeroImage src={hero} alt="Welcome" priority={true} />

<!-- 50/50 split section -->
<div class="grid grid-cols-2">
  <ContentImage src={about} alt="About us" />
  <div>Text content</div>
</div>

<!-- 3-column cards -->
<div class="grid grid-cols-3">
  {cards.map(card => (
    <CardImage src={card.image} alt={card.title} />
  ))}
</div>

<!-- Team grid (4-col) -->
<div class="grid grid-cols-4">
  {team.map(person => (
    <QuarterImage src={person.photo} alt={person.name} />
  ))}
</div>

<!-- Logo -->
<Logo src={logo} alt="Company name" width={180} priority={true} />

<!-- Avatar -->
<FixedImage src={avatar} alt="User" width={48} />
```

## Source Image Minimums

| Component | Min Source Width |
|-----------|------------------|
| HeroImage | 2560px |
| TwoThirdsImage | 2048px |
| LargeImage | 1920px |
| ContentImage | 1600px |
| SmallImage | 1280px |
| CardImage | 1280px |
| QuarterImage | 960px |
| FifthImage | 768px |
| SixthImage | 640px |
| FixedImage/Logo | 2× display width |
