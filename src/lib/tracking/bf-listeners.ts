/**
 * Beautyflow-specific delegated click listeners.
 *
 * The tracking-kit's `global-listeners.ts` covers tel:, mailto:, wa.me,
 * scroll-depth. This module adds:
 *
 *   - booking_click: any anchor pointing to Notino's salon booking page
 *     (Időpontfoglalás CTA) fires a conversion event. Mirrors to Meta CAPI
 *     as `InitiateCheckout`.
 *
 * Why a separate file: the kit upstream stays generic — project-specific
 * conversion taxonomies belong with the project.
 */

import { trackEvent } from './tracking';
import { mirrorMetaCapi } from './meta-mirror';

let installed = false;

function findBookingLink(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;
  const link = target.closest('a');
  if (!link) return null;
  const href = link.getAttribute('href') || '';
  if (/notino\.hu\/szalonok\/beautyflow/i.test(href)) return link;
  if (link.dataset.track === 'booking_click') return link;
  return null;
}

function inferSource(link: HTMLAnchorElement): string {
  // Explicit data-source wins
  if (link.dataset.source) return link.dataset.source;
  // Otherwise: section the button lives in
  const section = link.closest('section, header, footer');
  if (section?.id) return section.id;
  if (link.closest('header')) return 'header';
  if (link.closest('footer')) return 'footer';
  return 'unknown';
}

export function initBeautyflowListeners(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  document.addEventListener('click', (e) => {
    const link = findBookingLink(e.target);
    if (!link) return;

    const source = inferSource(link);
    const eventId = trackEvent('booking_click', {
      source,
      page_path: location.pathname,
    });
    void mirrorMetaCapi('booking_click', eventId, {});
  }, true);
}
