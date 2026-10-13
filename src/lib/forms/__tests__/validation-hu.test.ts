import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { zodIssueToHu, GENERIC_INVALID_HU } from '../validation-hu';

const Schema = z
  .object({
    answers: z.record(z.string().max(60), z.union([z.string().max(200), z.array(z.string())])),
    firstName: z.string().trim().min(2, 'Kérjük add meg a keresztneved.').max(100),
    phone: z.string().max(32).optional().default(''),
    consentHealth: z.literal(true, { message: 'Az egészségügyi adatok kezeléséhez való hozzájárulás kötelező.' }),
  })
  .refine((d) => d.phone.length > 0, { message: 'Telefonszám vagy email kötelező.', path: ['email'] });

function firstIssue(input: unknown) {
  const r = Schema.safeParse(input);
  if (r.success) throw new Error('expected failure');
  return r.error.issues[0];
}

describe('zodIssueToHu', () => {
  it('a sémában írt magyar üzenet marad', () => {
    expect(zodIssueToHu(firstIssue({ answers: {}, firstName: 'A', consentHealth: true, phone: '1' }))).toBe('Kérjük add meg a keresztneved.');
    expect(zodIssueToHu(firstIssue({ answers: {}, firstName: 'Anna', consentHealth: true }))).toBe('Telefonszám vagy email kötelező.');
  });

  it('a zod angol strukturális üzenete helyett magyar, mező szerint', () => {
    const wrongType = firstIssue({ answers: 'nope', firstName: 'Anna', consentHealth: true, phone: '1' });
    expect(wrongType.message).not.toMatch(/[áéíóöőúüű]/); // a zod saját üzenete angol
    expect(zodIssueToHu(wrongType)).toMatch(/kvíz válaszai/);

    const tooLongPhone = firstIssue({ answers: {}, firstName: 'Anna', consentHealth: true, phone: '1'.repeat(40) });
    expect(zodIssueToHu(tooLongPhone)).toBe('Kérjük adj meg egy érvényes telefonszámot.');

    const nameNumber = firstIssue({ answers: {}, firstName: 42, consentHealth: true, phone: '1' });
    expect(zodIssueToHu(nameNumber)).toMatch(/keresztneved/);
  });

  it('ismeretlen mező / hiányzó issue → általános magyar üzenet', () => {
    expect(zodIssueToHu({ code: 'invalid_type', path: ['valami'], message: 'Invalid input' })).toBe(GENERIC_INVALID_HU);
    expect(zodIssueToHu(undefined)).toBe(GENERIC_INVALID_HU);
  });
});
