/**
 * Baumann 4-betűs kód számítása a kvíz-válaszokból — TISZTA függvény.
 *
 * 3 jel / tengely (a references/borteszt-kerdessor-alap.md bázisa szerint):
 *   O/D ← zsir-1, zsir-2, zsir-3 (pórus)
 *   S/R ← erzekeny-1, erzekeny-2, erzekeny-3
 *   P/N ← pigment, pigment-2 (PIH), pigment-3 (tónus)
 *   W/T ← ranc + napvédelem (fenyvedo) + dohányzás, kor-finomítással
 *
 * A kérdések saját szövegezésűek, a Baumann 4-tengelyes MÓDSZERTANÁBÓL építve
 * (nem az eredeti kérdőív átvétele). Döntetlen / határeset az „óvatosabb" betű
 * felé (D, S, P, W), hogy ne ígérjünk túl erős kezelést.
 *
 * MEGJEGYZÉS: a kezelés-ajánló `computeProfile()` (recommendation.ts) szándékosan
 * a 6 eredeti diagnosztikai jelen marad — a kód (a 16 oldalra irányítás) a részletesebb
 * 3-jeles számítást használja; a kettő enyhén eltérhet, ez nem hiba (a kód az
 * irányadó a routinghoz, a profil egy lágyabb leíró).
 *
 * Mellékhatás-mentes; szerver- és kliensoldalon egyaránt fut.
 */

import type { QuizAnswers } from './types';

function asString(v: string | string[] | undefined): string {
  return typeof v === 'string' ? v : '';
}
/** A „dry-2", „od3-3", „sr3-2" stb. értékek számjegy-utótagja (az utolsó kötőjel után). */
function suffixNum(value: string): number {
  const m = value.match(/-(\d+)/);
  return m ? Number(m[1]) : 0;
}

export interface BaumannResult {
  /** Négybetűs kód, pl. 'ORPW'. */
  code: string;
  /** Kisbetűs slug a publikus oldalhoz, pl. 'orpw'. */
  slug: string;
  /** Az egyes tengelyek (debug / audit / Sheets). */
  axes: { OD: 'O' | 'D'; SR: 'S' | 'R'; PN: 'P' | 'N'; WT: 'W' | 'T' };
}

export function computeBaumannCode(a: QuizAnswers): BaumannResult {
  // ── O/D — Zsíros vs. száraz (zsir-1 + zsir-2 + zsir-3 pórus) ──
  const z1 = asString(a['bortipus-zsir-1']); // dry-0 | oily-2 | combo-1 | dry-2
  const z2 = asString(a['bortipus-zsir-2']); // dry-0 | dry-1 | dry-2
  const z3 = asString(a['bortipus-zsir-3']); // od3-0..3 (pórus → zsíros pont)
  let oily = 0;
  let dry = 0;
  if (z1.startsWith('oily')) oily += suffixNum(z1);
  if (z1.startsWith('combo')) oily += 1; // T-zónás
  if (z1.startsWith('dry')) dry += suffixNum(z1);
  if (z2.startsWith('dry')) dry += suffixNum(z2);
  if (z3.startsWith('od3')) oily += suffixNum(z3);
  const OD: 'O' | 'D' = oily > dry ? 'O' : 'D'; // döntetlen → D (óvatosabb)

  // ── S/R — Érzékeny vs. ellenálló (erzekeny-1 + -2 + -3); S ha ≥ 3 ──
  const e1 = asString(a['bortipus-erzekeny-1']); // res-0 | sens-1 | sens-2 | sens-2b
  const e2 = asString(a['bortipus-erzekeny-2']); // res-0 | sens-1 | sens-3
  const e3 = asString(a['bortipus-erzekeny-3']); // sr3-0..3 (kiütés/viszketés)
  let sens = 0;
  if (e1.startsWith('sens')) sens += suffixNum(e1) || (e1 === 'sens-2b' ? 2 : 1);
  if (e2.startsWith('sens')) sens += suffixNum(e2);
  if (e3.startsWith('sr3')) sens += suffixNum(e3);
  const SR: 'S' | 'R' = sens >= 3 ? 'S' : 'R';

  // ── P/N — Foltra hajlamos vs. egyenletes (pigment + PIH + tónus); P ha ≥ 2 ──
  const p1 = asString(a['bortipus-pigment']); // pig-0 | pig-1 | pig-2 | pih-2
  const p2 = asString(a['bortipus-pigment-2']); // pn2-0..3 (PIH)
  const p3 = asString(a['bortipus-pigment-3']); // pn3-0..3 (tónus)
  let pig = 0;
  if (p1 === 'pig-1') pig += 1;
  else if (p1 === 'pig-2' || p1 === 'pih-2') pig += 2;
  if (p2.startsWith('pn2')) pig += suffixNum(p2);
  if (p3.startsWith('pn3')) pig += suffixNum(p3);
  const PN: 'P' | 'N' = pig >= 2 ? 'P' : 'N';

  // ── W/T — Ránchajlamos vs. feszes (ranc + napvédelem + dohányzás + kor); W ha ≥ 3 ──
  const wr = suffixNum(asString(a['bortipus-ranc'])); // 0..3
  const fv = asString(a['fenyvedo']); // fv-nap | fv-nyar | fv-ritka | fv-soha
  const doh = asString(a['dohanyzas']); // doh-nem | doh-neha | doh-igen
  const kor = asString(a['eletkor']);
  let wt = wr;
  wt += fv === 'fv-soha' ? 3 : fv === 'fv-ritka' ? 2 : fv === 'fv-nyar' ? 1 : 0;
  wt += doh === 'doh-igen' ? 2 : doh === 'doh-neha' ? 1 : 0;
  wt += kor === 'kor-55' ? 2 : kor === 'kor-45' ? 1 : 0;
  const WT: 'W' | 'T' = wt >= 3 ? 'W' : 'T';

  const code = `${OD}${SR}${PN}${WT}`;
  return { code, slug: code.toLowerCase(), axes: { OD, SR, PN, WT } };
}
