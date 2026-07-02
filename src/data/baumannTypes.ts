/**
 * A 16 Baumann-bőrtípus — single source of truth a `/bortipus/[slug]` oldalakhoz.
 *
 * A tartalom a Baumann-rendszer TÉNYEIBŐL készült (4 tengely + a 16 típus jellemzői),
 * NEM Baumann szövegének fordítása. A megfogalmazás és a szerkezet a miénk.
 * Forrás-vázlat: references/mintaoldalak-dspw-ornt.md, references/bortipus-oldalak-14.md.
 *
 * Compliance (1223/2009 + 655/2013): minden állítás megjelenés/érzet-alapú; tilos a
 * „kezel / gyógyít / stimulál / helyreállít / barrier funkció" típusú nyelvezet.
 *
 * Fanni-bővítés: a `references/*.md` fájlok `【FANNI — …】` blokkjai jelölik, hova kerül
 * Kónya Fanni felvett, valódi megfigyelése. Amíg az nincs meg, az itteni általános-de-korrekt
 * törzs publikálható; a felismerés-élményt az ő konkrétuma adja majd hozzá.
 */

export type AxisLetter = 'O' | 'D' | 'S' | 'R' | 'P' | 'N' | 'W' | 'T';

export interface BaumannSection {
  heading: string;
  /** Bekezdések (mindegyik <p>). */
  paragraphs?: string[];
  /** „Érdemes" lista. */
  doList?: string[];
  /** „Kerüld" lista. */
  dontList?: string[];
  /** Ajánlott generikus kezeléskategóriák (NEM márkanév/ár). */
  treatments?: { name: string; note: string }[];
}

export interface BaumannType {
  code: string;
  slug: string;
  displayName: string;
  axes: { OD: 'O' | 'D'; SR: 'S' | 'R'; PN: 'P' | 'N'; WT: 'W' | 'T' };
  metaTitle: string;
  metaDescription: string;
  /** Az oldal terjedelme — szándékosan eltér (anti-slop). */
  depth: 'short' | 'medium' | 'long';
  /** Rendelhető-e valódi előtte/utána blokk ehhez a típushoz. */
  beforeAfter: boolean;
  /** Klaszteren belüli szomszéd a belső linkeléshez. */
  neighbor: { code: string; slug: string };
  /** Az oldal törzse, sorrendben. */
  sections: BaumannSection[];
}

/** A 4 tengely rövid címkéi a chip-sorhoz (a hub magyarázza el mélyen). */
export const AXIS_LABELS: Record<AxisLetter, string> = {
  O: 'Zsíros',
  D: 'Száraz',
  S: 'Érzékeny',
  R: 'Ellenálló',
  P: 'Foltra hajlamos',
  N: 'Egyenletes tónusú',
  W: 'Ránchajlamos',
  T: 'Feszes',
};

const SUN = 'Napvédelem minden nap';

export const baumannTypes: BaumannType[] = [
  // ───────────────────────── KLASZTER A — Száraz + érzékeny ─────────────────────────
  {
    code: 'DSPT',
    slug: 'dspt',
    displayName: 'Száraz, Érzékeny, Foltra Hajlamos, Feszes',
    axes: { OD: 'D', SR: 'S', PN: 'P', WT: 'T' },
    metaTitle: 'DSPT bőrtípus: száraz, érzékeny, foltra hajlamos – mit jelent? | BeautyFlow',
    metaDescription:
      'A bőröd szárazságra és kipirulásra is hajlamos, és könnyen marad utána folt — viszont a ráncok még váratnak magukra. Mutatjuk, hol érdemes elkezdeni.',
    depth: 'medium',
    beforeAfter: true,
    neighbor: { code: 'DSNT', slug: 'dsnt' },
    sections: [
      {
        heading: 'Ez vagy te?',
        paragraphs: [
          'Ha a DSPT jött ki, akkor a bőröd mosakodás után feszül, könnyen kipirul egy-egy terméktől, és ha egy kiütés vagy karcolás után folt marad, az sokáig ott is ragad. A jó hír benne: a ráncok egyelőre nem a te történeted — van időd jól megalapozni.',
        ],
      },
      {
        heading: 'Mit jelent ez a hétköznapokban?',
        paragraphs: [
          'Három dolog találkozik: szárazság, érzékenység és egyenetlen tónus, foltra hajlam. A nehézség, hogy az erős tónusegyenlítő termékek, amikkel a foltokat csökkentenéd, ezt az érzékeny, száraz bőrt könnyen kipirítják. A sorrend itt is számít: előbb a nyugalom és a hidratáltabb érzet, és csak utána, finoman a tónus.',
        ],
      },
      {
        heading: 'Mit csinálj — és mit ne — otthon',
        doList: [
          'Langyos víz, gyengéd lemosó; gazdagabb, nyugtató hidratáló.',
          `${SUN} — a foltok láthatósága szempontjából ez hozza a legtöbbet.`,
        ],
        dontList: [
          'Erős hámlasztók, „minél csípősebb, annál jobb" logika.',
          'Egyszerre több új aktív bevezetése.',
        ],
      },
      {
        heading: 'Hogyan segíthet a szalon?',
        treatments: [
          { name: 'Bőrnyugtató / hidratáló kezelés', note: 'az alap, a teltebb, nyugodtabb érzetért.' },
          { name: 'Tónusegyenlítő / ragyogásfokozó kezelés', note: 'a foltok láthatóságának csökkentéséért, gyengéden.' },
          { name: 'Finom hámlasztó (enzimes / PHA)', note: 'az érzékeny bőrhöz mérve.' },
        ],
      },
    ],
  },
  {
    code: 'DSNT',
    slug: 'dsnt',
    displayName: 'Száraz, Érzékeny, Egyenletes Tónusú, Feszes',
    axes: { OD: 'D', SR: 'S', PN: 'N', WT: 'T' },
    metaTitle: 'DSNT bőrtípus: száraz és érzékeny, de egyenletes tónusú | BeautyFlow',
    metaDescription:
      'A bőröd száraz és érzékeny, de a tónusod egyenletes és a ráncok sem jellemzők — két dologra kell figyelned, nem négyre. Mutatjuk, mire.',
    depth: 'medium',
    beforeAfter: false,
    neighbor: { code: 'DSNW', slug: 'dsnw' },
    sections: [
      {
        heading: 'Ez vagy te?',
        paragraphs: [
          'A DSNT-nél két dolog dominál: a bőröd szárazságra hajlamos és érzékenyen reagál — de közben egyenletes a tónusod, és a ráncok sem foglalkoztatnak. Ez egy fókuszált típus: kevés fronton kell figyelned, viszont azokon következetesen.',
        ],
      },
      {
        heading: 'Mit jelent ez a hétköznapokban?',
        paragraphs: [
          'A fő téma a feszülő érzés és a kipirulásra való hajlam. Ami ezt a bőrt megnyugtatja és hidratáltabbnak érzeti, az nálad már a fél siker — nincs szükség sok terméket egymásra pakolni, sőt, az gyakran ront.',
        ],
      },
      {
        heading: 'Mit csinálj — és mit ne — otthon',
        doList: ['Gyengéd lemosó, gazdagabb nyugtató hidratáló, egyszerű rutin.'],
        dontList: ['Erős aktívok, durva radírozás, gyakori termékváltás.'],
      },
      {
        heading: 'Hogyan segíthet a szalon?',
        treatments: [
          { name: 'Bőrnyugtató kezelés', note: 'a kipirulásra hajlamos, érzékeny bőr nyugodtabb megjelenéséért.' },
          { name: 'Hidratáló booster kezelés', note: 'a teltebb, kevésbé feszülő érzetért.' },
        ],
      },
    ],
  },
  {
    code: 'DSPW',
    slug: 'dspw',
    displayName: 'Száraz, Érzékeny, Foltra Hajlamos, Ránchajlamos',
    axes: { OD: 'D', SR: 'S', PN: 'P', WT: 'W' },
    metaTitle: 'DSPW bőrtípus: száraz, érzékeny, foltos, ránchajlamos – mit jelent? | BeautyFlow',
    metaDescription:
      'A te bőröd egyszerre több dolgot kér: hidratálást, nyugtatást és tónusegyenlítést. Mutatjuk, mit jelent ez a hétköznapokban, és hol érdemes elkezdeni.',
    depth: 'long',
    beforeAfter: true,
    neighbor: { code: 'DRPW', slug: 'drpw' },
    sections: [
      {
        heading: 'Ez vagy te?',
        paragraphs: [
          'Ha a DSPW jött ki, akkor valószínűleg ismerős ez: mosakodás után percekig feszül a bőröd, délutánra mégis fakónak, fáradtnak látod. Új krémtől hamar kipirul vagy csíp. És miközben ezzel küzdesz, a tükörben foltokat és az első finom vonalakat is észreveszed — és nem tudod, melyikkel kezdj.',
          'A jó hír: ez nem négy külön probléma. Egy bőrtípus, aminek megvan a logikája — és van sorrend, amiben érdemes hozzányúlni.',
        ],
      },
      {
        heading: 'Mit jelent ez a hétköznapokban?',
        paragraphs: [
          'A DSPW-nél négy dolog találkozik: a bőröd szárazságra hajlamos, érzékenyen reagál, hajlamos az egyenetlen tónusra, foltokra, és ránchajlamos. Külön-külön mindegyik kezelhető — együtt az a nehéz, hogy amit az egyikre tennél, az a másikat zavarja.',
          'A szárazság és az érzékenység miatt a túl erős, „hatékony" hatóanyagok gyakran kipirulást és feszülő érzést hoznak. Az egyenetlen tónus sokakat erős hámlasztó termékek felé visz — amit ez a bőr rosszul tűr. A finom vonalak miatt jönne az anti-aging rutin — de a klasszikus, erős aktívok itt könnyen irritálnak.',
        ],
      },
      {
        heading: 'Itt lépcsőzni kell — és ez nem rossz hír',
        paragraphs: [
          'A DSPW az a típus, ahol az „egyszerre mindent" a leggyorsabb út a csalódáshoz. A sorrend számít: először a hidratáltság és a nyugalom — amíg a bőr feszül és kipirul, addig a tónus- és ránc-rutinnak nincs jó alapja. Ha a bőröd nyugodtabbnak és teltebbnek érződik, onnan lehet finoman a tónusegyenlítés és a feszesebb megjelenés felé lépni.',
        ],
      },
      {
        heading: 'Mit csinálj — és mit ne — otthon',
        doList: [
          'Langyos víz, gyengéd, nem habzó lemosó — a cél a feszülő érzés elkerülése.',
          'Gazdagabb, nyugtató hidratáló, rétegezve (előbb a könnyebb, rá a gazdagabb).',
          `${SUN} — a foltok és a finom vonalak láthatósága szempontjából ez a legtöbbet hozó otthoni szokás.`,
        ],
        dontList: [
          'Forró víz, erős dörzsölés, durva bőrradír.',
          'Egyszerre több új, erős aktív bevezetése.',
          '„Minél csípősebb, annál hatékonyabb" gondolat — ennél a bőrnél fordítva igaz.',
        ],
      },
      {
        heading: 'Hogyan segíthet a szalon?',
        paragraphs: [
          'A DSPW-nél a szalonban a sorrend a kulcs — ezért kezdünk a bőrnyugtató, hidratáló irányból, és csak utána lépünk a tónusegyenlítő, majd a finom, feszesítő kategóriák felé. A pontos rutint a bőröd aktuális állapotához igazítjuk — ez nem egy fix csomag, hanem egy lépcső.',
        ],
        treatments: [
          { name: 'Bőrnyugtató / hidratáló booster kezelés', note: 'az első lépés, a teltebb, nyugodtabb érzetért.' },
          { name: 'Tónusegyenlítő / ragyogásfokozó kezelés', note: 'a foltok láthatóságának csökkentéséért.' },
          { name: 'Finom hámlasztó (enzimes / PHA) kezelés', note: 'gyengéd, az érzékeny bőrhöz mérve.' },
          { name: 'Anti-aging peptides / feszesítő kezelés', note: 'a finom vonalak megjelenésére, a legvégén.' },
        ],
      },
    ],
  },
  {
    code: 'DSNW',
    slug: 'dsnw',
    displayName: 'Száraz, Érzékeny, Egyenletes Tónusú, Ránchajlamos',
    axes: { OD: 'D', SR: 'S', PN: 'N', WT: 'W' },
    metaTitle: 'DSNW bőrtípus: száraz, érzékeny és ránchajlamos | BeautyFlow',
    metaDescription:
      'Száraz, érzékeny bőr, egyenletes tónussal — de a finom vonalak hajlamosak korán jelentkezni. Az érzékenység miatt itt a gyengéd út a járható.',
    depth: 'medium',
    beforeAfter: false,
    neighbor: { code: 'DSPW', slug: 'dspw' },
    sections: [
      {
        heading: 'Ez vagy te?',
        paragraphs: [
          'A DSNW-nél a bőröd száraz és érzékeny, a tónusod egyenletes, viszont hajlamos a finom vonalak korai megjelenésére. A kihívás, hogy a klasszikus anti-aging aktívok gyakran erősek — ezt az érzékeny, száraz bőrt pedig könnyen kipirítják.',
        ],
      },
      {
        heading: 'Mit jelent ez a hétköznapokban?',
        paragraphs: [
          'A ráncok ellen ösztönösen erős szerek felé nyúlnál — de a te bőröd a gyengéd, türelmes utat hálálja meg. A hidratáltabb, teltebb bőr önmagában is láthatóan simábbnak mutatja a finom vonalakat, kockázat nélkül.',
        ],
      },
      {
        heading: 'Mit csinálj — és mit ne — otthon',
        doList: [
          'Gazdag hidratálás; gyengéd aktívok lassan bevezetve.',
          `${SUN} — a finom vonalak szempontjából a legtöbbet ez hozza.`,
        ],
        dontList: ['Erős, csípő anti-aging termékek hirtelen; agresszív hámlasztás.'],
      },
      {
        heading: 'Hogyan segíthet a szalon?',
        treatments: [
          { name: 'Bőrnyugtató / hidratáló kezelés', note: 'az alap a teltebb, simább megjelenésért.' },
          { name: 'Anti-aging peptides / feszesítő kezelés', note: 'a finom vonalak megjelenésére, az érzékeny bőrhöz igazítva.' },
        ],
      },
    ],
  },

  // ───────────────────────── KLASZTER B — Zsíros + érzékeny ─────────────────────────
  {
    code: 'OSPT',
    slug: 'ospt',
    displayName: 'Zsíros, Érzékeny, Foltra Hajlamos, Feszes',
    axes: { OD: 'O', SR: 'S', PN: 'P', WT: 'T' },
    metaTitle: 'OSPT bőrtípus: zsíros, érzékeny, foltra hajlamos | BeautyFlow',
    metaDescription:
      'Zsírosodásra és kipirulásra is hajlamos bőr, ami egy-egy pattanás után könnyen foltot hagy — de a ráncok még nem téma. Mutatjuk a sorrendet.',
    depth: 'medium',
    beforeAfter: true,
    neighbor: { code: 'OSNT', slug: 'osnt' },
    sections: [
      {
        heading: 'Ez vagy te?',
        paragraphs: [
          'Az OSPT-nél a bőröd fénylik a T-zónában, kipirulásra és apró kiütésekre hajlamos, és egy-egy pattanás után gyakran sötét folt marad, ami sokáig ott ragad. A ráncok viszont nálad még váratnak — van időd a tónussal foglalkozni.',
        ],
      },
      {
        heading: 'Mit jelent ez a hétköznapokban?',
        paragraphs: [
          'Itt a faggyú és az érzékenység együtt van jelen — a sok kiszárító, „pattanás elleni" termék gyakran még jobban kipirítja a bőrt, és a foltok sem múlnak tőle. A cél a mattabb, nyugodtabb megjelenés anélkül, hogy kiszárítanánk.',
        ],
      },
      {
        heading: 'Mit csinálj — és mit ne — otthon',
        doList: [
          'Gyengéd, nem kiszárító lemosó; könnyű hidratáló (igen, a zsíros bőrnek is kell).',
          `${SUN} — a folt utáni elszíneződések láthatósága miatt.`,
        ],
        dontList: ['Agresszív, alkoholos termékek; gyakori, erős hámlasztás; folt kinyomkodása.'],
      },
      {
        heading: 'Hogyan segíthet a szalon?',
        treatments: [
          { name: 'Pórustisztító / mattító kezelés', note: 'a tisztább, mattabb megjelenésért, kiszárítás nélkül.' },
          { name: 'Bőrnyugtató kezelés', note: 'a kipirulásra hajlamos bőr nyugodtabb megjelenéséért.' },
          { name: 'Tónusegyenlítő kezelés', note: 'a folt utáni elszíneződések láthatóságának csökkentéséért.' },
        ],
      },
    ],
  },
  {
    code: 'OSNT',
    slug: 'osnt',
    displayName: 'Zsíros, Érzékeny, Egyenletes Tónusú, Feszes',
    axes: { OD: 'O', SR: 'S', PN: 'N', WT: 'T' },
    metaTitle: 'OSNT bőrtípus: zsíros és érzékeny, egyenletes tónusú | BeautyFlow',
    metaDescription:
      'Zsírosodásra és kipirulásra hajlamos bőr, egyenletes tónussal és ránc nélkül — fókuszált rutint kíván. Mutatjuk, mire figyelj.',
    depth: 'medium',
    beforeAfter: false,
    neighbor: { code: 'OSPT', slug: 'ospt' },
    sections: [
      {
        heading: 'Ez vagy te?',
        paragraphs: [
          'Az OSNT-nél a bőröd fénylik és kipirulásra hajlamos, de a tónusod egyenletes, és a ráncok sem jellemzők. Két fronton kell figyelned: a fényesedésen és az érzékenységen — és épp ezek azok, amik gyakran egymásnak feszülnek.',
        ],
      },
      {
        heading: 'Mit jelent ez a hétköznapokban?',
        paragraphs: [
          'A klasszikus hiba, hogy a fényesedés ellen erős, kiszárító termékek jönnek — amitől az érzékeny bőr kipirul, és sokszor még többet is fényesedik. A jó irány a gyengéd tisztaság: mattabb megjelenés a bőr nyugalmának feláldozása nélkül.',
        ],
      },
      {
        heading: 'Mit csinálj — és mit ne — otthon',
        doList: ['Kíméletes lemosó, könnyű hidratáló, egyszerű rutin.'],
        dontList: ['Alkoholos arctonik, gyakori erős hámlasztás, sok új termék egyszerre.'],
      },
      {
        heading: 'Hogyan segíthet a szalon?',
        treatments: [
          { name: 'Pórustisztító / mattító kezelés', note: 'tisztább, mattabb megjelenés, gyengéden.' },
          { name: 'Bőrnyugtató kezelés', note: 'a kipirulásra hajlamos bőr nyugodtabb megjelenéséért.' },
        ],
      },
    ],
  },
  {
    code: 'OSPW',
    slug: 'ospw',
    displayName: 'Zsíros, Érzékeny, Foltra Hajlamos, Ránchajlamos',
    axes: { OD: 'O', SR: 'S', PN: 'P', WT: 'W' },
    metaTitle: 'OSPW bőrtípus: zsíros, érzékeny, foltos, ránchajlamos | BeautyFlow',
    metaDescription:
      'A te bőröd egyszerre fénylik, pirul ki, hagy foltot és hajlamos a finom vonalakra — és a faggyú itt nem véd meg az öregedéstől. Mutatjuk, hol kezdd.',
    depth: 'long',
    beforeAfter: true,
    neighbor: { code: 'OSNW', slug: 'osnw' },
    sections: [
      {
        heading: 'Ez vagy te?',
        paragraphs: [
          'Az OSPW az egyik legösszetettebb típus. A bőröd fénylik, mégis kipirulásra hajlamos, egy-egy pattanás után foltot hagy, és közben a finom vonalak is megjelennek. Sokakat meglep, hogy a zsírosabb bőr is ránchajlamos lehet — a faggyú nem véd meg az öregedéstől.',
        ],
      },
      {
        heading: 'Mit jelent ez a hétköznapokban?',
        paragraphs: [
          'Itt négy dolog feszül egymásnak: a fényesedés ellen kiszárítanál, a foltok ellen erős tónusegyenlítőt használnál, a ráncok ellen erős aktívot — és mindez az érzékeny bőrt kipirítja. Ezért itt nem az „egyszerre minden" a megoldás, hanem a sorrend.',
        ],
      },
      {
        heading: 'Itt is van sorrend',
        paragraphs: [
          'Először a nyugalom és a kiegyensúlyozott, mattabb megjelenés — amíg a bőr pirul és kiszárad, a tónus- és ránc-rutinnak nincs jó alapja. Ha a bőröd nyugodtabb, onnan lehet finoman a tónus, majd a feszesebb megjelenés felé lépni.',
        ],
      },
      {
        heading: 'Mit csinálj — és mit ne — otthon',
        doList: [
          'Gyengéd, nem kiszárító lemosó; könnyű, nyugtató hidratáló.',
          `${SUN} — a foltok ÉS a finom vonalak szempontjából is a legtöbbet ez hozza.`,
        ],
        dontList: [
          'Kiszárító „pattanás elleni" sorozatok.',
          'Egyszerre több erős aktív; agresszív hámlasztás.',
        ],
      },
      {
        heading: 'Hogyan segíthet a szalon?',
        treatments: [
          { name: 'Bőrnyugtató kezelés', note: 'az első lépés, a nyugodtabb, kevésbé piros megjelenésért.' },
          { name: 'Tónusegyenlítő / ragyogásfokozó kezelés', note: 'a folt utáni elszíneződésekre.' },
          { name: 'Anti-aging peptides / feszesítő kezelés', note: 'a finom vonalak megjelenésére, a legvégén.' },
        ],
      },
    ],
  },
  {
    code: 'OSNW',
    slug: 'osnw',
    displayName: 'Zsíros, Érzékeny, Egyenletes Tónusú, Ránchajlamos',
    axes: { OD: 'O', SR: 'S', PN: 'N', WT: 'W' },
    metaTitle: 'OSNW bőrtípus: zsíros, érzékeny, ránchajlamos | BeautyFlow',
    metaDescription:
      'Zsírosodásra és kipirulásra hajlamos bőr, egyenletes tónussal, de a finom vonalak hajlamosak korán jelentkezni. Mutatjuk a gyengéd utat.',
    depth: 'medium',
    beforeAfter: false,
    neighbor: { code: 'OSPW', slug: 'ospw' },
    sections: [
      {
        heading: 'Ez vagy te?',
        paragraphs: [
          'Az OSNW-nél a bőröd fénylik és érzékeny, a tónusod egyenletes, viszont hajlamos a finom vonalak korai megjelenésére. A meglepő rész, hogy a zsírosabb bőr is ránchajlamos lehet — a faggyú a fényt adja, az öregedés elleni védelmet nem.',
        ],
      },
      {
        heading: 'Mit jelent ez a hétköznapokban?',
        paragraphs: [
          'A ráncok ellen erős aktívok felé nyúlnál, de azok az érzékeny bőrt kipirítják. A jó irány a gyengéd, következetes rutin: mattabb, nyugodt, hidratált bőr, ami önmagában is láthatóan simább.',
        ],
      },
      {
        heading: 'Mit csinálj — és mit ne — otthon',
        doList: ['Kíméletes lemosó, könnyű hidratáló, napvédelem; gyengéd aktívok lassan.'],
        dontList: ['Kiszárító és erős termékek egyszerre; agresszív hámlasztás.'],
      },
      {
        heading: 'Hogyan segíthet a szalon?',
        treatments: [
          { name: 'Bőrnyugtató kezelés', note: 'a kipirulásra hajlamos bőr nyugodtabb megjelenéséért.' },
          { name: 'Anti-aging peptides / feszesítő kezelés', note: 'a finom vonalak megjelenésére, gyengéden.' },
        ],
      },
    ],
  },

  // ───────────────────── KLASZTER C — Ellenálló + tónus / pigment ─────────────────────
  {
    code: 'ORPT',
    slug: 'orpt',
    displayName: 'Zsíros, Ellenálló, Foltra Hajlamos, Feszes',
    axes: { OD: 'O', SR: 'R', PN: 'P', WT: 'T' },
    metaTitle: 'ORPT bőrtípus: ellenálló bőr, egyenetlen tónussal | BeautyFlow',
    metaDescription:
      'A bőröd jól tűri a hatóanyagokat és ritkán pirul ki — a fő témád az egyenetlen tónus és a foltok. Jó hír: itt sok mindent megengedhetsz magadnak.',
    depth: 'medium',
    beforeAfter: true,
    neighbor: { code: 'ORPW', slug: 'orpw' },
    sections: [
      {
        heading: 'Ez vagy te?',
        paragraphs: [
          'Az ORPT egy hálás típus: a bőröd ellenálló (ritkán pirul ki, jól tűri az aktívokat) és a ráncok sem téma — az egyetlen igazi front az egyenetlen tónus, foltok. Mivel a bőröd sok mindent elbír, itt tényleg lehet eredményt elérni a tónuson.',
        ],
      },
      {
        heading: 'Mit jelent ez a hétköznapokban?',
        paragraphs: [
          'A foltok mögött leggyakrabban a nap áll — és pont ezt hanyagolják a legtöbben, mert a bőr amúgy „problémamentes". A jó hír: az ellenálló bőr a célzott, erősebb tónusegyenlítő irányt is bírja, így a foltok láthatósága reálisan csökkenthető.',
        ],
      },
      {
        heading: 'Mit csinálj — és mit ne — otthon',
        doList: [`${SUN} — ez a legfontosabb ennél a típusnál.`, 'Célzott tónusegyenlítő rutin.'],
        dontList: ['A napvédelem elhanyagolását — minden más erőfeszítést leront.'],
      },
      {
        heading: 'Hogyan segíthet a szalon?',
        treatments: [
          { name: 'Tónusegyenlítő / ragyogásfokozó kezelés', note: 'a fő irány, a foltok és az egyenetlen tónus láthatóságára.' },
          { name: 'Finom hámlasztó kezelés', note: 'az egységesebb, ragyogóbb megjelenésért.' },
        ],
      },
    ],
  },
  {
    code: 'ORNT',
    slug: 'ornt',
    displayName: 'Zsíros, Ellenálló, Egyenletes Tónusú, Feszes',
    axes: { OD: 'O', SR: 'R', PN: 'N', WT: 'T' },
    metaTitle: 'ORNT bőrtípus: a legkiegyensúlyozottabb bőr – mire figyelj? | BeautyFlow',
    metaDescription:
      'Az ORNT a Baumann-rendszer legkiegyensúlyozottabb típusa. Megmutatjuk, miért szerencsés, és mi az az egy dolog, amitől mégis elveszítheted.',
    depth: 'short',
    beforeAfter: false,
    neighbor: { code: 'ORNW', slug: 'ornw' },
    sections: [
      {
        heading: 'Jó hírünk van',
        paragraphs: [
          'Az ORNT a Baumann-rendszer legkiegyensúlyozottabb típusa. A bőröd jól bírja a hatóanyagokat, ritkán pirul ki, a tónusod nagyjából egyenletes, és a ráncosodásra sem vagy különösebben hajlamos. Ha valaha irigykedtél valakire a „problémamentes" bőréért — most te vagy az.',
        ],
      },
      {
        heading: 'Mire figyelj? (az egy kockázat)',
        paragraphs: [
          'Az ORNT egyetlen igazi veszélye, hogy pont a szerencsések hanyagolják el a legkönnyebben. Mivel a bőr „magától" jól néz ki, könnyű kihagyni a napvédelmet és a minimális rutint — és épp ez az, ami évek alatt a legtöbbet számít a tónus egyenletességében és a feszes megjelenésben.',
          'A zsírosabb hajlam miatt a legtöbb gondot általában a túlzott tisztítás okozza: a kiszárított bőr gyakran még fényesebb lesz. Itt a „kevesebb több" elv működik.',
        ],
      },
      {
        heading: 'A minimum, ami megéri',
        doList: [
          `${SUN} — ez az egyetlen szokás, ami a legtöbbet adja vissza.`,
          'Egyszerű, nem kiszárító lemosó és könnyű hidratáló.',
          'Nem kell sok termék — az ellenálló bőr nem igényli, és nincs miért kockáztatni.',
        ],
      },
      {
        heading: 'Hogyan segíthet a szalon?',
        paragraphs: [
          'Neked nincs szükséged intenzív „helyrehozó" rutinra — a cél a karbantartás: hogy az egyenletes tónus és a feszes megjelenés az is maradjon.',
        ],
        treatments: [
          { name: 'Könnyű hidratáló / karbantartó kezelés', note: 'időnként, plusz egy szezononkénti állapotfelmérés.' },
        ],
      },
    ],
  },
  {
    code: 'ORPW',
    slug: 'orpw',
    displayName: 'Zsíros, Ellenálló, Foltra Hajlamos, Ránchajlamos',
    axes: { OD: 'O', SR: 'R', PN: 'P', WT: 'W' },
    metaTitle: 'ORPW bőrtípus: ellenálló bőr, egyenetlen tónus és ránchajlam | BeautyFlow',
    metaDescription:
      'Ellenálló, jól terhelhető bőr — két fronttal: az egyenetlen tónussal és a finom vonalakkal. Jó hír: itt sokat megengedhetsz magadnak.',
    depth: 'long',
    beforeAfter: true,
    neighbor: { code: 'ORNW', slug: 'ornw' },
    sections: [
      {
        heading: 'Ez vagy te?',
        paragraphs: [
          'Az ORPW-nél a bőröd ellenálló és jól terhelhető, de két dologgal foglalkoznod kell: az egyenetlen tónussal, foltokkal és a finom vonalakkal. Mivel ritkán pirul ki, a célzott, erősebb kezeléseket is jól bírja — ez előny.',
        ],
      },
      {
        heading: 'Mit jelent ez a hétköznapokban?',
        paragraphs: [
          'Két cél versenyzik a figyelmedért: a tónus és a feszesebb megjelenés. A jó hír, hogy az ellenálló bőrnél nem kell annyira óvatoskodni — itt a következetesség hozza az eredményt, nem a türtőztetés. A nap mindkét fronton a fő gyorsító.',
        ],
      },
      {
        heading: 'Mit csinálj — és mit ne — otthon',
        doList: [`${SUN}.`, 'Célzott tónusegyenlítő és anti-aging rutin (a bőröd bírja).'],
        dontList: ['A napvédelem kihagyását; a „majd egyszer" hozzáállást — itt a következetesség a kulcs.'],
      },
      {
        heading: 'Hogyan segíthet a szalon?',
        treatments: [
          { name: 'Tónusegyenlítő / ragyogásfokozó kezelés', note: 'a foltok és az egyenetlen tónus láthatóságára.' },
          { name: 'Feszesítő / anti-aging peptides kezelés', note: 'a finom vonalak megjelenésére.' },
        ],
      },
    ],
  },
  {
    code: 'ORNW',
    slug: 'ornw',
    displayName: 'Zsíros, Ellenálló, Egyenletes Tónusú, Ránchajlamos',
    axes: { OD: 'O', SR: 'R', PN: 'N', WT: 'W' },
    metaTitle: 'ORNW bőrtípus: ellenálló bőr, egyetlen témával – a finom vonalak | BeautyFlow',
    metaDescription:
      'Ellenálló, egyenletes tónusú bőr, ami jól tűri a hatóanyagokat — az egyetlen front a finom vonalak, és azt jó eséllyel az életmód gyorsítja.',
    depth: 'medium',
    beforeAfter: false,
    neighbor: { code: 'ORPW', slug: 'orpw' },
    sections: [
      {
        heading: 'Ez vagy te?',
        paragraphs: [
          'Az ORNW-nél a bőröd ellenálló, egyenletes tónusú, és jól tűri a hatóanyagokat — az egyetlen front a finom vonalak. És itt jön a jó hír: mivel a bőröd ennyire terhelhető, a célzott, eredményesebb anti-aging irányt is bírja.',
        ],
      },
      {
        heading: 'Mit jelent ez a hétköznapokban?',
        paragraphs: [
          'A ránchajlamnál a kor csak az egyik tényező — legalább annyira az életmód: a nap, a dohányzás, az alvás. A jó hír, hogy ezeken van befolyásod, és az ellenálló bőröd a célzott rutint is meghálálja.',
        ],
      },
      {
        heading: 'Mit csinálj — és mit ne — otthon',
        doList: [`${SUN} — a legtöbbet hozó anti-aging szokás.`, 'Célzott, következetes rutin.'],
        dontList: ['A napvédelem kihagyását; az „úgyis jó a bőröm" elkényelmesedést.'],
      },
      {
        heading: 'Hogyan segíthet a szalon?',
        treatments: [
          { name: 'Anti-aging peptides / feszesítő kezelés', note: 'a finom vonalak megjelenésére; a bőröd jól bírja.' },
          { name: 'Ragyogásfokozó kezelés', note: 'az üdébb, frissebb megjelenésért.' },
        ],
      },
    ],
  },
  {
    code: 'DRPT',
    slug: 'drpt',
    displayName: 'Száraz, Ellenálló, Foltra Hajlamos, Feszes',
    axes: { OD: 'D', SR: 'R', PN: 'P', WT: 'T' },
    metaTitle: 'DRPT bőrtípus: száraz, ellenálló, egyenetlen tónusú | BeautyFlow',
    metaDescription:
      'Szárazságra hajlamos, de ellenálló bőr, aminek a fő témája az egyenetlen tónus — ritkán pirul ki, és a ráncok sem jellemzők. Mutatjuk a két lépést.',
    depth: 'medium',
    beforeAfter: true,
    neighbor: { code: 'DRPW', slug: 'drpw' },
    sections: [
      {
        heading: 'Ez vagy te?',
        paragraphs: [
          'A DRPT-nél a bőröd szárazságra hajlamos, de ellenálló (ritkán pirul ki), és a ráncok sem foglalkoztatnak — a fő téma az egyenetlen tónus, foltok. Két dologra kell figyelned: a hidratáltságra és a tónusra.',
        ],
      },
      {
        heading: 'Mit jelent ez a hétköznapokban?',
        paragraphs: [
          'A száraz bőr fakóbbnak mutatja a tónust is — ezért nálad a hidratáltabb, teltebb bőr önmagában is egységesebb megjelenést ad. Mivel ellenálló vagy, a célzott tónusegyenlítő irányt jól bírod.',
        ],
      },
      {
        heading: 'Mit csinálj — és mit ne — otthon',
        doList: ['Gazdagabb hidratálás; célzott tónusegyenlítő rutin.', `${SUN}.`],
        dontList: ['A napvédelem elhanyagolását; a bőr túlzott kiszárítását.'],
      },
      {
        heading: 'Hogyan segíthet a szalon?',
        treatments: [
          { name: 'Hidratáló booster kezelés', note: 'a teltebb, kevésbé fakó megjelenésért.' },
          { name: 'Tónusegyenlítő / ragyogásfokozó kezelés', note: 'a foltok láthatóságának csökkentéséért.' },
        ],
      },
    ],
  },
  {
    code: 'DRNT',
    slug: 'drnt',
    displayName: 'Száraz, Ellenálló, Egyenletes Tónusú, Feszes',
    axes: { OD: 'D', SR: 'R', PN: 'N', WT: 'T' },
    metaTitle: 'DRNT bőrtípus: kiegyensúlyozott bőr, egyetlen feladattal | BeautyFlow',
    metaDescription:
      'A bőröd ellenálló, egyenletes tónusú és nem ránchajlamos — egyetlen dologra kell figyelned: a hidratáltságra. Mutatjuk a minimumot, ami megéri.',
    depth: 'short',
    beforeAfter: false,
    neighbor: { code: 'ORNT', slug: 'ornt' },
    sections: [
      {
        heading: 'Jó hírünk van',
        paragraphs: [
          'A DRNT egy kiegyensúlyozott típus. A bőröd ellenálló (ritkán pirul ki, jól tűri a hatóanyagokat), a tónusod egyenletes, és a ráncok sem téma. Gyakorlatilag egyetlen feladatod van: tartani a hidratáltságot.',
        ],
      },
      {
        heading: 'Mire figyelj?',
        paragraphs: [
          'A szárazságra hajlamos bőr mosakodás után feszül, és fakóbbnak látszik, ha hagyod kiszáradni. A jó hír, hogy mivel ellenálló vagy, ez könnyen kézben tartható — nem kell sok termék, csak a megfelelő hidratáltság.',
        ],
      },
      {
        heading: 'A minimum, ami megéri',
        doList: [
          'Kíméletes, nem kiszárító lemosó és gazdagabb hidratáló.',
          `${SUN} — a hosszú távú egyenletes tónusért és feszes megjelenésért.`,
          'Nem kell bonyolítani: az ellenálló, kiegyensúlyozott bőr a következetes alaprutint hálálja meg.',
        ],
      },
      {
        heading: 'Hogyan segíthet a szalon?',
        treatments: [
          { name: 'Hidratáló booster kezelés', note: 'a teltebb, kevésbé feszülő érzetért; nálad ez bőven elég.' },
        ],
      },
    ],
  },
  {
    code: 'DRPW',
    slug: 'drpw',
    displayName: 'Száraz, Ellenálló, Foltra Hajlamos, Ránchajlamos',
    axes: { OD: 'D', SR: 'R', PN: 'P', WT: 'W' },
    metaTitle: 'DRPW bőrtípus: száraz, ellenálló, foltos, ránchajlamos | BeautyFlow',
    metaDescription:
      'Három dolog egyszerre: szárazság, egyenetlen tónus és finom vonalak — de a bőröd ellenálló, így sokat megengedhetsz magadnak. Mutatjuk a sorrendet.',
    depth: 'long',
    beforeAfter: true,
    neighbor: { code: 'DRPT', slug: 'drpt' },
    sections: [
      {
        heading: 'Ez vagy te?',
        paragraphs: [
          'A DRPW-nél három dolog találkozik: a bőröd szárazságra hajlamos, egyenetlen tónusú és hajlamos a finom vonalakra — viszont ellenálló, ritkán pirul ki. Ez utóbbi nagy előny: a célzott, erősebb kezeléseket is jól bírod.',
        ],
      },
      {
        heading: 'Mit jelent ez a hétköznapokban?',
        paragraphs: [
          'Három cél verseng: a hidratáltság, a tónus és a feszesebb megjelenés. Mivel a bőröd ellenálló, itt nem az óvatosság a szűk keresztmetszet, hanem a következetesség. A hidratáltabb bőr egyúttal egységesebb és simább megjelenést is ad — jó kiindulópont.',
        ],
      },
      {
        heading: 'A sorrend',
        paragraphs: [
          'Először a hidratáltság adja az alapot, erre épül a tónusegyenlítés, majd a feszesebb megjelenés iránya. Mivel jól terhelhető a bőröd, ezek párhuzamosan is haladhatnak — de a hidratáltság marad a fundamentum.',
        ],
      },
      {
        heading: 'Mit csinálj — és mit ne — otthon',
        doList: [
          'Gazdag hidratálás; célzott tónus- és anti-aging rutin.',
          `${SUN} — a tónus ÉS a finom vonalak miatt is.`,
        ],
        dontList: ['A napvédelem kihagyását; a bőr kiszárítását erős, vízelvonó termékekkel.'],
      },
      {
        heading: 'Hogyan segíthet a szalon?',
        treatments: [
          { name: 'Hidratáló booster kezelés', note: 'az alap, a teltebb megjelenésért.' },
          { name: 'Tónusegyenlítő / ragyogásfokozó kezelés', note: 'a foltok láthatóságára.' },
          { name: 'Feszesítő / anti-aging peptides kezelés', note: 'a finom vonalak megjelenésére.' },
        ],
      },
    ],
  },
  {
    code: 'DRNW',
    slug: 'drnw',
    displayName: 'Száraz, Ellenálló, Egyenletes Tónusú, Ránchajlamos',
    axes: { OD: 'D', SR: 'R', PN: 'N', WT: 'W' },
    metaTitle: 'DRNW bőrtípus: száraz, ellenálló, ránchajlamos | BeautyFlow',
    metaDescription:
      'Ellenálló, egyenletes tónusú bőr két feladattal: a hidratáltsággal és a finom vonalakkal. Jó hír: a bőröd jól terhelhető. Mutatjuk a két lépést.',
    depth: 'medium',
    beforeAfter: false,
    neighbor: { code: 'DRNT', slug: 'drnt' },
    sections: [
      {
        heading: 'Ez vagy te?',
        paragraphs: [
          'A DRNW-nél a bőröd szárazságra hajlamos és ránchajlamos, de ellenálló és egyenletes tónusú. Két dologra figyelsz: a hidratáltságra és a finom vonalakra — és mivel ritkán pirul ki, a célzott kezeléseket jól bírod.',
        ],
      },
      {
        heading: 'Mit jelent ez a hétköznapokban?',
        paragraphs: [
          'A száraz bőr a finom vonalakat is jobban kihangsúlyozza — ezért nálad a hidratáltabb, teltebb bőr önmagában is simább megjelenést ad. Erre épülhet a célzott anti-aging irány, amit az ellenálló bőröd jól terhel. A ránchajlamot itt is sokszor az életmód gyorsítja.',
        ],
      },
      {
        heading: 'Mit csinálj — és mit ne — otthon',
        doList: ['Gazdag hidratálás; célzott, következetes anti-aging rutin.', `${SUN}.`],
        dontList: ['A bőr kiszárítását; a napvédelem kihagyását.'],
      },
      {
        heading: 'Hogyan segíthet a szalon?',
        treatments: [
          { name: 'Hidratáló booster kezelés', note: 'az alap a teltebb, simább megjelenésért.' },
          { name: 'Anti-aging peptides / feszesítő kezelés', note: 'a finom vonalak megjelenésére; a bőröd jól bírja.' },
        ],
      },
    ],
  },
];

/** Gyors kód→típus kikeresés (a kvíz az eredménykódból ide irányít). */
export const baumannByCode: Record<string, BaumannType> = Object.fromEntries(
  baumannTypes.map((t) => [t.code, t]),
);

export function getBaumannBySlug(slug: string): BaumannType | undefined {
  return baumannTypes.find((t) => t.slug === slug);
}
