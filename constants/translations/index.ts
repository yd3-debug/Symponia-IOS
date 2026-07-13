// All translation dictionaries, keyed by the English source string.
// Add a language by dropping in a file and registering it here.
// Anything missing falls back to English automatically.

import type { Lang } from '../i18n';
import es from './es';
import pt from './pt';
import de from './de';
import fr from './fr';
import it from './it';
import ru from './ru';
import da from './da';
import sv from './sv';

export const DICTS: Partial<Record<Lang, Record<string, string>>> = {
  es,
  pt,
  de,
  fr,
  it,
  ru,
  da,
  sv,
  // pt, fr, de, it, ru, da, sv, no — added as they land
};
