import { TRIAL_TOKENS } from '@/constants/config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// ── Token model ───────────────────────────────────────────────────────────────
// Single bucket. New users receive TRIAL_TOKENS once on first sign-up.
// Purchased tokens (IAP) are added to the same bucket and roll over.
// AsyncStorage key: 'symponia_tokens'

async function fetchRemoteTokens(): Promise<number | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('tokens')
    .maybeSingle();

  if (error) throw error;
  return data?.tokens ?? null;
}

async function upsertTokens(tokens: number): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('profiles')
    .upsert(
      { user_id: user.id, tokens, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
}

// ── App-level sync ────────────────────────────────────────────────────────────

// Call on app launch / foreground. Returns authoritative token count.
export async function syncTokens(): Promise<number> {
  try {
    const localStr = await AsyncStorage.getItem('symponia_tokens');
    const remote = await fetchRemoteTokens();

    let tokens: number;

    if (remote === null) {
      // Profile has no tokens row yet — preserve local if it exists (avoids
      // wiping tokens when the remote fetch transiently returns null)
      tokens = localStr !== null ? parseInt(localStr, 10) : TRIAL_TOKENS;
      await upsertTokens(tokens);
      await AsyncStorage.setItem('symponia_tokens', String(tokens));
    } else {
      const local = localStr !== null ? parseInt(localStr, 10) : 0;
      // Remote wins if higher (user bought tokens on another device / web)
      tokens = Math.max(remote, local);
      await AsyncStorage.setItem('symponia_tokens', String(tokens));
      if (tokens !== remote) await upsertTokens(tokens);
    }

    return tokens;
  } catch {
    // Network failure — fall back to local
    const local = await AsyncStorage.getItem('symponia_tokens');
    return local !== null ? parseInt(local, 10) : TRIAL_TOKENS;
  }
}

// Check if the user has an active subscription.
export async function checkSubscription(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('subscription_expires_at')
      .maybeSingle();

    if (error || !data?.subscription_expires_at) return false;
    return new Date(data.subscription_expires_at) > new Date();
  } catch {
    return false;
  }
}

// Add tokens to the user's balance (e.g. after subscription or pack purchase).
export async function addTokens(amount: number): Promise<number> {
  try {
    const localStr = await AsyncStorage.getItem('symponia_tokens');
    const current = localStr !== null ? parseInt(localStr, 10) : 0;
    const next = current + amount;
    await AsyncStorage.setItem('symponia_tokens', String(next));
    await upsertTokens(next);
    return next;
  } catch {
    return amount;
  }
}

// Call after each message is sent.
export async function deductToken(newBalance: number): Promise<void> {
  try {
    await AsyncStorage.setItem('symponia_tokens', String(newBalance));
    await upsertTokens(newBalance);
  } catch {
    // Swallow — local already written
  }
}
