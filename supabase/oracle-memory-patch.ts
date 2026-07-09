// ─────────────────────────────────────────────────────────────────────────────
// ORACLE MEMORY PATCH
// Drop this into the oracle edge function AFTER you have verified the JWT and have
// the authenticated `user` (auth.getUser) and a Supabase client. It gates on
// profiles.memory_enabled, pulls a little recent context, and prepends it to the
// system prompt. Memory is best-effort: if anything fails, the reply still goes out.
//
// Prereq migration (run once in the SQL editor):
//   ALTER TABLE public.profiles
//     ADD COLUMN IF NOT EXISTS memory_enabled boolean NOT NULL DEFAULT false;
// ─────────────────────────────────────────────────────────────────────────────

async function buildMemoryBlock(supabase: any, userId: string): Promise<string> {
  try {
    // 1. Consent gate — retrieval only when the user opted in.
    const { data: prof } = await supabase
      .from('profiles')
      .select('memory_enabled')
      .eq('user_id', userId)
      .maybeSingle();

    if (!prof?.memory_enabled) return '';

    // 2. Pull the most recent conversations (RLS keeps this to the user's own rows).
    const { data: convos } = await supabase
      .from('conversations')
      .select('messages, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(5);

    // 3. Take the last handful of the person's own lines as lightweight memory.
    const recent: string[] = (convos ?? [])
      .flatMap((c: any) => (c.messages ?? []))
      .filter((m: any) => m?.role === 'user' && typeof m?.text === 'string')
      .slice(-12)
      .map((m: any) => `- ${m.text.slice(0, 280)}`);

    if (recent.length === 0) return '';

    return (
      '\n\nWhat you remember about this person from past reflections ' +
      '(hold this gently in mind, do not recite it back verbatim):\n' +
      recent.join('\n') +
      '\n'
    );
  } catch (_e) {
    // Never let memory block a response.
    return '';
  }
}

// USAGE, where you currently build the system prompt:
//
//   const memoryBlock = await buildMemoryBlock(supabase, user.id);
//   const system = BASE_SYSTEM_PROMPT + memoryBlock;
//
// Notes:
// - Use a client that respects RLS for the user (user-scoped) OR, if you use the
//   service-role client here, the .eq('user_id', userId) filter above keeps it
//   scoped to that one person. Do not drop that filter.
// - This is the cheap version (raw recent lines). For a tidier memory, summarize
//   `recent` with a small model once per session and cache it, rather than sending
//   raw lines every call.

export { buildMemoryBlock };
