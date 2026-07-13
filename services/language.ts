// Language preference: stored on-device for instant boot, mirrored to
// profiles.language so it follows the user across devices and so the server
// (daily reflections) can speak the right language.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { LANGUAGES, getLanguage, setLanguageSync, type Lang } from '@/constants/i18n';

const KEY = 'symponia_language';

function isSupported(v: string | null | undefined): v is Lang {
  return !!v && LANGUAGES.some((l) => l.code === v);
}

/**
 * Load the saved language into the i18n core. Call once at app boot.
 * Falls back to English — never throws, never blocks the UI.
 */
export async function loadLanguage(): Promise<Lang> {
  try {
    const saved = await AsyncStorage.getItem(KEY);
    if (isSupported(saved)) {
      setLanguageSync(saved);
      return saved;
    }
  } catch {}
  return getLanguage(); // 'en'
}

/** Persist the choice locally + to the user's profile (best-effort). */
export async function saveLanguage(lang: Lang): Promise<void> {
  setLanguageSync(lang);
  try {
    await AsyncStorage.setItem(KEY, lang);
  } catch {}
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({ language: lang }).eq('user_id', user.id);
    }
  } catch {}
}

/** Pull the server value into the local cache (e.g. after sign-in on a new device). */
export async function syncLanguageFromProfile(): Promise<Lang> {
  try {
    const { data } = await supabase.from('profiles').select('language').maybeSingle();
    const remote = data?.language as string | undefined;
    if (isSupported(remote)) {
      setLanguageSync(remote);
      await AsyncStorage.setItem(KEY, remote);
      return remote;
    }
  } catch {}
  return getLanguage();
}
