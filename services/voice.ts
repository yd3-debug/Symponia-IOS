// Voice preference and consent.
//
// Voice is opt-in. Nothing is recorded, transcribed or sent to a speech
// provider until the person has said yes on the voice consent screen
// (components/revamp/VoiceConsent.tsx). `null` means they have not been asked
// yet; `false` means they chose to type. Typing always works.
//
// Like the memory flag (services/memory.ts), the answer is cached on the device
// for fast reads and mirrored to the profile so the server can refuse to
// produce speech for someone who has not agreed. The profile columns are added
// by supabase/migrations/20261009120000_add_voice_prefs.sql; until that is
// applied the mirror write fails quietly and the local value still holds.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export type VoiceKind = 'woman' | 'man';
export type VoicePrefs = { enabled: boolean | null; kind: VoiceKind };

const ENABLED = 'symponia_voice_enabled';
const KIND = 'symponia_voice_kind';

export async function getVoicePrefs(): Promise<VoicePrefs> {
  try {
    const [[, enabled], [, kind]] = await AsyncStorage.multiGet([ENABLED, KIND]);
    return {
      enabled: enabled === null ? null : enabled === 'true',
      kind: kind === 'man' ? 'man' : 'woman',
    };
  } catch {
    // Fail closed: if the answer cannot be read, treat voice as not agreed.
    return { enabled: false, kind: 'woman' };
  }
}

export async function setVoicePrefs(prefs: { enabled: boolean; kind: VoiceKind }): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [ENABLED, String(prefs.enabled)],
      [KIND, prefs.kind],
    ]);
  } catch {}
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('profiles')
        .update({ voice_enabled: prefs.enabled, voice_kind: prefs.kind })
        .eq('user_id', user.id);
    }
  } catch {}
}
