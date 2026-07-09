// Memory preference. Opt-in only. When OFF, reflections are never stored on the server
// (the remote conversation save is skipped), preserving a true "nothing stored" promise.
// When ON, reflections are stored (RLS-scoped to the user) so Symponia can remember over time.
//
// The flag is cached locally for fast, synchronous-ish reads on the hot save path, and mirrored
// to profiles.memory_enabled so the server (oracle) can decide whether to retrieve memory.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const KEY = 'symponia_memory_enabled';

export async function isMemoryEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === 'true';
  } catch {
    return false; // fail closed: if we cannot read the flag, do not store
  }
}

export async function setMemoryEnabled(on: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, String(on));
  } catch {}
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({ memory_enabled: on }).eq('user_id', user.id);
    }
  } catch {}
}

// Builds a short recall block from the user's own recent reflections, for injection
// into the first turn of a session so Symponia "remembers" across sessions. Returns ''
// when memory is off, there is no session, or nothing has been stored yet. RLS keeps
// the read scoped to this user's own conversations.
export async function buildMemoryContext(): Promise<string> {
  try {
    if (!(await isMemoryEnabled())) return '';
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return '';

    const { data } = await supabase
      .from('conversations')
      .select('messages, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(5);

    const recent = (data ?? [])
      .flatMap((c: any) => (c.messages ?? []))
      .filter((m: any) => m?.role === 'user' && typeof m?.text === 'string')
      .slice(-12)
      .map((m: any) => `- ${String(m.text).slice(0, 280)}`);

    if (recent.length === 0) return '';

    return (
      "[Context Symponia holds from this person's past reflections — " +
      'hold gently, do not quote back verbatim:\n' +
      recent.join('\n') +
      ']'
    );
  } catch {
    return '';
  }
}

// Pull the server value into the local cache (e.g. after sign-in on a new device).
export async function syncMemoryFlag(): Promise<boolean> {
  try {
    const { data } = await supabase.from('profiles').select('memory_enabled').maybeSingle();
    const on = data?.memory_enabled === true;
    await AsyncStorage.setItem(KEY, String(on));
    return on;
  } catch {
    return isMemoryEnabled();
  }
}
