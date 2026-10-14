/**
 * A kvíz-eredmény HTML-je — EGY helyen, hogy az /eredmeny/<hash> oldal és a
 * kvíz (ha a böngésző nem tudta menteni az eredményt, ugyanazon az oldalon
 * mutatja) ugyanazt rajzolja. Minden dinamikus érték `esc()`-en megy át:
 * az eredmény a szerverről / a tárolóból jön, nem bízunk benne.
 */
import type { Recommendation } from './types';
import type { StoredQuizResult } from './result-store';
import { markOnce } from '../../lib/tracking/once';

const PHONE = '+36 1 300 9414';
const NOT_DIAGNOSIS =
  'A pontos kezelési tervet csak személyesen, fényben és tapintással végzett vizsgálat után tudjuk megadni. Ez az eredmény kozmetikai konzultációs irány, nem orvosi diagnózis.';

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function priceLabel(r: Recommendation): string {
  if (r.arSav) return r.arSav.formatted;
  return 'Egyedi ajánlat a bőrdiagnosztika után';
}

/** Link a Baumann-bőrtípus publikus oldalára (ha az eredmény hordozza a kódot). */
function baumannHtml(r: StoredQuizResult): string {
  const b = r.baumann;
  if (!b || !/^[a-z]{4}$/.test(b.slug)) return '';
  const title = b.name ? `${esc(b.code)} — ${esc(b.name)}` : esc(b.code);
  return `
    <section class="mb-6 rounded-2xl border border-[#c53f75]/20 bg-white p-5 text-center">
      <p class="text-sm text-gray-500">A Baumann-bőrtípusod:</p>
      <p class="font-heading mt-1 text-2xl text-gray-900">${title}</p>
      <a href="/bortipus/${esc(b.slug)}" class="mt-3 inline-block font-semibold text-[#c53f75] underline hover:text-[#a33460]">
        Mit jelent ez a bőrtípus? Részletek és ápolási tippek →
      </a>
    </section>`;
}

/** A teljes eredmény-blokk HTML-je (escapelt). */
export function resultHtml(r: StoredQuizResult): string {
  const isSafeRoute = r.safe;
  const treatmentsHtml = r.treatments
    .map(
      (tr, i) => `
      <div class="rounded-xl border border-gray-200 bg-white p-5 ${i === 0 ? 'ring-1 ring-[#c53f75]/30' : ''}">
        <h3 class="font-heading text-xl text-gray-900">${esc(tr.name)}</h3>
        <p class="mt-1 text-sm leading-relaxed text-gray-600">${esc(tr.blurb)}</p>
        ${tr.locationNote ? `<p class="mt-2 text-xs font-medium text-[#c53f75]">${esc(tr.locationNote)}</p>` : ''}
      </div>`,
    )
    .join('');

  const kontra = (r.kontraindikaciok || [])
    .map((k) => `<li class="flex gap-2"><span class="text-[#c53f75]">•</span><span>${esc(k)}</span></li>`)
    .join('');

  return `
      <header class="mb-6 text-center">
        <p class="text-sm font-medium uppercase tracking-wide text-[#c53f75]">Beautyflow bőranalízis</p>
        <h1 class="font-heading mt-1 text-3xl text-gray-900">A személyre szabott bőrprofilod</h1>
      </header>

      <section class="mb-6 rounded-2xl bg-[#c53f75]/5 p-5 text-center">
        <p class="text-sm text-gray-500">A bőröd profilja:</p>
        <p class="font-heading mt-1 text-2xl capitalize text-gray-900">${esc(r.profile.label)}</p>
      </section>

      ${baumannHtml(r)}

      ${
        isSafeRoute
          ? `<section class="mb-6">
              <h2 class="font-heading mb-3 text-xl text-gray-900">A te problémádra valószínűleg ez az irány:</h2>
              <div class="space-y-3">${treatmentsHtml}</div>
            </section>`
          : `<section class="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <h2 class="font-heading mb-2 text-xl text-gray-900">Fontos a biztonságod miatt</h2>
              <p class="text-sm leading-relaxed text-gray-700">${esc(r.routeMessage || '')}</p>
              <div class="mt-4 space-y-3">${treatmentsHtml}</div>
            </section>`
      }

      ${
        kontra
          ? `<section class="mb-6 rounded-xl border border-gray-200 bg-white p-5">
              <h2 class="font-heading mb-2 text-lg text-gray-900">Amire a kezelés előtt figyelünk</h2>
              <ul class="space-y-1.5 text-sm text-gray-600">${kontra}</ul>
            </section>`
          : ''
      }

      <section class="mb-6 rounded-xl border border-gray-200 bg-white p-5">
        <h2 class="font-heading mb-1 text-lg text-gray-900">A kezelés ára</h2>
        <p class="text-2xl font-semibold text-[#c53f75]">${esc(priceLabel(r))}</p>
        <p class="mt-1 text-xs text-gray-500">Az érvényes árlista szerint. Hogy pontosan hány alkalom kell, azt a személyes bőrdiagnosztika után tudjuk megmondani.</p>
      </section>

      <section class="mb-6 rounded-xl border-l-4 border-[#c53f75] bg-[#c53f75]/5 p-4">
        <p class="text-sm leading-relaxed text-gray-700">${esc(NOT_DIAGNOSIS)}</p>
      </section>

      <!-- TODO: Fanni záróvideó — ide kerül a beágyazás -->
      <section class="mb-6 flex aspect-video w-full items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 text-center text-sm text-gray-400">
        Fanni videóüzenete hamarosan ✨
      </section>

      <section class="rounded-2xl bg-gradient-to-br from-[#c53f75] to-[#a33460] p-6 text-center text-white shadow-lg">
        <h2 class="font-heading text-2xl">A következő lépés: bőrdiagnosztika</h2>
        <p class="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/90">
          Géppel felmérjük a bőröd valós állapotát, és kezelési tervet kapsz. 60 perc,
          10 000 Ft — amit <strong>levonunk az első kezelésed árából</strong>. Budai és pesti
          szalonunkban is.
        </p>
        <a href="/bordiagnosztika" class="mt-5 inline-block rounded-full bg-white px-7 py-3.5 font-semibold text-[#c53f75] shadow hover:bg-gray-50">
          Kérem a bőrdiagnosztikát
        </a>
        <p class="mt-3 text-xs text-white/80">Vagy hívj minket: ${PHONE} — hamarosan vissza is hívunk a megadott elérhetőségen.</p>
        <!-- TODO: foglaló naptár — későbbi körben naptár-integráció ide -->
      </section>
  `;
}

/**
 * calculator_result_view — analitika-hozzájárulással, hash-enként EGYSZER
 * (újratöltés, e-mail-link újranyitása nem könyvel újat). PII-mentes.
 */
export function pushResultViewOnce(r: StoredQuizResult, hash: string, analyticsConsent: boolean): void {
  if (!analyticsConsent || (hash && !markOnce(`bf_result_view_${hash}`, 'local'))) return;
  const w = window as unknown as { dataLayer: Record<string, unknown>[] };
  w.dataLayer = w.dataLayer || [];
  w.dataLayer.push({ event: 'calculator_result_view', route: r.utvonal, safe: r.safe });
}
