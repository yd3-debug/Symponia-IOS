import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { ANIMAL_ARCHETYPES } from '@/constants/systemPrompt';
import { getLanguage, useT } from '@/constants/i18n';
import { ORACLE_URL, getValidToken } from './anthropic';

export interface ArchetypeProse {
  gift: string;
  shadow: string;
  path: string;
}

/**
 * The gift / shadow / path reading for an animal, in the user's language.
 *
 * ANIMAL_ARCHETYPES is English literary data — 39 animals × 3 compressed
 * aphorisms — and it is deliberately NOT in the i18n dictionaries. 117 passages
 * across eight languages is not something you hand-translate, and a dictionary
 * of them would be a dictionary of prose, which is not what a dictionary is for.
 * So it rendered in English even when the app was speaking German.
 *
 * Instead: the English reading goes up, Claude COMPOSES the same three readings
 * natively in the target language (same meaning, same register, same length —
 * not a word-for-word translation), and the result is cached on-device per
 * language + animal. A settled user makes at most seven of these calls, once.
 *
 * FAIL-SAFE BY CONSTRUCTION. English short-circuits before any network call, and
 * every other exit — no consent, no session, a non-200, unparseable JSON, an
 * exception, a rate limit — returns the English source unchanged. There is no
 * error state to render and no way for this to be worse than English, because
 * English IS the fallback. The worst case is exactly today's behaviour.
 */
export async function localizeArchetype(
  animal: string,
  arc: ArchetypeProse,
): Promise<ArchetypeProse> {
  const lang = getLanguage();
  const key = animal.toLowerCase().trim();
  if (lang === 'en' || !key || !arc.gift || !arc.shadow || !arc.path) return arc;

  const cacheKey = `symponia_arc_${lang}_${key}`;

  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed?.gift && parsed?.shadow && parsed?.path) return parsed as ArchetypeProse;
    }
  } catch {}

  try {
    const consent = await AsyncStorage.getItem('symponia_ai_consent');
    if (consent !== 'true') return arc;

    const token = await getValidToken();
    if (!token) return arc;

    const res = await fetch(ORACLE_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'archetype-prose',
        language: lang,
        animal: key,
        gift: arc.gift,
        shadow: arc.shadow,
        path: arc.path,
      }),
    });
    if (!res.ok) return arc;

    const json = await res.json();
    const out: ArchetypeProse = {
      gift: (json?.gift ?? '').trim(),
      shadow: (json?.shadow ?? '').trim(),
      path: (json?.path ?? '').trim(),
    };
    // Partial output is not a reading. Take all three or none.
    if (!out.gift || !out.shadow || !out.path) return arc;

    try {
      await AsyncStorage.setItem(cacheKey, JSON.stringify(out));
    } catch {}
    return out;
  } catch {
    return arc;
  }
}

// One flight per animal per language, process-wide. The archetype screen, the
// home card and the chat reading can all ask for the Wolf in the same second;
// they should share one call, not race three.
const inFlight = new Map<string, Promise<ArchetypeProse>>();

function localizeOnce(animal: string, arc: ArchetypeProse): Promise<ArchetypeProse> {
  const id = `${getLanguage()}_${animal.toLowerCase().trim()}`;
  const running = inFlight.get(id);
  if (running) return running;

  const p = localizeArchetype(animal, arc).finally(() => inFlight.delete(id));
  inFlight.set(id, p);
  return p;
}

/**
 * Localised readings for a set of animals, keyed by lowercase animal name.
 *
 * Returns the ENGLISH readings synchronously on first render and swaps in the
 * localised prose as it resolves. Nothing here ever blocks a screen or shows a
 * spinner: the prose is always on the page, it simply changes language a moment
 * later, once, and never again (the result is cached).
 */
export function useLocalizedArchetypes(animals: string[]): Record<string, ArchetypeProse> {
  const english: Record<string, ArchetypeProse> = {};
  for (const a of animals) {
    const k = a.toLowerCase().trim();
    const arc = ANIMAL_ARCHETYPES[k];
    if (arc) english[k] = arc;
  }

  const [prose, setProse] = useState<Record<string, ArchetypeProse>>(english);
  // Subscribing to the language means switching it in Settings re-resolves the
  // prose instead of leaving the previous language on the screen.
  const { lang } = useT();
  // Stable identity for the effect: the animals themselves, not the array object.
  const sig = `${lang}|${animals.map((a) => a.toLowerCase().trim()).join(',')}`;

  useEffect(() => {
    let alive = true;
    setProse(english);

    for (const a of animals) {
      const k = a.toLowerCase().trim();
      const arc = ANIMAL_ARCHETYPES[k];
      if (!arc) continue;
      localizeOnce(k, arc).then((localized) => {
        if (!alive || localized === arc) return;
        setProse((prev) => ({ ...prev, [k]: localized }));
      });
    }

    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return prose;
}

/**
 * The localised reading for a single animal (the dominant one, usually).
 * Undefined only when the animal itself is unknown — never while loading.
 */
export function useLocalizedArchetype(animal?: string): ArchetypeProse | undefined {
  const key = animal ? animal.toLowerCase().trim() : '';
  // The empty array is stable enough: the hook keys its effect on the joined names.
  const map = useLocalizedArchetypes(key ? [key] : []);
  return key ? map[key] : undefined;
}
