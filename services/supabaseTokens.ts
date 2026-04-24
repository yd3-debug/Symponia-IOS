import { TRIAL_TOKENS } from '@/constants/config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// ── Token model ───────────────────────────────────────────────────────────────
// Single bucket. New users receive TRIAL_TOKENS once on first sign-up.
// Subscriptions reset tokens to 350 each billing period (server writes tokens_reset_at).
// AsyncStorage key: 'symponia_tokens'
// AsyncStorage key: 'symponia_last_reset_seen' — ISO timestamp of last known server reset

interface RemoteProfile {
  tokens: number | null;
  tokens_reset_at: string | null;
}

async function fetchRemoteProfile(): Promise<RemoteProfile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('tokens, tokens_reset_at')
    .maybeSingle();

  if (error) throw error;
  return {
    tokens: data?.tokens ?? null,
    tokens_reset_at: data?.tokens_reset_at ?? null,
  };
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
// When the server has reset tokens for a new billing period (tokens_reset_at
// is newer than symponia_last_reset_seen), the server value is used directly
// instead of the normal max(local, remote) reconciliation, so a user whose
// subscription renewed while the app was closed gets their tokens back on
// first open without relying solely on the Apple server-to-server webhook.
export async function syncTokens(): Promise<number> {
  try {
    const pairs = await AsyncStorage.multiGet(['symponia_tokens', 'symponia_last_reset_seen']);
    const localStr = pairs[0][1];
    const lastResetSeen = pairs[1][1];

    const profile = await fetchRemoteProfile();

    let tokens: number;

    if (profile.tokens === null) {
      // Profile has no tokens row yet — preserve local if it exists
      tokens = localStr !== null ? parseInt(localStr, 10) : TRIAL_TOKENS;
      await upsertTokens(tokens);
      await AsyncStorage.setItem('symponia_tokens', String(tokens));
    } else {
      const serverResetAt = profile.tokens_reset_at;
      const hasNewReset = serverResetAt && (!lastResetSeen || serverResetAt > lastResetSeen);

      if (hasNewReset) {
        // Server reset tokens for a new billing period — trust server value
        tokens = profile.tokens;
        await AsyncStorage.multiSet([
          ['symponia_tokens', String(tokens)],
          ['symponia_last_reset_seen', serverResetAt],
        ]);
      } else {
        // Normal reconciliation: remote wins if higher (e.g. purchased on another device)
        const local = localStr !== null ? parseInt(localStr, 10) : 0;
        tokens = Math.max(profile.tokens, local);
        await AsyncStorage.setItem('symponia_tokens', String(tokens));
        if (tokens !== profile.tokens) await upsertTokens(tokens);
      }
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
