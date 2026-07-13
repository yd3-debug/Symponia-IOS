// ── i18n core ─────────────────────────────────────────────────────────────────
// SAFETY BY DESIGN: translations are keyed by the ENGLISH SOURCE STRING, not by
// abstract keys. t("choose all that feel true") looks up a translation and, if one
// does not exist for any reason, returns the English sentence itself.
//
// Consequences:
//   • A missing or misspelled translation can never render a raw key or a blank.
//   • Wrapping a string in t() is a no-op until a translation is added, so the
//     migration can proceed screen by screen with zero visual change.
//   • t() works inside components AND in plain services (no hook required).

import React from 'react';

export type Lang = 'en' | 'ru' | 'pt' | 'es' | 'it' | 'de' | 'fr' | 'da' | 'sv';

// Shown as bubbles. The label is the language's own name (endonym) — that is what
// speakers actually look for. Spanish uses a globe rather than the Spanish flag, so
// Latin American users (the large majority of Spanish speakers) are not shown a
// European flag; Portuguese uses Brazil for the same reason.
export const LANGUAGES: { code: Lang; label: string; flag: string; english: string }[] = [
  { code: 'en', label: 'English',   flag: '🇬🇧', english: 'English' },
  { code: 'es', label: 'Español',   flag: '🌎', english: 'Spanish' },
  { code: 'pt', label: 'Português', flag: '🇧🇷', english: 'Portuguese' },
  { code: 'fr', label: 'Français',  flag: '🇫🇷', english: 'French' },
  { code: 'de', label: 'Deutsch',   flag: '🇩🇪', english: 'German' },
  { code: 'it', label: 'Italiano',  flag: '🇮🇹', english: 'Italian' },
  { code: 'ru', label: 'Русский',   flag: '🇷🇺', english: 'Russian' },
  { code: 'da', label: 'Dansk',     flag: '🇩🇰', english: 'Danish' },
  { code: 'sv', label: 'Svenska',   flag: '🇸🇪', english: 'Swedish' },
];

// The AI is told to answer in this language. Keep the endonym + English name so the
// instruction is unambiguous to the model.
export function languageName(code: Lang): string {
  const l = LANGUAGES.find((x) => x.code === code);
  return l ? l.english : 'English';
}

// Translations keyed by English source string. Filled in progressively.
// Anything absent falls back to English automatically.
import { DICTS } from './translations';

type Dict = Record<string, string>;
export const TRANSLATIONS: Partial<Record<Lang, Dict>> = DICTS;

let current: Lang = 'en';
const listeners = new Set<() => void>();

export function getLanguage(): Lang {
  return current;
}

/**
 * BCP-47 tag for Intl / toLocaleDateString. Without this a French user sees a
 * British-formatted renewal date. Portuguese is Brazilian and Spanish is
 * Latin-American, matching the flags we show in onboarding.
 */
const LOCALES: Record<Lang, string> = {
  en: 'en-GB',
  es: 'es-419',
  pt: 'pt-BR',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
  ru: 'ru-RU',
  da: 'da-DK',
  sv: 'sv-SE',
};

export function getLocale(): string {
  return LOCALES[current] ?? 'en-GB';
}

/** Set the active language and re-render every subscribed component. */
export function setLanguageSync(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * Translate. The English sentence IS the key.
 * Placeholders use {name}:  t('you have {n} reflections', { n: 10 })
 */
export function t(en: string, params?: Record<string, string | number>): string {
  const dict = TRANSLATIONS[current];
  let out = (dict && dict[en]) || en;
  if (params) {
    for (const k of Object.keys(params)) {
      out = out.split(`{${k}}`).join(String(params[k]));
    }
  }
  return out;
}

/**
 * Use inside components so they re-render when the language changes.
 *   const { t, lang } = useT();
 */
export function useT(): { t: typeof t; lang: Lang } {
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => subscribe(() => force()), []);
  return { t, lang: current };
}
