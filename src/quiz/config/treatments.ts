/**
 * Kezelés-katalógus + szalon konfiguráció a bőranalízis kvízhez.
 *
 * A kvíz ajánló-motorja (lib/recommendation.ts) ezekre az `id`-kra hivatkozik.
 * A vendégbarát leírások NEM orvosi állítások — irányt adnak, nem diagnózist.
 *
 * ⚠️ TODO: árak — az alábbi ársávok PLACEHOLDER értékek. A tényleges szalonárak
 * jellemzően 30 000 Ft felettiek; az operátor felülírja őket élesítés előtt.
 * Sehol ne menjenek a PDF-árak élesbe. A `priceTodo: true` jelzi a pótlandót.
 */

export interface TreatmentDef {
  id: string;
  /** Vendégnek megjelenő név. */
  name: string;
  /** Rövid, vendégbarát leírás (irány, nem diagnózis). */
  blurb: string;
  /** Becsült ársáv (HUF) — PLACEHOLDER, lásd a fenti TODO-t. */
  priceFrom: number;
  priceTo: number;
  /** true = az ár még pótlandó az operátor által. */
  priceTodo: boolean;
  /** Csak ezekben a szalonokban elérhető (üres = mindenhol). */
  onlyAtSalons?: SalonId[];
  /** true = a részletes vendégbarát copy még hiányzik (tananyag jön). */
  copyTodo?: boolean;
}

export type SalonId = 'buda' | 'pest' | 'barmely';

export interface SalonDef {
  id: Exclude<SalonId, 'barmely'>;
  name: string;
  address: string;
  /** A 13. kerületi (Pest) szalon a Fusion Plasma helyszíne. */
  district13?: boolean;
}

// ============================================================
// SZALONOK — a valódi élő helyszínek (Header/Footer/Schema szerint)
// ============================================================
export const SALONS: Record<'buda' | 'pest', SalonDef> = {
  buda: {
    id: 'buda',
    name: 'Beautyflow Buda',
    address: '1116 Budapest, Vegyész utca 1.',
  },
  pest: {
    id: 'pest',
    name: 'Beautyflow Pest',
    address: '1135 Budapest, Reitter Ferenc utca 90.',
    district13: true, // 13. kerület → Fusion Plasma itt elérhető
  },
} as const;

export function salonLabel(id: SalonId): string {
  if (id === 'buda') return SALONS.buda.name;
  if (id === 'pest') return SALONS.pest.name;
  return 'Bármelyik szalon';
}

// ============================================================
// KEZELÉSEK
// ⚠️ TODO: árak — placeholder ársávok, az operátor felülírja.
// ============================================================
export const TREATMENTS: Record<string, TreatmentDef> = {
  'v-tox': {
    id: 'v-tox',
    name: 'V-TOX Lifting',
    blurb:
      'Tűmentes lifting kezelés a feszesebb, fiatalosabb bőrkép irányába. A finom vonalakat és a nyugalmi ráncokat célozza, miközben üdíti az arcot.',
    priceFrom: 30000, // TODO: árak
    priceTo: 55000, // TODO: árak
    priceTodo: true,
  },
  'thread-fill': {
    id: 'thread-fill',
    name: 'Thread-Fill',
    blurb:
      'Bőrtömörítő, feltöltő irányú kezelés a korai jelek megelőzésére és a bőr ruganyosságának támogatására — kifejezetten a 25–34 éves korosztálynak ajánlott belépő.',
    priceFrom: 30000, // TODO: árak
    priceTo: 50000, // TODO: árak
    priceTodo: true,
  },
  'lazer-savkomplex': {
    id: 'lazer-savkomplex',
    name: 'Lazer Savkomplex',
    blurb:
      'Intenzív hámlasztó-halványító irány az egyenetlen tónus és a pigmentfoltok oldására. Erős aktív összetevőkkel dolgozik, ezért előzetes bőrfelkészítést igényel.',
    priceFrom: 30000, // TODO: árak
    priceTo: 50000, // TODO: árak
    priceTodo: true,
  },
  'oxy-tranexamic': {
    id: 'oxy-tranexamic',
    name: 'Oxy Booster (Tranexamic / Arbutin)',
    blurb:
      'Kíméletes tónuskiegyenlítő irány érzékenyebb vagy pattanás utáni foltokra hajlamos bőrre — a foltok fokozatos halványítását támogatja erős hámlasztás nélkül.',
    priceFrom: 25000, // TODO: árak
    priceTo: 45000, // TODO: árak
    priceTodo: true,
  },
  'oxy-acne': {
    id: 'oxy-acne',
    name: 'Oxy Booster Rosacea/Acne (P.A.)',
    blurb:
      'Pórustisztító, gyulladáscsökkentő irányú kezelés pattanásra, aknés bőrképre. A bőr egyensúlyának visszaállítását és a tisztább bőrképet célozza.',
    priceFrom: 25000, // TODO: árak
    priceTo: 45000, // TODO: árak
    priceTodo: true,
  },
  'fusion-plasma': {
    id: 'fusion-plasma',
    name: 'Fusion Plasma',
    blurb:
      'Plazmaalapú, intenzív bőrmegújító irány makacs aknés bőrképre és bőrszerkezet-javításra. Erősebb beavatkozás, alapos felkészítéssel.',
    priceFrom: 35000, // TODO: árak
    priceTo: 70000, // TODO: árak
    priceTodo: true,
    onlyAtSalons: ['pest'], // csak Budapest 13. kerület (Beautyflow Pest)
  },
  'oxy-cica': {
    id: 'oxy-cica',
    name: 'Oxy Booster Rosacea (Cica)',
    blurb:
      'Nyugtató, bőrbarrier-erősítő irány pirosságra, érzékenységre, rosacea-hajlamra. A bőr megnyugtatását és a pír csökkentését célozza.',
    priceFrom: 25000, // TODO: árak
    priceTo: 45000, // TODO: árak
    priceTodo: true,
  },
  'oxy-hydra': {
    id: 'oxy-hydra',
    name: 'Oxy Booster Hydra Glow',
    blurb:
      'Mélyhidratáló, ragyogást adó irány fakó, fáradt, szárazságra hajlamos bőrre — azonnali üdeséget és kipihent külsőt céloz.',
    priceFrom: 25000, // TODO: árak
    priceTo: 45000, // TODO: árak
    priceTodo: true,
  },
  'oxy-summer': {
    id: 'oxy-summer',
    name: 'Oxy Booster Summer Glow',
    blurb:
      'Napozás utáni regeneráló, hidratáló irány, amely visszaadja a bőr egyensúlyát és frissességét a nyári terhelés után.',
    priceFrom: 25000, // TODO: árak
    priceTo: 45000, // TODO: árak
    priceTodo: true,
  },
  hack: {
    id: 'hack',
    name: 'Hack / bőrregeneráló kezelés',
    blurb:
      'Bőrregeneráló irány hegekre, striákra, tetoválás-nyomokra. A bőrfelszín megújítását támogatja. (A részletes leírás hamarosan.)',
    priceFrom: 30000, // TODO: árak
    priceTo: 60000, // TODO: árak
    priceTodo: true,
    copyTodo: true, // TODO: Hack részletes vendégbarát copy (tananyag jön)
  },
  coreapil: {
    id: 'coreapil',
    name: 'CoreaPil (kismamabarát)',
    blurb:
      'Kíméletes, kismamabarát kezelési irány, amely várandósság és szoptatás idején is választható. A bőr biztonságos ápolását és frissítését célozza — a kismamák sem maradnak ki.',
    priceFrom: 25000, // TODO: árak
    priceTo: 45000, // TODO: árak
    priceTodo: true,
    copyTodo: true, // TODO: CoreaPil részletes vendégbarát copy (tananyag jön)
  },
} as const;

export function getTreatment(id: string): TreatmentDef | undefined {
  return TREATMENTS[id];
}
