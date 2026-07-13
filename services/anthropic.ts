import { SUPABASE_URL } from '@/constants/config';
import { supabase } from './supabase';
import { buildMemoryContext } from './memory';
import { getLanguage } from '@/constants/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Keep only the last MAX_HISTORY_TURNS user+assistant pairs to bound input tokens.
const MAX_HISTORY_TURNS = 10; // 10 user + 10 assistant = 20 messages max

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const ORACLE_URL = `${SUPABASE_URL}/functions/v1/oracle`;

async function getValidToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) return null;

  // Check if token is expired or expiring in the next 60 seconds
  const isExpired = session.expires_at ? (session.expires_at * 1000) < (Date.now() + 60000) : false;
  
  if (!isExpired && session.access_token) {
    return session.access_token;
  }

  // Session token is expired - force refresh
  const { data: { session: refreshed }, error } = await supabase.auth.refreshSession();
  if (error || !refreshed) {
    console.error("Token refresh failed:", error?.message);
    return null;
  }
  return refreshed?.access_token ?? null;
}

// fetch-based non-streaming call — reliable in Expo Go / Hermes
function streamSSE(
  body: object,
  onToken: (token: string) => void,
  onComplete: (full: string) => void,
  onError?: (err: Error) => void,
): () => void {
  let aborted = false;
  const noStreamBody = { ...(body as Record<string, unknown>), stream: false };

  (async () => {
    const consent = await AsyncStorage.getItem('symponia_ai_consent');
    if (consent !== 'true') {
      onError?.(new Error('AI_CONSENT_REQUIRED'));
      return;
    }

    const token = await getValidToken();
    if (!token) {
      onError?.(new Error('Session expired. Please sign in again.'));
      return;
    }

    if (aborted) return;

    try {
      const res = await fetch(ORACLE_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(noStreamBody),
      });

      if (aborted) return;
      if (!res.ok) {
        const err = await res.text().catch(() => '');

        // Fair use (429) and trial-finished (402) are not errors in the "something
        // broke" sense — they're states the UI must render specifically, not as
        // "the current shifted".
        if (res.status === 429 || res.status === 402) {
          let parsed: any = {};
          try { parsed = JSON.parse(err); } catch {}
          if (parsed.code === 'FAIR_USE_WEEK' || parsed.code === 'FAIR_USE_BURST') {
            onError?.(new FairUseError(
              parsed.code === 'FAIR_USE_BURST' ? 'burst' : 'week',
              parsed.resetAt ?? null,
            ));
            return;
          }
          if (parsed.code === 'TRIAL_EXHAUSTED' || res.status === 402) {
            onError?.(new TrialExhaustedError());
            return;
          }
        }

        // If Edge function tells us the token is dead or user is deleted, force log out.
        if (err.includes('Auth failed') || err.includes('Unauthorized') || err.includes('missing sub claim')) {
          supabase.auth.signOut().then(() => {
            onError?.(new Error('Session corrupted. Logging you out...'));
            // Need to require router inline to avoid circular dependencies if any
            const { router } = require('expo-router');
            router.replace('/onboarding');
          });
          return;
        }

        onError?.(new Error(`The current shifted. (${res.status}) ${err}`.trim()));
        return;
      }
      const json = await res.json();
      const text: string = json.content?.[0]?.text ?? '';
      onToken(text);
      onComplete(text);
    } catch {
      if (!aborted) onError?.(new Error('The current shifted. Network unreachable.'));
    }
  })();

  return () => { aborted = true; };
}

export function streamChat(
  userInput: string,
  history: Message[],
  resonanceFrequency: string,
  mode: string,
  onToken: (token: string) => void,
  onComplete: (full: string) => void,
  onError?: (err: Error) => void,
): () => void {
  let cancel = () => {};
  let cancelled = false;

  (async () => {
    // Trim to the last MAX_HISTORY_TURNS pairs before appending the new message.
    const trimmed = history.slice(-MAX_HISTORY_TURNS * 2);

    // On the first turn of a session, fold in a short recall block from past
    // reflections (only if the user opted into memory). This rides in the user
    // message and never touches the caller's saved/displayed history.
    let content = userInput;
    if (history.length === 0) {
      try {
        const memory = await buildMemoryContext();
        if (memory) content = `${memory}\n\n${userInput}`;
      } catch {}
    }

    if (cancelled) return;

    const messages: Message[] = [...trimmed, { role: 'user', content }];

    const body = {
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      mode,
      resonanceFrequency,
      messages,
      language: getLanguage(),
    };

    // Route ALL errors to the caller's onError — never through onComplete/onToken.
    // A failed request must never look like a real answer, or the chat screen would
    // charge a reflection (and save/haptic) for a message that never got a response.
    cancel = streamSSE(body, onToken, onComplete, (err) => {
      onError?.(err);
    });
  })();

  return () => { cancelled = true; cancel(); };
}

export class RateLimitError extends Error {
  retryAfter: number;
  constructor(retryAfter: number) {
    super('Daily reflection rate limit exceeded');
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * A subscriber reached the fair-use window (50 / 7 days, or 15 / 5 hours).
 *
 * This is NOT "you have run out" — nothing was spent. It carries the moment the
 * window reopens, because the only useful thing to tell someone here is when
 * they can come back, not that they have exhausted a balance.
 */
export class FairUseError extends Error {
  resetAt: string | null;
  kind: 'week' | 'burst';
  constructor(kind: 'week' | 'burst', resetAt: string | null) {
    super('Fair use window reached');
    this.name = 'FairUseError';
    this.kind = kind;
    this.resetAt = resetAt;
  }
}

/** The 10-reflection free trial is finished. Distinct from fair use. */
export class TrialExhaustedError extends Error {
  constructor() {
    super('Trial finished');
    this.name = 'TrialExhaustedError';
  }
}

export interface DailyReflectionContext {
  name?: string;
  animals?: string[];
  frequency?: string;
}

// Per-user, per-date AI reflection for push notifications.
// Uses mode:'daily-reflection' — oracle skips token deduction for this mode.
// Throws RateLimitError on 429; caller (topUpDailyReflections) skips gracefully.
export async function generateDailyReflection(
  context: DailyReflectionContext,
  targetDate: Date,
): Promise<string> {
  const token = await getValidToken();
  if (!token) throw new Error('Session expired');

  const consent = await AsyncStorage.getItem('symponia_ai_consent');
  if (consent !== 'true') throw new Error('AI_CONSENT_REQUIRED');

  const dateStr = targetDate.toISOString().slice(0, 10);
  const body = {
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    mode: 'daily-reflection',
    language: getLanguage(),
    context: {
      name: context.name,
      animals: context.animals ?? [],
      frequency: context.frequency ?? 'Precise',
    },
    targetDate: dateStr,
  };

  const res = await fetch(ORACLE_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    const errJson = await res.json().catch(() => ({}));
    const retryAfter: number = errJson.retryAfter ?? 86400;
    console.warn(`Daily reflection rate limited. Retry after ${retryAfter}s`);
    throw new RateLimitError(retryAfter);
  }
  if (!res.ok) throw new Error(`oracle:${res.status}`);
  const json = await res.json();
  const text = (json.reflection ?? '').trim();
  if (!text) throw new Error('oracle:empty');
  return text;
}

/**
 * The opening message of a session, in the user's language.
 *
 * Opening messages are built on-device and pushed into the chat as assistant
 * messages, which render with <Text raw> — so the i18n dictionaries can never
 * reach them. Correct for English; for the other eight languages it meant the
 * app greeted you in English and only switched once you replied.
 *
 * The English reading goes up, Claude writes the same reading in the user's
 * language (composed, not translated — same structure, native prose), and the
 * result is cached per language + animal set, so this normally fires once.
 *
 * FAIL-SAFE BY CONSTRUCTION: English short-circuits before any network call, and
 * every failure path returns the English source unchanged. This function can
 * never render the app worse than it is today — the worst case IS today.
 */
export async function localizeOpening(englishOpening: string): Promise<string> {
  const lang = getLanguage();
  if (lang === 'en' || !englishOpening.trim()) return englishOpening;

  // Cache key: language + a cheap stable hash of the source. Changing animals or
  // language produces a new key; nothing else re-triggers generation.
  let h = 0;
  for (let i = 0; i < englishOpening.length; i++) {
    h = (Math.imul(31, h) + englishOpening.charCodeAt(i)) | 0;
  }
  const cacheKey = `symponia_opening_${lang}_${h >>> 0}`;

  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) return cached;
  } catch {}

  try {
    const consent = await AsyncStorage.getItem('symponia_ai_consent');
    if (consent !== 'true') return englishOpening;

    const token = await getValidToken();
    if (!token) return englishOpening;

    const res = await fetch(ORACLE_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'opening', language: lang, source: englishOpening }),
    });
    if (!res.ok) return englishOpening;

    const json = await res.json();
    const opening = (json.opening ?? '').trim();
    if (!opening) return englishOpening;

    try {
      await AsyncStorage.setItem(cacheKey, opening);
    } catch {}
    return opening;
  } catch {
    return englishOpening;
  }
}

export function streamAnimalSynthesis(
  animals: string[], // session animals — used for exploration, oracle prefers these over profile
  onToken: (token: string) => void,
  onComplete: () => void,
  onError?: (err: Error) => void,
): () => void {
  const body = {
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    mode: 'synthesis',
    language: getLanguage(),
    sessionAnimals: animals,
  };

  return streamSSE(body, onToken, () => onComplete(), (err) => {
    if (err.message === 'AI_CONSENT_REQUIRED') {
      onError?.(err);
      onComplete();
      return;
    }
    onToken(err.message);
    onComplete();
  });
}

export function streamArchetype(
  word: string,
  resonanceFrequency: string,
  mode: string,
  onToken: (token: string) => void,
  onComplete: () => void,
  onError?: (err: Error) => void,
): () => void {
  const body = {
    model: 'claude-sonnet-4-6',
    max_tokens: 200,
    mode: 'archetype',
    language: getLanguage(),
    word,
    resonanceFrequency,
  };

  return streamSSE(body, onToken, (_full) => onComplete(), (err) => {
    if (err.message === 'AI_CONSENT_REQUIRED') {
      onError?.(err);
      onComplete();
      return;
    }
    onToken(err.message);
    onComplete();
  });
}
