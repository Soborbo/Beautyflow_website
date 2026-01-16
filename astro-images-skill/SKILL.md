# Astro Images Skill

Auto-installs optimized image components and audits implementation.

## When Triggered

- Any Astro project with images
- User asks about images, Picture component, or image optimization
- Building new pages/components with images

## Step 1: Check Installation

```bash
ls src/components/images/index.ts 2>/dev/null || echo "NOT_INSTALLED"
```

If `NOT_INSTALLED` → Run Step 2
If exists → Skip to Step 3

## Step 2: Install Components

Create `src/components/images/` with all 13 files from `references/` folder.

## Step 3: Use Components

| Component | Width | Use Case |
|-----------|-------|----------|
| HeroImage | 100vw | Full-bleed heroes |
| TwoThirdsImage | 66vw | Split 66/33 |
| LargeImage | 60vw | Split 60/40 |
| ContentImage | 50vw | Split 50/50 |
| SmallImage | 40vw | Split 40/60 |
| CardImage | 33vw | 3-column grids |
| QuarterImage | 25vw | 4-column grids |
| FifthImage | 20vw | 5-column grids |
| SixthImage | 16vw | 6-column grids |
| FixedImage | px | Avatars, icons |
| Logo | px | Brand logos |
| LCPTracker | — | Dev warning for multiple priority |

```astro
import { HeroImage, ContentImage, CardImage, LCPTracker } from '../components/images';

<HeroImage src={hero} alt="Hero" priority={true} />
<ContentImage src={about} alt="About" />
<LCPTracker /> <!-- Add to layout -->
```

## Step 4: Audit (Run After Implementation)

### Quick Checks
```bash
# Images in wrong folder
find public -type f \( -name "*.jpg" -o -name "*.png" -o -name "*.webp" \) 2>/dev/null

# Multiple priority images (should be max 1 per page)
grep -r 'priority={true}' src/pages --include="*.astro" | wc -l

# Raw Picture outside components (should be empty)
grep -r "<Picture" src --include="*.astro" | grep -v "components/images"
```

### Source Size Check
```bash
# List all images with dimensions
find src/assets -type f \( -name "*.jpg" -o -name "*.png" -o -name "*.webp" \) \
  -exec identify -format "%f: %wx%h\n" {} \; 2>/dev/null
```

Minimum source widths:
- HeroImage: 2560px
- TwoThirdsImage: 2048px
- LargeImage: 1920px
- ContentImage: 1600px
- SmallImage/CardImage: 1280px
- QuarterImage: 960px
- FifthImage: 768px
- SixthImage: 640px

## Rules

1. **Pick component by rendered width** — not image shape
2. **One `priority={true}` per page** — for LCP image only
3. **Images in `/src/assets/`** — never `/public/`
4. **Add `<LCPTracker />` to base layout** — catches mistakes in dev

## Undersized Source Fallback

If source < required: component still works but quality degrades on high-DPR screens.
Generate report for client:

| Image | Current | Required | Priority |
|-------|---------|----------|----------|
| hero.jpg | 1920px | 2560px | 🔴 High |
| about.jpg | 1200px | 1600px | 🟡 Medium |

## Do Not

- Use raw `<Picture>` — use components
- Put images in `/public/`
- Use multiple `priority={true}` per page
- Use `<Picture>` for SVGs — use `<img>`
