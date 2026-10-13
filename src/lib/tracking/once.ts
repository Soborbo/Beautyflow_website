/**
 * „Egyszer tüzel" őrök a böngésző-oldali analitika-eseményekhez.
 *
 * Három esemény tüzelt túl sokszor, és ezzel torzította a GA4 tölcsért:
 *   • calculator_result_view — az /eredmeny/<hash> MINDEN megnyitásakor
 *     (újratöltés, e-mail-link újranyitása) → most hash-enként egyszer;
 *   • begin_checkout — minden Notino-kattintásra → most munkamenetenként,
 *     forrásonként egyszer;
 *   • (a kalkulátor-indítás a hívó oldalon, első interakcióhoz kötve.)
 *
 * Tárolás: 'local' → localStorage (tartós), ha az nem elérhető / dob (Safari
 * privát mód, letiltott sütik), sessionStorage, végső esetben memória. 'session'
 * → sessionStorage, végső esetben memória. Egyik ág sem dobhat: egy analitika-őr
 * nem törheti el az oldalt.
 */
export type OnceScope = 'local' | 'session';

const memory = new Set<string>();

function tryStorage(kind: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    const s = (globalThis as unknown as Record<string, Storage | undefined>)[kind];
    if (!s) return null;
    // Írás-próba: Safari privát módban a getItem működik, a setItem dob.
    const probe = '__bf_once_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/**
 * Igaz, ha a kulcs MOST először jelölődik (→ tüzelj); hamis, ha már láttuk.
 * A jelölés a visszatéréssel együtt megtörténik.
 */
export function markOnce(key: string, scope: OnceScope = 'local'): boolean {
  const order: ('localStorage' | 'sessionStorage')[] =
    scope === 'local' ? ['localStorage', 'sessionStorage'] : ['sessionStorage'];
  for (const kind of order) {
    const s = tryStorage(kind);
    if (!s) continue;
    try {
      if (s.getItem(key)) return false;
      s.setItem(key, String(Date.now()));
      return true;
    } catch {
      // a következő tárolóval próbálkozunk
    }
  }
  if (memory.has(key)) return false;
  memory.add(key);
  return true;
}

/** Csak tesztekhez: a memória-tartalék ürítése. */
export function __resetOnceMemory(): void {
  memory.clear();
}
