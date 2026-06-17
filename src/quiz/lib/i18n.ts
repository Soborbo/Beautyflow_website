/**
 * Magyar UI-stringek és ár-formázás a bőranalízis kvízhez.
 * A kvíz kizárólag magyar nyelvű (hu-HU, HUF).
 */

export const LOCALE = 'hu-HU';
export const CURRENCY = 'HUF';

const strings = {
  // Indító / általános
  'quiz.title': 'Ingyenes online bőranalízis',
  'quiz.next': 'Tovább',
  'quiz.back': 'Vissza',
  'quiz.of': '/',
  'quiz.step': 'kérdés',
  'quiz.selectAtLeastOne': 'Válassz legalább egy lehetőséget.',

  // Kontakt kapu
  'gate.title': 'Már majdnem kész! Hova küldjük a személyre szabott bőrprofilod?',
  'gate.subtitle':
    'Add meg az elérhetőséged, és azonnal megmutatjuk a bőrprofilodat és a javasolt irányt.',
  'gate.firstName': 'Keresztnév',
  'gate.phone': 'Telefonszám',
  'gate.email': 'Email cím',
  'gate.contactHint': 'A telefonszám vagy az email közül legalább az egyiket kérjük.',
  'gate.submit': 'Eredményem megtekintése',
  'gate.submitting': 'Elemzés folyamatban…',
  'gate.required': 'Ez a mező kötelező.',
  'gate.emailOrPhone': 'Kérjük adj meg telefonszámot vagy email címet.',
  'gate.invalidEmail': 'Kérjük adj meg egy érvényes email címet.',
  'gate.invalidPhone': 'Kérjük adj meg egy érvényes telefonszámot.',
  'gate.consentHealth':
    'Hozzájárulok, hogy a megadott, egészségemmel kapcsolatos adataimat a szalon a személyre szabott kezelési javaslat elkészítése céljából kezelje.',
  'gate.consentRequired': 'Az egészségügyi adatok kezeléséhez való hozzájárulás kötelező.',
  'gate.privacyLink': 'Adatkezelési tájékoztató',
  'gate.error': 'Hiba történt. Kérjük próbáld újra, vagy hívj minket: +36 1 300 9414',
  'gate.tooFast': 'Túl gyors küldés. Kérjük próbáld újra pár másodperc múlva.',

  // Eredmény
  'result.heading': 'A személyre szabott bőrprofilod',
  'result.profileLabel': 'A bőröd profilja:',
  'result.directionTitle': 'A te problémádra valószínűleg ez az irány:',
  'result.notDiagnosis':
    'A pontos kezelési tervet csak személyesen, fényben és tapintással végzett vizsgálat után tudjuk megadni. Ez az eredmény kozmetikai konzultációs irány, nem orvosi diagnózis.',
  'result.priceTitle': 'Becsült ársáv',
  'result.priceNote':
    'Tájékoztató ársáv — a pontos árat a személyes analízis után tudjuk megadni.',
  'result.safetyTitle': 'Fontos a biztonságod miatt',
  'result.ctaTitle': '5 000 Ft-os szakmai bőranalízis',
  'result.ctaBody':
    'A következő lépés egy alapos, személyes bőranalízis a szalonban. Az 5 000 Ft teljes egészében levásárolható, ha nálunk folytatod a kezelést.',
  'result.ctaButton': 'Időpontot kérek a bőranalízisre',
  'result.notFound':
    'Ezt az eredményt nem találjuk ezen az eszközön. Elküldtük emailben is — nézd meg a postaládád! Ha kérdésed van, hívj minket: +36 1 300 9414.',
} as const;

export type QuizStringKey = keyof typeof strings;

export function t(key: QuizStringKey): string {
  return strings[key];
}

/** HUF formázás: „30 000 Ft" (non-breaking ezres tagolás). */
export function formatPrice(amount: number): string {
  return (
    new Intl.NumberFormat('hu-HU', {
      maximumFractionDigits: 0,
    }).format(amount) + ' Ft'
  );
}

export function formatPriceRange(min: number, max: number): string {
  return `${formatPrice(min)} – ${formatPrice(max)}`;
}
