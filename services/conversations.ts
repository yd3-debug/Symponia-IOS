// Per-mode conversation persistence.
// Writes to AsyncStorage immediately (fast) and Supabase in the background (safe).
// On load: AsyncStorage first, falls back to Supabase if empty (e.g. after reinstall).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

const localKey = (mode: string) => `symponia_chat_${mode}`;
const MAX_MESSAGES = 40;

export async function loadConversation(mode: string): Promise<ChatMessage[]> {
  // Local first — instant
  try {
    const raw = await AsyncStorage.getItem(localKey(mode));
    if (raw) {
      const parsed: ChatMessage[] = JSON.parse(raw);
      if (parsed.length > 0) return parsed;
    }
  } catch {}

  // Nothing local — try remote (covers reinstalls)
  try {
    const { data } = await supabase
      .from('conversations')
      .select('messages')
      .eq('mode', mode)
      .maybeSingle();

    if (data?.messages?.length > 0) {
      await AsyncStorage.setItem(localKey(mode), JSON.stringify(data.messages));
      return data.messages as ChatMessage[];
    }
  } catch {}

  return [];
}

export async function saveConversation(mode: string, messages: ChatMessage[]): Promise<void> {
  const toSave = messages.slice(-MAX_MESSAGES);

  // Local — synchronous-ish, always succeeds
  try {
    await AsyncStorage.setItem(localKey(mode), JSON.stringify(toSave));
  } catch {}

  // Remote — fire and forget, tied to the user's account
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    supabase
      .from('conversations')
      .upsert(
        { user_id: user.id, mode, messages: toSave, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,mode' },
      )
      .then(({ error }) => {
        if (error) console.error(`[conversations] save failed (${mode}):`, error);
      });
  } catch {}
}

export async function clearConversation(mode: string): Promise<void> {
  await AsyncStorage.removeItem(localKey(mode));

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('conversations').delete().eq('user_id', user.id).eq('mode', mode);
  } catch {}
}

const ALL_MODES = ['animal', 'day', 'daily', 'synthesis', 'open'];

export async function clearAllConversations(): Promise<void> {
  await AsyncStorage.multiRemove(ALL_MODES.map(localKey));

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('conversations').delete().eq('user_id', user.id);
  } catch {}
}
