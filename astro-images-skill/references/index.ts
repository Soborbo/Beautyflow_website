/**
 * Image Component Library
 *
 * Reusable image components following the astro-images skill patterns.
 * Each component is optimized for a specific use case with correct
 * widths, sizes, quality, and formats.
 *
 * Pattern Reference:
 * | Component       | Pattern     | Width  | Use Case                          |
 * |-----------------|-------------|--------|-----------------------------------|
 * | HeroImage       | FULL        | 100vw  | Full-bleed hero sections          |
 * | TwoThirdsImage  | TWO_THIRDS  | 66vw   | Split 66/33 layouts (image side)  |
 * | LargeImage      | LARGE       | 60vw   | Split 60/40 layouts (image side)  |
 * | ContentImage    | HALF        | 50vw   | 50/50 layouts, checkerboard       |
 * | SmallImage      | SMALL       | 40vw   | Split 40/60 (text dominant)       |
 * | CardImage       | THIRD       | 33vw   | 3-column grids, treatment cards   |
 * | QuarterImage    | QUARTER     | 25vw   | 4-column grids, team photos       |
 * | FifthImage      | FIFTH       | 20vw   | 5-column icon grids               |
 * | SixthImage      | SIXTH       | 16vw   | 6-column logo grids               |
 * | FixedImage      | FIXED       | px     | Avatars, small icons              |
 * | Logo            | FIXED       | px     | Brand logos (with priority)       |
 */

// Responsive Picture components (largest to smallest)
export { default as HeroImage } from './HeroImage.astro';
export { default as TwoThirdsImage } from './TwoThirdsImage.astro';
export { default as LargeImage } from './LargeImage.astro';
export { default as ContentImage } from './ContentImage.astro';
export { default as SmallImage } from './SmallImage.astro';
export { default as CardImage } from './CardImage.astro';
export { default as QuarterImage } from './QuarterImage.astro';
export { default as FifthImage } from './FifthImage.astro';
export { default as SixthImage } from './SixthImage.astro';

// Fixed-size components (getImage with 1x/2x srcset)
export { default as FixedImage } from './FixedImage.astro';
export { default as Logo } from './Logo.astro';

// Development utilities
export { default as LCPTracker } from './LCPTracker.astro';
