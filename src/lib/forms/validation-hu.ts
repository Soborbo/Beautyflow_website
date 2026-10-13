/**
 * Zod-hibák magyarul.
 *
 * A zod saját (strukturális) üzenetei angolok: egy rossz típusú vagy túl hosszú
 * mező esetén a magyar oldalon „Invalid input: expected string, received number"
 * jelent meg a vendégnek. A sémában megírt, szándékos magyar üzeneteket (a
 * `.refine()`-ok és a kifejezett `message`-ek) megtartjuk; minden mást a mező
 * szerinti magyar üzenetre képezünk.
 *
 * Szándékosan zod-import NÉLKÜL: csak az issue alakját használjuk.
 */
export interface IssueLike {
  code?: string;
  path?: readonly PropertyKey[];
  message?: string;
}

const FIELD_MESSAGES: Record<string, string> = {
  firstName: 'Kérjük add meg a keresztneved (legalább 2 karakter).',
  phone: 'Kérjük adj meg egy érvényes telefonszámot.',
  email: 'Kérjük adj meg egy érvényes email címet.',
  consentHealth: 'Az egészségügyi adatok kezeléséhez való hozzájárulás kötelező.',
  consentMarketing: 'Érvénytelen hírlevél-beállítás. Kérjük frissítsd az oldalt és próbáld újra.',
  answers: 'A kvíz válaszai hiányosak vagy sérültek. Kérjük töltsd ki újra a kvízt.',
};

export const GENERIC_INVALID_HU = 'Hiányzó vagy érvénytelen adatok. Kérjük frissítsd az oldalt és próbáld újra.';

/** Magyar-e már az üzenet (ékezetes betű a szövegben → a sémában írtuk). */
function looksHungarian(message: string | undefined): boolean {
  return !!message && /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/.test(message);
}

export function zodIssueToHu(issue: IssueLike | undefined): string {
  if (!issue) return GENERIC_INVALID_HU;
  // A sémában megírt üzenetek (refine-ok, kifejezett message) maradnak.
  if (looksHungarian(issue.message)) return issue.message as string;
  const field = typeof issue.path?.[0] === 'string' ? (issue.path[0] as string) : '';
  return FIELD_MESSAGES[field] || GENERIC_INVALID_HU;
}
