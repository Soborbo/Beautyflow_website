/**
 * Típusdefiníciók a bőranalízis kvízhez.
 * A kvíz = több lépcsős kérdőív; az ajánló-motor tiszta függvény.
 */

export type QuestionType = 'radio' | 'checkbox';

export interface RevealTextField {
  /** mező neve a payloadban */
  name: string;
  label: string;
  placeholder: string;
}

export interface QuestionOption {
  value: string;
  label: string;
  /** Képes kártyához: opcionális kép URL (1:1 arány). */
  image?: string;
  /** Ha ezt választják, megjelenik egy opcionális szabad szövegmező (pl. Q15 „Mire?"). */
  revealText?: RevealTextField;
  /** „Egyik sem" jellegű opció — kijelölésekor a többi checkbox törlődik. */
  exclusive?: boolean;
}

export interface Question {
  /** kebab-case azonosító, ez kerül a válasz-objektumba (és a Sheetbe). */
  id: string;
  type: QuestionType;
  question: string;
  help?: string;
  options: QuestionOption[];
  /** Képes válaszkártyaként jelenjen meg. */
  pictureCards?: boolean;
  /** Checkboxnál: hány kijelölés kell a továbblépéshez (alapért. 1). */
  minSelect?: number;
  /** Kritikus kérdés (pl. kontraindikáció) — csak jelölés a kódban. */
  critical?: boolean;
}

export interface Section {
  id: string;
  title: string;
  /** Rövid bevezető a szakasz tetején. */
  intro?: string;
  questions: Question[];
}

/** A kvíz nyers válaszai: radio → string, checkbox → string[], szabad szöveg → string. */
export type QuizAnswers = Record<string, string | string[]>;

// ---- Ajánló-motor kimenete --------------------------------------------

export interface SkinProfile {
  hydration: 'Száraz' | 'Vegyes' | 'Zsíros' | 'Normál';
  sensitivity: 'Érzékeny' | 'Ellenálló';
  pigmentProne: boolean;
  wrinkleTendency: 'alacsony' | 'közepes' | 'magas';
  /** Vendégbarát, összefűzött mondat, pl. „vegyes, érzékeny, pigmentációra hajlamos". */
  label: string;
}

export interface RecommendedTreatment {
  id: string;
  name: string;
  blurb: string;
  /** Becsült ársáv (HUF) — PLACEHOLDER, az operátor felülírja. */
  priceFrom: number;
  priceTo: number;
  priceTodo: boolean;
  /** Helyfüggő megjegyzés (pl. „csak Beautyflow Pest"). */
  locationNote?: string;
  copyTodo?: boolean;
}

export type RouteKind =
  | 'normal' // sima ajánlott irány
  | 'kismama' // várandós / szoptató → kíméletes / CoreaPil
  | 'gyogyuljon' // aktív bőrprobléma → először gyógyuljon a bőr
  | 'ovatos'; // krónikus/autoimmun/stb. → óvatos, orvosi egyeztetés

export interface Recommendation {
  profile: SkinProfile;
  /** Ajánlott kezelés(ek) iránya (kontraindikáció esetén a biztonságos alternatíva). */
  treatments: RecommendedTreatment[];
  /** Becsült összesített ársáv a kiemelt kezelés alapján (PLACEHOLDER). */
  arSav: { min: number; max: number; formatted: string } | null;
  /** Kozmetikusnak szóló jelzések (belső). */
  flags: string[];
  /** Vendégnek szóló biztonsági megjegyzések. */
  kontraindikaciok: string[];
  utvonal: RouteKind;
  /** false, ha biztonsági út felülírja a sima ajánlást. */
  safe: boolean;
  /** Vendégnek szóló útvonal-magyarázat (kontraindikáció esetén). */
  routeMessage?: string;
}
