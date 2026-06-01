import { SUPABASE_URL } from '@/constants/config';
import { supabase } from './supabase';
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
      onComplete('Session expired. Please sign in again.');
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

        // If Edge function tells us the token is dead or user is deleted, force log out.
        if (err.includes('Auth failed') || err.includes('Unauthorized') || err.includes('missing sub claim')) {
          supabase.auth.signOut().then(() => {
            onError?.(new Error('Session corrupted. Logging you out...'));
            onComplete('Session corrupted. Logging you out...');
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
  // Trim to the last MAX_HISTORY_TURNS pairs before appending the new message.
  const trimmed = history.slice(-MAX_HISTORY_TURNS * 2);
  const messages: Message[] = [
    ...trimmed,
    { role: 'user', content: userInput },
  ];

  const body = {
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    mode,
    resonanceFrequency,
    messages,
  };

  return streamSSE(body, onToken, onComplete, (err) => {
    if (err.message === 'AI_CONSENT_REQUIRED') {
      onError?.(err);
      onComplete('');
      return;
    }
    onToken(err.message);
    onComplete(err.message);
  });
}

export class RateLimitError extends Error {
  retryAfter: number;
  constructor(retryAfter: number) {
    super('Daily reflection rate limit exceeded');
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
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
