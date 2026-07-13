// Usage — what Settings shows a subscriber instead of a balance.
//
// Deliberately NOT "tokens remaining". A depleting counter asks someone to ration
// their inner life, and the person most likely to watch it hit zero is the person
// having the hardest month. Subscribers get a window and a reset time, in the
// same shape Claude itself reports usage.
//
// Trial users are the only people who still see a count, because a trial genuinely
// is finite and pretending otherwise would be dishonest.

import { SUPABASE_URL } from '@/constants/config';
import { supabase } from './supabase';

const ORACLE_URL = `${SUPABASE_URL}/functions/v1/oracle`;

export type Usage =
  | { subscribed: false; trialLeft: number }
  | {
      subscribed: true;
      used: number;
      limit: number;
      /** When the oldest reflection in the window ages out. Null if nothing used. */
      resetAt: string | null;
      /** When the subscription itself renews. */
      renewsAt: string | null;
    };

/**
 * Fetch usage. Never throws — a failure here must not break Settings, so it
 * returns null and the caller simply renders nothing.
 */
export async function fetchUsage(): Promise<Usage | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return null;

    const res = await fetch(ORACLE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'usage' }),
    });
    if (!res.ok) return null;
    return (await res.json()) as Usage;
  } catch {
    return null;
  }
}
