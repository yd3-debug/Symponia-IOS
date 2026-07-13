// Mood check-ins — how they arrive, and how they leave.
//
// This is the retention mechanic, and it works by being useful rather than by
// being sticky. A streak punishes the day someone is too flat to open the app —
// which is the day the app exists for. This asks for one tap and gives back
// evidence: over a week, they can SEE whether reflecting is moving anything.
//
// Never framed as clinical. It is a private note to oneself.

import { supabase } from './supabase';

export type Phase = 'before' | 'after';
export type MoodRow = { score: number; phase: Phase; session_id: string | null; created_at: string };

/** Record a check-in. Never throws — a failed save must not block the app. */
export async function saveMood(score: number, phase: Phase, sessionId?: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('mood_checkins').insert({
      user_id: user.id,
      score,
      phase,
      session_id: sessionId ?? null,
    });
  } catch {
    // Swallow. Losing one mood point is not worth an error in someone's face.
  }
}

/** The last 7 days, oldest first. */
export async function fetchMoodWeek(): Promise<MoodRow[]> {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('mood_checkins')
      .select('score, phase, session_id, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: true });
    if (error || !data) return [];
    return data as MoodRow[];
  } catch {
    return [];
  }
}

/**
 * Has this person already checked in on arrival today?
 *
 * Asked ONCE a day, on opening. Asking every time they open the app would turn a
 * gentle question into a toll gate.
 */
export async function hasCheckedInToday(): Promise<boolean> {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from('mood_checkins')
      .select('*', { count: 'exact', head: true })
      .eq('phase', 'before')
      .gte('created_at', start.toISOString());
    return (count ?? 0) > 0;
  } catch {
    // Fail toward NOT asking. A duplicate prompt is more annoying than a missed one.
    return true;
  }
}

/**
 * The number that actually matters: did reflecting move anything?
 *
 * Pairs each 'after' with its 'before' by session_id and averages the lift.
 * Returns null when there isn't enough to say anything honest yet — better to
 * show nothing than to draw a confident line through two points.
 */
export function averageLift(rows: MoodRow[]): number | null {
  const before = new Map<string, number>();
  for (const r of rows) {
    if (r.phase === 'before' && r.session_id) before.set(r.session_id, r.score);
  }
  const deltas: number[] = [];
  for (const r of rows) {
    if (r.phase === 'after' && r.session_id && before.has(r.session_id)) {
      deltas.push(r.score - before.get(r.session_id)!);
    }
  }
  if (deltas.length < 2) return null;
  return deltas.reduce((a, b) => a + b, 0) / deltas.length;
}
