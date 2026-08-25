/**
 * Kezelés-katalógus + szalon konfiguráció a bőranalízis kvízhez.
 *
 * A kvíz ajánló-motorja (lib/recommendation.ts) ezekre az `id`-kra hivatkozik.
 * A vendégbarát leírások NEM orvosi állítások — irányt adnak, nem diagnózist.
 *
 * ÁRAK: a 2026-09-01-től érvényes hivatalos árlistából (lásd
 * `references/arlista-kozmetikai-202609.csv` és a /arak oldal). A kezeléseknek
 * FIX áruk van, nem ársávjuk — a `priceFrom === priceTo` ezt jelzi, és a
 * formatPriceRange ilyenkor egyetlen árat ír ki. A korábbi placeholder sávok
 * nemcsak a vendég-emailben látszottak, hanem a Google/Meta felé küldött
 * konverzióértéket is meghamisították (az érték a sáv közepéből számol).
 *
 * `priceFrom = priceTo = 0` → nincs listaár (egyedi ajánlat); ilyenkor a motor
 * `arSav`-ja null marad, és a felület nem ír ki árat.
 */

export interface TreatmentDef {
  id: string;
  /** Vendégnek megjelenő név — SZÓ SZERINT az árlistából. */
  name: string;
  /** Rövid, vendégbarát leírás (irány, nem diagnózis). */
  blurb: string;
  /** Listaár (HUF). 0 = egyedi ajánlat. */
  priceFrom: number;
  /** Fix árnál azonos a priceFrom-mal. */
  priceTo: number;
  /** true = nincs listaár, egyedi ajánlat készül. */
  priceTodo: boolean;
  /** Kezelés hossza percben (tájékoztató). */
  durationMin?: number;
  /** Csak ezekben a szalonokban elérhető (üres = mindenhol). */
  onlyAtSalons?: SalonId[];
  /** true = a részletes vendégbarát copy még hiányzik. */
  copyTodo?: boolean;
}

export type SalonId = 'buda' | 'pest' | 'barmely';

export interface SalonDef {
  id: Exclude<SalonId, 'barmely'>;
  name: string;
  address: string;
  /** A 13. kerületi (Pest) szalon a plazmakezelések és a bőrdiagnosztika helyszíne. */
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
    district13: true, // 13. kerület → plazmaterápia + bőrdiagnosztika itt
  },
} as const;

export function salonLabel(id: SalonId): string {
  if (id === 'buda') return SALONS.buda.name;
  if (id === 'pest') return SALONS.pest.name;
  return 'Bármelyik szalon';
}

/** Fix árú tétel rövidítése — a priceFrom/priceTo duplázás elkerülésére. */
function fix(amount: number): Pick<TreatmentDef, 'priceFrom' | 'priceTo' | 'priceTodo'> {
  return { priceFrom: amount, priceTo: amount, priceTodo: false };
}

// ============================================================
// KEZELÉSEK — az árlistán ténylegesen szereplő tételek
// ============================================================
export const TREATMENTS: Record<string, TreatmentDef> = {
  'v-tox': {
    id: 'v-tox',
    name: 'V-tox lifting kezelés',
    blurb:
      'Az arckontúrok feszesítésére és a megereszkedett bőr láthatóan liftingelt megjelenéséért. A finom vonalakat és a nyugalmi ráncokat célozza, miközben üdíti az arcot.',
    ...fix(30000),
    durationMin: 75,
  },
  'thread-fill': {
    id: 'thread-fill',
    name: 'Thread-fill kezelés',
    blurb:
      'Felszívódó kollagénszálakkal támogatja a bőr feszességét, csökkenti a finom ráncok láthatóságát — kifejezetten jó belépő a korai jelek megelőzésére.',
    ...fix(25000),
    durationMin: 60,
  },
  carboxy: {
    id: 'carboxy',
    name: 'Carboxy terápia',
    blurb:
      'Oxigénhiányos, fakó és fáradt bőr revitalizálására. Visszaadja a bőr ragyogását — jó választás esemény előtti frissítésnek is.',
    ...fix(25000),
    durationMin: 75,
  },
  'lazer-peel': {
    id: 'lazer-peel',
    name: 'Lazer Peel kezelés',
    blurb:
      'Hiperpigmentáció elleni bőregységesítő kezelés az egyenetlen tónus és a pigmentfoltok halványítására. Aktív összetevőkkel dolgozik, ezért előzetes bőrfelkészítést igényel.',
    ...fix(25000),
    durationMin: 60,
  },
  bioherb50: {
    id: 'bioherb50',
    name: 'BioHerb50 kezelés',
    blurb:
      'Sav nélküli hámlasztás pigmentfoltokra és aknéra — kíméletesebb út a tónuskiegyenlítéshez, ami nyáron is biztonságos.',
    ...fix(30000),
    durationMin: 75,
  },
  'inflacure-krx': {
    id: 'inflacure-krx',
    name: 'Inflacure KRX',
    blurb:
      'Rosaceás, aknés és gyulladt bőr megnyugtatására. A pír csökkentését és a kiegyensúlyozottabb, tisztább bőrképet célozza.',
    ...fix(30000),
    durationMin: 75,
  },
  'recovery-exosode': {
    id: 'recovery-exosode',
    name: 'Recovery Exosode kezelés',
    blurb:
      'Érzékeny vagy ekcémára hajlamos bőr regenerálására és a bőr védőrétegének helyreállítására. Nyugtató, barrier-erősítő irány.',
    ...fix(25000),
    durationMin: 60,
  },
  'hydra-arc': {
    id: 'hydra-arc',
    name: 'Hydra tisztító kezelés – arc',
    blurb:
      'Intenzív mélytisztítás és hidratálás egy kezelésben. Eltömődött pórusokra, fakó, vízhiányos bőrre — azonnal üdébb bőrkép.',
    ...fix(30000),
    durationMin: 75,
  },
  'carbon-arc': {
    id: 'carbon-arc',
    name: 'Carbon peeling – arc',
    blurb:
      'Mélytisztítás, pórusösszehúzás és ragyogóbb bőrkép. Zsírosodásra hajlamos, tág pórusú bőrre az egyik legcélzottabb választás.',
    ...fix(25000),
    durationMin: 60,
  },
  'korea-peel': {
    id: 'korea-peel',
    name: 'Korea Peel – Dactor Peel',
    blurb:
      'Kíméletes bőrmegújító kezelés, amely nyáron és várandósság alatt is biztonságos. A kismamák sem maradnak ki nálunk.',
    ...fix(25000),
    durationMin: 60,
  },
  'plasma-therapy': {
    id: 'plasma-therapy',
    name: 'Plasma Therapy',
    blurb:
      'Látványos bőrfeszesítés és kollagéntermelés-serkentés — természetes lifting hatás műtét nélkül.',
    ...fix(35000),
    durationMin: 60,
    onlyAtSalons: ['pest'], // a plazmakezelések kizárólag a pesti szalonban
  },
  hegkezeles: {
    id: 'hegkezeles',
    name: 'Hegkezelés / bőrregeneráló kezelés',
    blurb:
      'Műtéti és aknés hegekre, striákra, hegesre tetovált bőrre. A bőrfelszín megújítását támogatja — az ár a kezelendő terület alapján, egyedi ajánlattal.',
    priceFrom: 0, // egyedi ajánlat — nincs listaár
    priceTo: 0,
    priceTodo: true,
  },
} as const;

export function getTreatment(id: string): TreatmentDef | undefined {
  return TREATMENTS[id];
}
