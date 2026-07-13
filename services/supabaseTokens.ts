import { TRIAL_TOKENS } from '@/constants/config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// ── Token model ───────────────────────────────────────────────────────────────
// The server (oracle edge function) is the SINGLE source of truth for spending:
// on every reflection it deducts subscription_tokens first, then topup_tokens.
//
// The client only DISPLAYS the remaining balance (subscription_tokens + topup_tokens)
// and keeps a local optimistic copy in AsyncStorage ('symponia_tokens') so the UI
// can update instantly. The client never writes the balance back to the server —
// doing so previously double-counted against the wrong (legacy `tokens`) column and
// caused the balance to "reset" on every re-sync.

interface RemoteBalance {
  subscription_tokens: number;
  topup_tokens: number;
}

async function fetchRemoteBalance(): Promise<RemoteBalance | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('subscription_tokens, topup_tokens')
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    subscription_tokens: data.subscription_tokens ?? 0,
    topup_tokens: data.topup_tokens ?? 0,
  };
}

// Authoritative remaining reflections = subscription + top-up.
// Call on launch, on foreground, and after each reflection to reconcile.
// Subscription renewals are applied server-side (subscription_tokens is rewritten),
// so reading the live sum automatically reflects a renewal without client reset logic.
export async function syncTokens(): Promise<number> {
  try {
    const balance = await fetchRemoteBalance();
    if (balance === null) {
      const local = await AsyncStorage.getItem('symponia_tokens');
      return local !== null ? parseInt(local, 10) : TRIAL_TOKENS;
    }
    const total = balance.subscription_tokens + balance.topup_tokens;
    await AsyncStorage.setItem('symponia_tokens', String(total));
    return total;
  } catch {
    // Network failure — fall back to last known local value.
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

/**
 * Which plan the user is actually on, so no screen has to assume "monthly".
 *
 * Returns null when not subscribed. Subscribers whose row predates the
 * subscription_product_id column (i.e. everyone who bought before this release)
 * report the monthly id — which is correct, because monthly was the only plan
 * that existed. They self-correct on their next renewal.
 */
export async function getActivePlanId(): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('subscription_expires_at, subscription_product_id')
      .maybeSingle();

    if (error || !data?.subscription_expires_at) return null;
    if (new Date(data.subscription_expires_at) <= new Date()) return null;

    return data.subscription_product_id ?? 'com.symponia.premium.monthly';
  } catch {
    return null;
  }
}

// Optimistic local-only update for instant UI right after a reflection. The server
// has already deducted the real balance; the next syncTokens() call reconciles.
// Intentionally does NOT write to the server (that is the oracle's job).
export async function deductToken(newBalance: number): Promise<void> {
  try {
    await AsyncStorage.setItem('symponia_tokens', String(Math.max(0, newBalance)));
  } catch {
    // Ignore — the server remains the source of truth.
  }
}
