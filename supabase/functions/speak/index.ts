// Symponia — speak
// Turns one of the cloud's replies into speech with ElevenLabs and streams the
// audio back. The provider key never leaves this function.
//
// Who may call it: a signed-in person who has agreed to AI processing
// (profiles.ai_consent) AND to voice (profiles.voice_enabled). The voice is
// taken from their profile, never from the request, so a caller cannot ask for
// an arbitrary voice.
//
// Cost control, enforced here and nowhere else:
//   - one reply is at most MAX_TEXT characters;
//   - a rolling 30-day cap on characters per person, far higher for
//     subscribers than for people on the trial;
//   - a rolling one-hour cap to stop a script.
// On top of that sits the credit limit set on the ElevenLabs key itself.
//
// Known gap, to close before release: the text comes from the app, so within
// their cap a person could have the cloud's voice read any text. Bind speech
// to replies this server generated (sign them in oracle, verify here).
//
// Deploy: supabase functions deploy speak

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno';
import { CLOUD_VOICES, type CloudVoiceKind } from '../_shared/voices.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-voice-selftest',
};
const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json' };

const MAX_TEXT = 1200;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS;
const HOUR_MS = 60 * 60 * 1000;
// About two hours of the cloud speaking, roughly $4.80 at $0.04 per 1,000 characters.
const MONTH_CAP_SUBSCRIBER = 120_000;
// Enough for a first session and a short daily line; about $0.32.
const MONTH_CAP_TRIAL = 8_000;
const HOUR_CAP = 12_000;

// The languages the app speaks. Passed to the provider so a short reply is
// never read in the wrong language.
const LANGS = new Set(['en', 'es', 'pt', 'fr', 'de', 'it', 'ru', 'da', 'sv']);

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** Replaces control characters (including newlines and tabs) with spaces and collapses runs of spaces. */
function clean(input: string): string {
  return Array.from(input, (c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c))
    .join('')
    .split(' ')
    .filter(Boolean)
    .join(' ');
}

function model(): string {
  return Deno.env.get('ELEVENLABS_MODEL') || 'eleven_flash_v2_5';
}

async function synthesize(voiceId: string, text: string, language: string | null, stream: boolean): Promise<Response> {
  const key = Deno.env.get('ELEVENLABS_API_KEY');
  if (!key) return new Response('missing key', { status: 500 });
  const url =
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}${stream ? '/stream' : ''}` +
    // 64 kbps mono speech: half the bytes of the default with no audible loss for a voice.
    `?output_format=mp3_44100_64`;
  const body: Record<string, unknown> = { text, model_id: model() };
  if (language) body.language_code = language;
  return fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify(body),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');

  // ── Self-test ─────────────────────────────────────────────────────────────
  // Proves the key and both voices work without a user session. The token must
  // already be in voice_selftest_tokens (only a database admin can put it
  // there), is deleted on first use, and the reply carries status codes only.
  const selftest = req.headers.get('x-voice-selftest');
  if (selftest) {
    const { data: row } = await admin
      .from('voice_selftest_tokens')
      .delete()
      .eq('token', selftest)
      .gt('expires_at', new Date().toISOString())
      .select('token')
      .maybeSingle();
    if (!row) return json({ error: 'Unauthorized' }, 401);

    const result: Record<string, unknown> = { model: model() };
    for (const kind of Object.keys(CLOUD_VOICES) as CloudVoiceKind[]) {
      try {
        const res = await synthesize(CLOUD_VOICES[kind].id, 'I am here.', 'en', false);
        if (res.ok) {
          const bytes = (await res.arrayBuffer()).byteLength;
          result[kind] = { name: CLOUD_VOICES[kind].name, ok: true, status: res.status, audioBytes: bytes };
        } else {
          const detail = (await res.text()).slice(0, 300);
          result[kind] = { name: CLOUD_VOICES[kind].name, ok: false, status: res.status, detail };
        }
      } catch (e) {
        result[kind] = { name: CLOUD_VOICES[kind].name, ok: false, status: 0, detail: String(e).slice(0, 200) };
      }
    }
    return json(result, 200);
  }

  // ── Who is calling ────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return json({ error: 'Unauthorized' }, 401);
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  let body: { text?: unknown; language?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON', code: 'BAD_REQUEST' }, 400);
  }

  // Control characters out, whitespace collapsed, then the length limit.
  const text = typeof body.text === 'string' ? clean(body.text) : '';
  if (!text) return json({ error: 'Nothing to say', code: 'BAD_REQUEST' }, 400);
  if (text.length > MAX_TEXT) return json({ error: 'Reply too long to speak', code: 'TEXT_TOO_LONG' }, 413);
  const language = typeof body.language === 'string' && LANGS.has(body.language) ? body.language : null;

  // ── Consent ───────────────────────────────────────────────────────────────
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('ai_consent, voice_enabled, voice_kind, subscription_expires_at')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profileError || !profile || profile.ai_consent !== true) {
    return json({ error: 'consent required', code: 'consent_required' }, 403);
  }
  if (profile.voice_enabled !== true) {
    return json({ error: 'voice consent required', code: 'voice_consent_required' }, 403);
  }

  // ── Caps ──────────────────────────────────────────────────────────────────
  const now = Date.now();
  const { data: rows, error: usageError } = await admin
    .from('voice_usage')
    .select('characters, created_at')
    .eq('user_id', user.id)
    .gte('created_at', new Date(now - MONTH_MS).toISOString())
    .order('created_at', { ascending: true })
    .limit(5000);
  // Fail CLOSED. Unlike the text limiter, a broken meter here could spend real
  // money on someone else's account, and the person can still read the reply.
  if (usageError) return json({ error: 'Voice is resting', code: 'VOICE_UNAVAILABLE' }, 503);

  const used = (rows ?? []).reduce((sum: number, r: { characters: number }) => sum + r.characters, 0);
  const hourStart = now - HOUR_MS;
  const usedHour = (rows ?? [])
    .filter((r: { created_at: string }) => new Date(r.created_at).getTime() >= hourStart)
    .reduce((sum: number, r: { characters: number }) => sum + r.characters, 0);

  const expires = profile.subscription_expires_at as string | null;
  const subscriber = !!expires && new Date(expires).getTime() > now;
  const monthCap = subscriber ? MONTH_CAP_SUBSCRIBER : MONTH_CAP_TRIAL;

  if (used + text.length > monthCap) {
    const oldest = rows && rows.length ? new Date(rows[0].created_at).getTime() : now;
    return json({ error: 'Voice limit reached', code: 'VOICE_CAP', resetAt: new Date(oldest + MONTH_MS).toISOString(), subscriber }, 429);
  }
  if (usedHour + text.length > HOUR_CAP) {
    return json({ error: 'Voice limit reached', code: 'VOICE_BURST', resetAt: new Date(now + HOUR_MS).toISOString() }, 429);
  }

  // ── Speak ─────────────────────────────────────────────────────────────────
  const kind: CloudVoiceKind = profile.voice_kind === 'man' ? 'man' : 'woman';
  let upstream: Response;
  try {
    upstream = await synthesize(CLOUD_VOICES[kind].id, text, language, true);
  } catch (e) {
    console.error('speak: provider unreachable', String(e).slice(0, 200));
    return json({ error: 'Voice is resting', code: 'VOICE_UNAVAILABLE' }, 502);
  }
  if (!upstream.ok || !upstream.body) {
    // Log the provider's reason for us; tell the app only that voice is unavailable.
    console.error('speak: provider error', upstream.status, (await upstream.text()).slice(0, 300));
    return json({ error: 'Voice is resting', code: 'VOICE_UNAVAILABLE' }, 502);
  }

  // Count it before the audio leaves, so two quick requests cannot both slip under the cap.
  const { error: insertError } = await admin.from('voice_usage').insert({ user_id: user.id, characters: text.length });
  if (insertError) console.error('speak: usage insert failed', insertError.message);

  return new Response(upstream.body, {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
  });
});
