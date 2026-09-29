#!/usr/bin/env node
/**
 * Lockfile-teljesseg or — a Windows↔Linux csapda ellen.
 *
 * MIT MERUNK. A `sharp`, `@tailwindcss/oxide` es a `rolldown` platform-specifikus
 * nativ + wasm optional fuggosegeket szallit (`@img/sharp-*`, `@emnapi/*`,
 * `@napi-rs/wasm-runtime`). A WINDOWSON futtatott `npm install` kipucolja a
 * lockbol a mas-platformos agakat, miközben a Linux ideal-tree tovabbra is
 * hivatkozik rajuk — ott az `npm ci` elhasal
 * (`Missing @emnapi/runtime@... from lock file`), a fejleszto gepen viszont MINDEN
 * zold. Pontosan ezert nem volt eddig commitolt lock ebben a repoban (DEPLOY.md §5).
 *
 * KET SZINT:
 *   1. nev-feloldas — minden deklaralt fuggoseg megtalalhato-e a lockon belul,
 *      a Node felfele-kereso feloldasaval. Ez `node_modules` NELKUL is fut.
 *   2. verzio-egyezes — a megtalalt bejegyzes verzioja KIELEGITI-e a range-et.
 *      Ehhez `semver` kell (a telepitett fabol), ezert csak `npm ci` UTAN fut.
 *
 * A 2. szint nem luxus: a lock foltozasakor eloallt egy olyan allapot, ahol
 * `@emnapi/core@1.11.1` pontosan `wasi-threads@1.2.2`-t kovetelt, a lockban viszont
 * 1.2.3 volt — az 1. szint ezt ZOLDNEK latta. Ezert a `--require-semver` kapcsolo:
 * ahol a 2. szintnek futnia KELL, ott a hianya HIBA, nem csendes visszaeses.
 *
 * Hasznalat:
 *   node scripts/check-lockfile.mjs [lockfile] [--require-semver]
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const requireSemver = args.includes('--require-semver');
const lockPath = args.find((a) => !a.startsWith('--')) ?? 'package-lock.json';

const pkgs = JSON.parse(readFileSync(lockPath, 'utf8')).packages ?? {};

let semver = null;
try {
  semver = createRequire(`${process.cwd()}/x.js`)('semver');
} catch {
  if (requireSemver) {
    console.error(`check-lockfile: a semver nem erheto el, pedig --require-semver aktiv.`);
    console.error('Futtasd `npm ci` UTAN, hogy a telepitett fabol feloldhato legyen.');
    process.exit(2);
  }
}

/** Node-feloldas: a fa-utvonalon felfele keressuk a `node_modules/<nev>`-et. */
function resolveEntry(from, name) {
  let dir = from;
  for (;;) {
    const hit = pkgs[`${dir ? dir + '/' : ''}node_modules/${name}`];
    if (hit) return hit;
    if (!dir) return null;
    const i = dir.lastIndexOf('/node_modules/');
    dir = i === -1 ? '' : dir.slice(0, i);
  }
}

// A package.json `overrides`-a felulirja a fuggoseg sajat range-et — az `npm ci`
// ezt koveteli meg a locktol, nem az eredetit. Nelkule minden override (pl. egy
// biztonsagi javitas miatt feljebb huzott `sharp`) hamis VERZIO-UTKOZES lenne.
// Kezelt alakok: "nev": "range", "nev": "$gyoker-dep", "szulo": { "nev": ... },
// es { ".": ... } a sajat verziora.
const rootPkgPath = lockPath.replace(/package-lock\.json$/, 'package.json');
let rootPkg = {};
try { rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf8')); } catch { /* nincs mellette package.json */ }
const overrides = rootPkg.overrides ?? {};
const rootDeps = { ...(rootPkg.devDependencies ?? {}), ...(rootPkg.dependencies ?? {}) };

function overrideValue(v) {
  if (v && typeof v === 'object') v = v['.'];
  if (typeof v !== 'string') return null;
  return v.startsWith('$') ? rootDeps[v.slice(1)] ?? null : v;
}

/** A `parentKey` lock-bejegyzes `dep` fuggosegere ervenyes range (override-dal). */
function effectiveRange(parentKey, dep, range) {
  const parent = parentKey.slice(parentKey.lastIndexOf('node_modules/') + 'node_modules/'.length);
  const scoped = overrides[parent];
  if (parentKey && scoped && typeof scoped === 'object' && dep in scoped) {
    return overrideValue(scoped[dep]) ?? range;
  }
  return overrideValue(overrides[dep]) ?? range;
}

const missing = [];
const mismatched = [];
for (const [key, entry] of Object.entries(pkgs)) {
  const deps = { ...(entry.dependencies ?? {}), ...(entry.optionalDependencies ?? {}) };
  for (const [dep, declared] of Object.entries(deps)) {
    const range = effectiveRange(key, dep, declared);
    const who = key.replace('node_modules/', '') || '<root>';
    const target = resolveEntry(key, dep);
    if (!target) { missing.push(`${who} → ${dep}@${range}`); continue; }
    if (!semver || !target.version) continue;
    // A nem-semver hivatkozasokat (alias, file:, git:) nem a semver donti el.
    if (/^(?:npm:|file:|link:|git|github:|https?:)/.test(range)) continue;
    if (!semver.validRange(range)) continue;
    if (!semver.satisfies(target.version, range, { includePrerelease: true })) {
      mismatched.push(`${who} → ${dep}@${range}  (a lockban: ${target.version})`);
    }
  }
}

const mode = semver ? 'nev + verzio' : 'CSAK nev (semver nem elerheto)';
if (!missing.length && !mismatched.length) {
  console.log(`check-lockfile: OK — ${Object.keys(pkgs).length} bejegyzes, ${mode}.`);
  process.exit(0);
}
if (missing.length) {
  console.error(`check-lockfile: ${missing.length} FELOLDHATATLAN fuggoseg a ${lockPath}-ban:`);
  for (const m of missing.slice(0, 20)) console.error('  -', m);
  console.error('\nEz Linuxon `npm ci` hibat ad (EUSAGE / "Missing ... from lock file").');
  console.error('Ok: WINDOWSON futtatott npm install/update kipucolta a mas-platformos agakat.');
  console.error('Javitas: generald ujra a lockot LINUXON — `Lockfile (Linux-on generalva)` workflow.');
}
if (mismatched.length) {
  console.error(`check-lockfile: ${mismatched.length} VERZIO-UTKOZES a ${lockPath}-ban:`);
  for (const m of mismatched.slice(0, 20)) console.error('  -', m);
}
process.exit(1);
