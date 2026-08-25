/**
 * Ajánló / pontozó motor — TISZTA függvény, mellékhatás nélkül.
 *
 * Bemenet: az összes kvíz-válasz.
 * Kimenet: { profil, ajánlott kezelés(ek), ársáv, flagek, kontraindikációk, útvonal }.
 *
 * FONTOS sorrend:
 *   1. Bőrprofil számítása (Baumann-szerű 4 tengely).
 *   2. Kontraindikáció-FELÜLBÍRÁLÁS (ez minden mást felülír).
 *   3. Ha nincs kizárás: panasz → kezelés leképezés.
 *
 * Az eredmény IRÁNY, nem diagnózis. A motor mindkét oldalon fut
 * (szerver az /api/boranalizis-ben), ezért semmilyen platform-specifikus
 * importot nem használ.
 */

import type {
  QuizAnswers,
  Recommendation,
  RecommendedTreatment,
  RouteKind,
  SkinProfile,
} from './types';
import { TREATMENTS, type SalonId } from '../config/treatments';
import { formatPriceRange } from './i18n';

// ---- segédek -----------------------------------------------------------

function asString(v: string | string[] | undefined): string {
  return typeof v === 'string' ? v : '';
}
function asArray(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v) return [v];
  return [];
}
/** A „dry-2", „sens-3", „pig-1" stb. értékek számjegy-utótagja. */
function suffixNum(value: string): number {
  const m = value.match(/-(\d+)/);
  return m ? Number(m[1]) : 0;
}

// ---- 1. Bőrprofil ------------------------------------------------------

function computeProfile(a: QuizAnswers): SkinProfile {
  // Hidratáltság tengely: Q2 (zsir-1) + Q3 (zsir-2)
  const z1 = asString(a['bortipus-zsir-1']); // dry-0 | oily-2 | combo-1 | dry-2
  const z2 = asString(a['bortipus-zsir-2']); // dry-0 | dry-1 | dry-2

  let oily = 0;
  let dry = 0;
  if (z1.startsWith('oily')) oily += suffixNum(z1);
  if (z1.startsWith('dry')) dry += suffixNum(z1);
  if (z1.startsWith('combo')) oily += 1; // T-zónás
  if (z2.startsWith('dry')) dry += suffixNum(z2);

  const combo = z1.startsWith('combo');
  let hydration: SkinProfile['hydration'];
  if (combo) hydration = 'Vegyes';
  else if (oily >= 2 && dry === 0) hydration = 'Zsíros';
  else if (dry >= 3) hydration = 'Száraz';
  else if (dry >= 1 && oily === 0) hydration = 'Száraz';
  else if (oily >= 1 && dry >= 1) hydration = 'Vegyes';
  else hydration = 'Normál';

  // Érzékenység tengely: Q4 (erzekeny-1) + Q5 (erzekeny-2)
  const e1 = asString(a['bortipus-erzekeny-1']); // res-0 | sens-1 | sens-2 | sens-2b
  const e2 = asString(a['bortipus-erzekeny-2']); // res-0 | sens-1 | sens-3
  let sensScore = 0;
  if (e1.startsWith('sens')) sensScore += suffixNum(e1) || (e1 === 'sens-2b' ? 2 : 1);
  if (e2.startsWith('sens')) sensScore += suffixNum(e2);
  const sensitivity: SkinProfile['sensitivity'] = sensScore >= 2 ? 'Érzékeny' : 'Ellenálló';

  // Pigment tengely: Q6
  const pig = asString(a['bortipus-pigment']); // pig-0 | pig-1 | pig-2 | pih-2
  const pigmentProne = pig === 'pig-1' || pig === 'pig-2' || pig === 'pih-2';

  // Ránc tengely: Q7 (+ kor Q8)
  const wr = suffixNum(asString(a['bortipus-ranc'])); // 0..3
  const kor = asString(a['eletkor']);
  const ageBump = kor === 'kor-45' || kor === 'kor-55' ? 1 : 0;
  const wrTotal = wr + ageBump;
  const wrinkleTendency: SkinProfile['wrinkleTendency'] =
    wrTotal >= 3 ? 'magas' : wrTotal >= 2 ? 'közepes' : 'alacsony';

  // Vendégbarát összefűzött címke
  const parts = [hydration.toLowerCase()];
  parts.push(sensitivity === 'Érzékeny' ? 'érzékeny' : 'ellenálló');
  if (pigmentProne) parts.push('pigmentációra hajlamos');
  if (wrinkleTendency !== 'alacsony') parts.push(`${wrinkleTendency} ránchajlam`);
  const label = parts.join(', ');

  return { hydration, sensitivity, pigmentProne, wrinkleTendency, label };
}

// ---- kezelés → RecommendedTreatment ------------------------------------

function pick(id: string, locationNote?: string): RecommendedTreatment {
  const t = TREATMENTS[id];
  if (!t) {
    // Sosem fordulhat elő helyes id-vel; védő ág.
    return {
      id,
      name: id,
      blurb: '',
      priceFrom: 0,
      priceTo: 0,
      priceTodo: true,
    };
  }
  return {
    id: t.id,
    name: t.name,
    blurb: t.blurb,
    priceFrom: t.priceFrom,
    priceTo: t.priceTo,
    priceTodo: t.priceTodo,
    copyTodo: t.copyTodo,
    locationNote,
  };
}

function salonOf(a: QuizAnswers): SalonId {
  const s = asString(a['szalon']);
  if (s === 'szalon-buda') return 'buda';
  if (s === 'szalon-pest') return 'pest';
  return 'barmely';
}

/** Plazmaterápia csak Pesten (13. ker.) vagy ha nincs szalon-preferencia. */
function plasmaAllowed(salon: SalonId): boolean {
  return salon === 'pest' || salon === 'barmely';
}

// ---- fő motor ----------------------------------------------------------

export function recommend(a: QuizAnswers): Recommendation {
  const profile = computeProfile(a);
  const flags: string[] = [];
  const kontraindikaciok: string[] = [];

  const panasz = asString(a['fo-panasz']);
  const cel = asString(a['cel']);
  const kor = asString(a['eletkor']);
  const salon = salonOf(a);
  const age35plus = kor === 'kor-35' || kor === 'kor-45' || kor === 'kor-55';

  const aktivHatoanyag = asArray(a['aktiv-hatoanyag']);
  const usesAcidOrRetinol =
    aktivHatoanyag.includes('ret') ||
    aktivHatoanyag.includes('avit') ||
    aktivHatoanyag.includes('sav');

  const varandos = asString(a['varandos-szoptat']); // var-igen | var-szoptat | var-nem
  const isPregnantOrNursing = varandos === 'var-igen' || varandos === 'var-szoptat';

  const allergia = asString(a['allergia']); // all-nincs | all-igen
  const hasAllergy = allergia === 'all-igen';

  const aktivProblema = asArray(a['aktiv-borproblema']); // herpesz/fertozes/napeges/serult/egyik-sem
  const hasActiveSkinIssue = ['herpesz', 'fertozes', 'napeges', 'serult'].some((k) =>
    aktivProblema.includes(k),
  );

  const kezelesAlatt = asArray(a['kezeles-alatt']); // kronikus/autoimmun/cukor/daganat/egyik-sem
  const hasMedicalCondition = ['autoimmun', 'cukor', 'daganat'].some((k) =>
    kezelesAlatt.includes(k),
  );
  const hasChronicSkin = kezelesAlatt.includes('kronikus');

  const beavatkozas = asString(a['beavatkozas']); // botox-1ho | szemmutet-6ho | beav-nem
  const fenyGyogyszer = asString(a['fenyerzekenyito-gyogyszer']); // fe-igen | fe-nem | fe-nemtudom

  // --- Aktív hatóanyag flag (időzítés) ---
  if (usesAcidOrRetinol) {
    flags.push(
      'Retinol / A-vitamin / savas hámlasztó használatban — a kezelés előtt 3–5 nappal szüneteltetni kell.',
    );
    kontraindikaciok.push(
      'Mivel jelenleg retinolt / savas hámlasztót használsz, a kezelés előtt 3–5 nappal ezt szüneteltetni kell. Azonnali savas kezelést nem javaslunk.',
    );
  }
  // --- Időzítési kontraindikációk ---
  if (beavatkozas === 'botox-1ho') {
    flags.push('1 hónapon belüli botox/filler — bizonyos kezeléseknél időzítési kivárás szükséges.');
  }
  if (fenyGyogyszer === 'fe-igen') {
    flags.push('Fényérzékenyítő gyógyszer — fény-/lézeralapú kezeléseknél fokozott óvatosság.');
    kontraindikaciok.push(
      'Mivel fényérzékenyítő gyógyszert szedsz, a fény- és lézeralapú kezeléseknél fokozottan óvatosak vagyunk; a részleteket a személyes vizsgálaton beszéljük át.',
    );
  }
  // Ismert allergia → a savas/aktív hámlasztó irány (Lazer Peel) kizárva
  if (hasAllergy) {
    flags.push('Ismert allergia jelzett — a Lazer Peel kizárva, allergének egyeztetése szükséges.');
  }

  // ============================================================
  // 2. KONTRAINDIKÁCIÓ-FELÜLBÍRÁLÁS (minden mást felülír)
  // ============================================================

  // 2a. Aktív bőrprobléma → „először gyógyuljon a bőr"
  if (hasActiveSkinIssue) {
    const which = aktivProblema
      .filter((k) => ['herpesz', 'fertozes', 'napeges', 'serult'].includes(k))
      .join(', ');
    flags.push(`Aktív bőrprobléma (${which}) — kezelés csak gyógyulás után.`);
    return buildResult({
      profile,
      treatments: [pick('korea-peel')], // kíméletes irány, de a fő üzenet a halasztás
      flags,
      kontraindikaciok,
      utvonal: 'gyogyuljon',
      safe: false,
      routeMessage:
        'Mivel jelenleg aktív bőrproblémád van (pl. herpesz, gyulladás, friss napégés vagy sérült bőr), először hagyjuk, hogy a bőröd meggyógyuljon. A kezelést későbbre időzítjük, és egy kíméletes, regeneráló iránnyal indítunk. A pontos tervet a személyes vizsgálaton állítjuk össze.',
    });
  }

  // 2b. Várandós / szoptató → kíméletes / Korea Peel, savas+gépi TILTVA
  if (isPregnantOrNursing) {
    flags.push(
      'Várandós/szoptató — savas (Lazer Peel) és gépi kezelések TILTVA. Irány: kíméletes / Korea Peel.',
    );
    return buildResult({
      profile,
      treatments: [pick('korea-peel')],
      flags,
      kontraindikaciok,
      utvonal: 'kismama',
      safe: false,
      routeMessage:
        'Várandósan és szoptatás idején a kismamák sem maradnak ki nálunk! Ilyenkor a savas hámlasztó és a gépi kezelések helyett egy kíméletes, kismamabarát irányt (Korea Peel) javaslunk, ami biztonságos ebben az időszakban. A pontos, biztonságos tervet a személyes konzultáción állítjuk össze.',
    });
  }

  // 2c. Krónikus/autoimmun/cukor/daganat → óvatos, orvosi egyeztetés
  if (hasMedicalCondition || hasChronicSkin) {
    flags.push(
      'Krónikus/autoimmun/anyagcsere/onkológiai háttér — csak nem-invazív irány, orvosi egyeztetés ajánlott.',
    );
    kontraindikaciok.push(
      'A megadott egészségügyi háttér miatt csak kíméletes, nem-invazív irányt javaslunk, és ajánljuk, hogy a kezelést előzetesen egyeztesd a kezelőorvosoddal.',
    );
    // Kíméletes, nem-invazív alapirány a profil szerint (nincs savas/gépi).
    const gentle =
      profile.sensitivity === 'Érzékeny' ? pick('recovery-exosode') : pick('hydra-arc');
    return buildResult({
      profile,
      treatments: [gentle],
      flags,
      kontraindikaciok,
      utvonal: 'ovatos',
      safe: false,
      routeMessage:
        'A megadott egészségügyi háttér miatt óvatosak vagyunk: csak kíméletes, nem-invazív irányt javaslunk, és érdemes a kezelést a kezelőorvosoddal is egyeztetni. A személyes vizsgálaton mindezt figyelembe véve állítjuk össze a tervet.',
    });
  }

  // ============================================================
  // 3. PANASZ → KEZELÉS leképezés (nincs kemény kizárás)
  // ============================================================

  const treatments: RecommendedTreatment[] = [];
  const sensitive = profile.sensitivity === 'Érzékeny';
  const pig = asString(a['bortipus-pigment']);
  const szemmutetBlocksVtox = beavatkozas === 'szemmutet-6ho';

  switch (panasz) {
    case 'rancok': {
      if (age35plus) {
        if (szemmutetBlocksVtox) {
          flags.push('6 hónapon belüli szemműtét — V-TOX 6 hónapig kizárva.');
          treatments.push(pick('thread-fill'));
        } else {
          treatments.push(pick('v-tox'));
          treatments.push(pick('thread-fill')); // opcionális kombináció
        }
        // Erősebb feszesítő alternatíva — a plazmakezelés csak Pesten (13. ker.).
        if (plasmaAllowed(salon)) {
          treatments.push(
            pick(
              'plasma-therapy',
              salon === 'barmely'
                ? 'Csak a Beautyflow Pest (13. ker.) szalonban elérhető.'
                : undefined,
            ),
          );
        } else {
          flags.push(
            'Plasma Therapy csak Beautyflow Pest (13. ker.) — a választott szalonban nem elérhető.',
          );
        }
      } else {
        treatments.push(pick('thread-fill'));
      }
      break;
    }
    case 'pigment': {
      if (pig === 'pih-2') {
        // pattanás utáni elszíneződés → kíméletesebb, sav nélküli irány
        treatments.push(pick('bioherb50'));
      } else if (!sensitive && !usesAcidOrRetinol && !hasAllergy) {
        treatments.push(pick('lazer-peel'));
      } else {
        // érzékenyebb / sav-retinol / allergia → kíméletes tónuskiegyenlítés
        treatments.push(pick('bioherb50'));
      }
      break;
    }
    case 'akne': {
      treatments.push(pick('inflacure-krx'));
      treatments.push(pick('hydra-arc')); // mélytisztítás az eltömődött pórusokra
      break;
    }
    case 'rosacea': {
      treatments.push(pick('inflacure-krx'));
      break;
    }
    case 'porus': {
      // zsíros / tág pórus → pórusösszehúzó, mélytisztító irány
      treatments.push(pick('carbon-arc'));
      break;
    }
    case 'fako': {
      treatments.push(pick('carboxy'));
      break;
    }
    case 'szaraz': {
      treatments.push(pick('hydra-arc'));
      break;
    }
    case 'heg': {
      treatments.push(pick('hegkezeles'));
      break;
    }
    case 'nem-tudom':
    default: {
      // Profil + cél alapján a legjobb illeszkedés.
      if (cel === 'cel-feszes' || profile.wrinkleTendency === 'magas') {
        treatments.push(age35plus ? pick('v-tox') : pick('thread-fill'));
      } else if (cel === 'cel-tiszta') {
        treatments.push(pick('hydra-arc'));
      } else if (cel === 'cel-folt' || profile.pigmentProne) {
        treatments.push(sensitive ? pick('bioherb50') : pick('lazer-peel'));
      } else if (sensitive) {
        treatments.push(pick('recovery-exosode'));
      } else {
        treatments.push(pick('hydra-arc')); // alapértelmezés: Hydra tisztító
      }
      break;
    }
  }

  // Esemény előtti kontextus: ha a cél az esemény előtti ragyogás és nincs
  // erősebb indok, a revitalizáló Carboxy terápiát is felajánljuk.
  if (cel === 'cel-esemeny' && !treatments.some((tt) => tt.id === 'carboxy')) {
    treatments.push(pick('carboxy'));
  }

  // Védőháló: ha valamiért üres maradt
  if (treatments.length === 0) treatments.push(pick('hydra-arc'));

  return buildResult({
    profile,
    treatments,
    flags,
    kontraindikaciok,
    utvonal: 'normal',
    safe: true,
  });
}

// ---- eredmény-összeállító (ársáv számítás) -----------------------------

function buildResult(input: {
  profile: SkinProfile;
  treatments: RecommendedTreatment[];
  flags: string[];
  kontraindikaciok: string[];
  utvonal: RouteKind;
  safe: boolean;
  routeMessage?: string;
}): Recommendation {
  const { treatments } = input;
  // Ársáv: a kiemelt (első) kezelés tartománya. PLACEHOLDER árak.
  let arSav: Recommendation['arSav'] = null;
  if (treatments.length > 0 && treatments[0].priceTo > 0) {
    const min = treatments[0].priceFrom;
    const max = treatments[0].priceTo;
    arSav = { min, max, formatted: formatPriceRange(min, max) };
  }
  return { ...input, arSav };
}
