/**
 * A bőranalízis kvíz teljes kérdéssora — 6 szakasz, ~20 kérdés.
 * A hosszúságot a UI vizuálisan elrejti (szakaszonkénti haladásjelző).
 *
 * A `*-N` opcióértékek egy Baumann-szerű 4-tengelyes pontozást táplálnak,
 * lásd lib/recommendation.ts. A `value` az, amit a routing és a Sheets tárol.
 *
 * Q23 (kontakt) a KAPU — nem itt, hanem a ContactGate lépésben renderelődik.
 */

import type { Section } from '../lib/types';

export const SECTIONS: Section[] = [
  // ---- Szakasz 1 — Mi zavar most? (hook) -------------------------------
  {
    id: 'panasz',
    title: 'Mi zavar most?',
    questions: [
      {
        id: 'fo-panasz',
        type: 'radio',
        pictureCards: true,
        question: 'Mi az, ami most a legjobban zavar a bőrödön?',
        options: [
          { value: 'fako', label: 'Fakó, fáradt arcbőr' },
          { value: 'rancok', label: 'Ráncok, megereszkedett bőr' },
          { value: 'pigment', label: 'Pigmentfoltok, egyenetlen tónus' },
          { value: 'akne', label: 'Pattanások, aknés bőr' },
          { value: 'rosacea', label: 'Pirosság, érzékenység' },
          { value: 'porus', label: 'Tág pórusok, zsíros bőr' },
          { value: 'szaraz', label: 'Szárazság, feszülő bőr' },
          { value: 'heg', label: 'Heg, striák, tetoválás nyoma' },
          { value: 'nem-tudom', label: 'Még nem tudom – segítsetek kideríteni' },
        ],
      },
    ],
  },

  // ---- Szakasz 2 — A bőröd típusa (Baumann 4 tengely) ------------------
  {
    id: 'bortipus',
    title: 'A bőröd típusa',
    intro: 'Néhány kérdés, hogy pontosan megértsük, milyen a bőröd.',
    questions: [
      {
        id: 'bortipus-zsir-1',
        type: 'radio',
        question: 'Pár órával a reggeli arcmosás után milyen a bőröd?',
        options: [
          { value: 'dry-0', label: 'Mattul, kényelmes' },
          { value: 'oily-2', label: 'Az egész arcom fényesedik' },
          { value: 'combo-1', label: 'Csak a T-zónám fényesedik, az arcom száraz' },
          { value: 'dry-2', label: 'Feszül, néhol hámlik' },
        ],
      },
      {
        id: 'bortipus-zsir-2',
        type: 'radio',
        question: 'Mosakodás után, krém nélkül milyen az érzés?',
        options: [
          { value: 'dry-0', label: 'Kényelmes, nem érzem' },
          { value: 'dry-1', label: 'Kicsit feszül, de elmúlik' },
          { value: 'dry-2', label: 'Erősen feszül, húzódik, viszket' },
        ],
      },
      {
        id: 'bortipus-zsir-3',
        type: 'radio',
        question: 'Milyennek látod a pórusaidat?',
        options: [
          { value: 'od3-0', label: 'Alig láthatók' },
          { value: 'od3-1', label: 'Apró pórusok a T-zónában' },
          { value: 'od3-2', label: 'Jól látható pórusok a T-zónában' },
          { value: 'od3-3', label: 'Nagy, látható pórusok az arc nagy részén' },
        ],
      },
      {
        id: 'bortipus-erzekeny-1',
        type: 'radio',
        question: 'Hogyan reagál a bőröd új arcápoló termékre?',
        options: [
          { value: 'res-0', label: 'Bármit használhatok, nem reagál' },
          { value: 'sens-1', label: 'Néha kipirosodik, csíp' },
          { value: 'sens-2', label: 'Gyakran kipirosodik, csíp, viszket' },
          { value: 'sens-2b', label: 'Gyakran pattanás/kiütés jelenik meg tőle' },
        ],
      },
      {
        id: 'bortipus-erzekeny-2',
        type: 'radio',
        question: 'Bepirosodik a bőröd nap, hő, fűszeres étel vagy stressz hatására?',
        options: [
          { value: 'res-0', label: 'Soha' },
          { value: 'sens-1', label: 'Néha' },
          { value: 'sens-3', label: 'Gyakran, tartós pír vagy látható erek' },
        ],
      },
      {
        id: 'bortipus-erzekeny-3',
        type: 'radio',
        question: 'Hajlamos vagy apró kiütésekre, pattanásokra vagy viszketésre?',
        options: [
          { value: 'sr3-0', label: 'Soha' },
          { value: 'sr3-1', label: 'Nagyon ritkán' },
          { value: 'sr3-2', label: 'Időnként előfordul' },
          { value: 'sr3-3', label: 'Visszatérően jelen van' },
        ],
      },
      {
        id: 'bortipus-pigment',
        type: 'radio',
        question: 'Vannak-e barna foltok, egyenetlen elszíneződések az arcodon?',
        options: [
          { value: 'pig-0', label: 'Nincsenek' },
          { value: 'pig-1', label: '1–2 kisebb folt' },
          { value: 'pig-2', label: 'Több folt / napfoltok' },
          { value: 'pih-2', label: 'Pattanás vagy gyulladás után sötét foltok maradnak' },
        ],
      },
      {
        id: 'bortipus-pigment-2',
        type: 'radio',
        question: 'Egy pattanás vagy kiütés után marad-e sötét folt a helyén?',
        options: [
          { value: 'pn2-0', label: 'Soha' },
          { value: 'pn2-1', label: 'Ritkán, és hamar elhalványul' },
          { value: 'pn2-2', label: 'Gyakran, és sokáig megmarad' },
          { value: 'pn2-3', label: 'Szinte mindig, és makacsul' },
        ],
      },
      {
        id: 'bortipus-pigment-3',
        type: 'radio',
        question: 'Mennyire egységes a bőröd tónusa összességében?',
        options: [
          { value: 'pn3-0', label: 'Teljesen egyenletes' },
          { value: 'pn3-1', label: 'Nagyjából egyenletes' },
          { value: 'pn3-2', label: 'Helyenként egyenetlen' },
          { value: 'pn3-3', label: 'Kifejezetten foltos, egyenetlen' },
        ],
      },
      {
        id: 'bortipus-ranc',
        type: 'radio',
        question:
          'Vannak-e ráncok, amik nyugalmi állapotban (nem mosolygás közben) is látszanak?',
        options: [
          { value: 'wr-0', label: 'Nincsenek' },
          { value: 'wr-1', label: 'Finom vonalak a szem körül' },
          { value: 'wr-2', label: 'Kifejezett mimikai ráncok (homlok, szem)' },
          { value: 'wr-3', label: 'Mélyebb ráncok, megereszkedés' },
        ],
      },
    ],
  },

  // ---- Szakasz 3 — Életkor & életmód -----------------------------------
  {
    id: 'eletmod',
    title: 'Életkor & életmód',
    questions: [
      {
        id: 'eletkor',
        type: 'radio',
        question: 'Hány éves vagy?',
        options: [
          { value: 'kor-24', label: '24 vagy fiatalabb' },
          { value: 'kor-25', label: '25–34' },
          { value: 'kor-35', label: '35–44' },
          { value: 'kor-45', label: '45–54' },
          { value: 'kor-55', label: '55+' },
        ],
      },
      {
        id: 'fenyvedo',
        type: 'radio',
        question: 'Milyen gyakran használsz fényvédőt?',
        options: [
          { value: 'fv-nap', label: 'Naponta' },
          { value: 'fv-nyar', label: 'Csak nyáron' },
          { value: 'fv-ritka', label: 'Ritkán' },
          { value: 'fv-soha', label: 'Soha' },
        ],
      },
      {
        id: 'dohanyzas',
        type: 'radio',
        question: 'Dohányzol?',
        options: [
          { value: 'doh-nem', label: 'Nem' },
          { value: 'doh-neha', label: 'Alkalmanként' },
          { value: 'doh-igen', label: 'Rendszeresen' },
        ],
      },
    ],
  },

  // ---- Szakasz 4 — Tapasztalat & otthoni rutin -------------------------
  {
    id: 'rutin',
    title: 'Tapasztalat & rutin',
    questions: [
      {
        id: 'tapasztalat',
        type: 'radio',
        question: 'Jártál már korábban arc-/esztétikai kezelésen?',
        options: [
          { value: 'tap-rendszeres', label: 'Rendszeresen járok' },
          { value: 'tap-neha', label: 'Néha' },
          { value: 'tap-soha', label: 'Még soha' },
        ],
      },
      {
        id: 'otthoni-rutin',
        type: 'radio',
        question: 'Milyen most az otthoni arcápolási rutinod?',
        options: [
          { value: 'rut-mosakodas', label: 'Csak mosakodás' },
          { value: 'rut-alap', label: 'Mosakodás + krém' },
          { value: 'rut-tobb', label: 'Többlépcsős (szérum, stb.)' },
          { value: 'rut-nincs', label: 'Nincs igazi rutinom' },
        ],
      },
      {
        id: 'aktiv-hatoanyag',
        type: 'checkbox',
        critical: true,
        question: 'Használsz jelenleg ezek közül valamit?',
        help: 'Több is választható. Fontos a kezelés biztonságos időzítéséhez.',
        options: [
          { value: 'ret', label: 'Retinol' },
          { value: 'avit', label: 'A-vitamin krém vagy gyógyszer' },
          { value: 'sav', label: 'Savas hámlasztó (AHA/BHA)' },
          { value: 'szarito', label: 'Erős szárító termékek' },
          { value: 'egyik-sem', label: 'Egyiket sem', exclusive: true },
        ],
      },
    ],
  },

  // ---- Szakasz 5 — Biztonsági szűrés (kontraindikációk) ----------------
  {
    id: 'biztonsag',
    title: 'Biztonsági szűrés',
    intro: 'Ezek a kérdések azért fontosak, hogy a számodra legbiztonságosabb irányt javasoljuk.',
    questions: [
      {
        id: 'varandos-szoptat',
        type: 'radio',
        critical: true,
        question: 'Jelenleg várandós vagy, vagy szoptatsz?',
        options: [
          { value: 'var-igen', label: 'Igen, várandós' },
          { value: 'var-szoptat', label: 'Igen, szoptatok' },
          { value: 'var-nem', label: 'Nem' },
        ],
      },
      {
        id: 'allergia',
        type: 'radio',
        critical: true,
        question: 'Van ismert allergiád (pl. aszpirin, kozmetikai összetevők)?',
        options: [
          { value: 'all-nincs', label: 'Nincs' },
          {
            value: 'all-igen',
            label: 'Igen',
            revealText: {
              name: 'allergia-reszletek',
              label: 'Mire? (nem kötelező)',
              placeholder: 'Pl. aszpirin, illatanyagok…',
            },
          },
        ],
      },
      {
        id: 'aktiv-borproblema',
        type: 'checkbox',
        critical: true,
        question: 'Van jelenleg aktív bőrproblémád ezek közül?',
        help: 'Több is választható.',
        options: [
          { value: 'herpesz', label: 'Aktív herpesz' },
          { value: 'fertozes', label: 'Bőrfertőzés, gyulladás' },
          { value: 'napeges', label: 'Friss napégés' },
          { value: 'serult', label: 'Sérült, felsebzett bőr' },
          { value: 'egyik-sem', label: 'Egyik sem', exclusive: true },
        ],
      },
      {
        id: 'kezeles-alatt',
        type: 'checkbox',
        critical: true,
        question: 'Kezelnek jelenleg ezek valamelyikével?',
        help: 'Több is választható.',
        options: [
          { value: 'kronikus', label: 'Krónikus bőrbetegség (ekcéma, pikkelysömör)' },
          { value: 'autoimmun', label: 'Autoimmun betegség' },
          { value: 'cukor', label: 'Cukorbetegség' },
          { value: 'daganat', label: 'Daganatos kezelés' },
          { value: 'egyik-sem', label: 'Egyik sem', exclusive: true },
        ],
      },
      {
        id: 'beavatkozas',
        type: 'radio',
        critical: true,
        question: 'Volt az elmúlt 1 hónapban botox/filler, vagy 6 hónapban szemműtét?',
        options: [
          { value: 'botox-1ho', label: 'Igen, botox/filler (1 hónapon belül)' },
          { value: 'szemmutet-6ho', label: 'Igen, szemműtét (6 hónapon belül)' },
          { value: 'beav-nem', label: 'Nem' },
        ],
      },
      {
        id: 'fenyerzekenyito-gyogyszer',
        type: 'radio',
        critical: true,
        question: 'Szedsz olyan gyógyszert, ami fényérzékennyé tesz?',
        options: [
          { value: 'fe-igen', label: 'Igen' },
          { value: 'fe-nem', label: 'Nem' },
          { value: 'fe-nemtudom', label: 'Nem tudom' },
        ],
      },
    ],
  },

  // ---- Szakasz 6 — Cél, sürgősség, szalon (a kontakt KAPU ezután jön) ---
  {
    id: 'cel',
    title: 'Célod & a szalon',
    questions: [
      {
        id: 'cel',
        type: 'radio',
        pictureCards: true,
        question: 'Mi lenne számodra a legjobb eredmény?',
        options: [
          { value: 'cel-ude', label: 'Üdébb, kipihentebb arc' },
          { value: 'cel-feszes', label: 'Feszesebb, fiatalosabb bőr' },
          { value: 'cel-tiszta', label: 'Tiszta, egyenletes bőrkép pattanások nélkül' },
          { value: 'cel-folt', label: 'Halványabb foltok, egységes tónus' },
          { value: 'cel-esemeny', label: 'Ragyogás egy közelgő esemény előtt' },
          { value: 'cel-megujulas', label: 'Hosszú távú, mélyről jövő bőrmegújulás' },
        ],
      },
      {
        id: 'surgosseg',
        type: 'radio',
        question: 'Mikorra terveznéd?',
        options: [
          { value: 'surg-most', label: 'Minél hamarabb' },
          { value: 'surg-1ho', label: '1 hónapon belül' },
          { value: 'surg-nezelodom', label: 'Csak nézelődöm egyelőre' },
        ],
      },
      {
        id: 'szalon',
        type: 'radio',
        question: 'Melyik szalon a közelebbi hozzád?',
        options: [
          { value: 'szalon-buda', label: 'Beautyflow Buda (1116, Vegyész u. 1.)' },
          { value: 'szalon-pest', label: 'Beautyflow Pest (1135, Reitter Ferenc u. 90.)' },
          { value: 'szalon-barmely', label: 'Nincs preferenciám' },
        ],
      },
    ],
  },
];

/** Lapított kérdéslista (a kliens állapotgéphez). */
export const ALL_QUESTIONS = SECTIONS.flatMap((s) => s.questions);

/** Hány kérdés van összesen (a kontakt kapu nélkül). */
export const TOTAL_QUESTIONS = ALL_QUESTIONS.length;
