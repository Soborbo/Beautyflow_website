/**
 * First-/last-touch attribution capture for a hard-navigation MPA.
 *
 * UTM tags and ad click-ids only live in the URL of the LANDING page;
 * on the first internal navigation the query string is gone. Forms that
 * read them from `window.location.search` at submit time therefore lose
 * attribution for every visitor who didn't land directly on the form —
 * i.e. most paid traffic that lands on the homepage or a treatment page
 * and then clicks through to the consultation form. That is the source
 * of the post-migration "Unassigned" jump on lead records.
 *
 * Fix: persist the campaign params once, on the page where they first
 * appear (captureAttribution runs on every page-load from boot), and
 * read them back at submit time (getAttribution). This populates the
 * lead record (Google Sheet / email / Ads offline conversions); it does
 * NOT change GA4 session source, which is handled by the Google tag +
 * Consent Mode.
 */

import { STORAGE_PREFIX } from './config';

const STORAGE_KEY = `${STORAGE_PREFIX}_attribution`;
const TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days — matches a typical ad cookie window

const PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'gclid', 'fbclid', 'gbraid', 'wbraid', 'msclkid',
] as const;

type AttributionField = (typeof PARAMS)[number];
// fbc/fbp are Meta pixel COOKIES (not URL params) — merged in at read time.
export type Attribution = Partial<Record<AttributionField, string>> & { fbc?: string; fbp?: string };

interface StoredAttribution {
  data: Attribution;
  ts: number;
}

function fromUrl(): Attribution {
  const out: Attribution = {};
  if (typeof window === 'undefined') return out;
  const params = new URLSearchParams(window.location.search);
  for (const key of PARAMS) {
    const value = params.get(key);
    if (value) out[key] = value;
  }
  return out;
}

function readStored(): Attribution {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredAttribution;
    if (!parsed || typeof parsed.ts !== 'number') return {};
    if (Date.now() - parsed.ts > TTL_MS) {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      return {};
    }
    return parsed.data || {};
  } catch {
    return {};
  }
}

/**
 * Run once per page-load. If the current URL carries any campaign
 * params, persist them (last-touch: a fresh campaign click replaces the
 * stored set wholesale, so we never stitch utm_source from one click to
 * a gclid from another). Returns the resulting stored attribution.
 */
export function captureAttribution(): Attribution {
  const url = fromUrl();
  if (Object.keys(url).length === 0) return readStored();
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ data: url, ts: Date.now() }));
    } catch {
      // localStorage full or disabled — degrade to URL-only (current behaviour)
    }
  }
  return url;
}

/** Meta pixel cookies (_fbc/_fbp) — live-read at submit time. */
function readMetaCookies(): Attribution {
  if (typeof document === 'undefined') return {};
  const get = (n: string): string | undefined => {
    const m = document.cookie.match(new RegExp('(?:^|; )' + n.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : undefined;
  };
  const out: Attribution = {};
  const fbc = get('_fbc');
  const fbp = get('_fbp');
  if (fbc) out.fbc = fbc;
  if (fbp) out.fbp = fbp;
  return out;
}

/**
 * Attribution to attach to a lead at submit time. URL params win over
 * stored, so a direct landing on the form with fresh params is honoured.
 * Meta _fbc/_fbp cookies are merged in (live-read).
 */
export function getAttribution(): Attribution {
  return { ...readStored(), ...fromUrl(), ...readMetaCookies() };
}
