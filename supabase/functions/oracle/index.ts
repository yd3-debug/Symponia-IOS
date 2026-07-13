// Symponia — Oracle Edge Function
// Proxies streaming requests to Anthropic using the server-side API key.
// Requires a valid Supabase session; checks and deducts token_balance from the users table.
// Deploy: supabase functions deploy oracle

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno';
import { DAILY_REFLECTION_PROMPT, buildArchetypePrompt, buildSystemPromptParts } from './systemPrompt.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json' };

function jsonError(msg: string, code: string, status: number): Response {
  return new Response(JSON.stringify({ error: msg, code }), { status, headers: JSON_HEADERS });
}

// Translate legacy frequency IDs (stored in DB) to the three registers the
// DAILY_REFLECTION_PROMPT expects. No DB migration needed — normalization happens here.
const FREQ_NORMALIZE: Record<string, string> = {
  'Deeply Emotional': 'Felt',
  'Intellectual':     'Precise',
  'Quiet':            'Still',
};

// ── Fair use ────────────────────────────────────────────────────────────────
// Subscribers are not metered. These exist only to stop abuse, and are the ONE
// place a number lives — the app never shows a count of what's left.
//
// THE APP IS UNLIMITED. This is an anti-abuse floor, not a product limit, and it
// is set where no human being reflecting in good faith will ever find it.
//
// Sizing it required getting the cost right first. A real conversation costs
// ~$0.0118/message, NOT the $0.022 an earlier estimate assumed — that figure
// priced every message as if it carried a full 10k-token history and a maxed
// 750-token reply, i.e. it charged the last message of a maxed-out conversation
// as if it were all of them. With caching working, early turns are nearly free.
//
// True break-even at £19.99 is ~305 messages/week — 44 every single day, forever.
//
// Against real behaviour (1 reflection = 1 message; people who open up have a
// conversation, 10-20 in a sitting is normal):
//
//   regular    (3 sessions/wk × 12)  =  36/week
//   engaged    (5 sessions/wk × 15)  =  75/week
//   heavy      (every day × 15)      = 105/week
//   very heavy (every day × 20)      = 140/week
//
// 250/week is 36 messages a day, every day, indefinitely. Nobody in that list is
// within sight of it. It exists so that a leaked account cannot run a bot on our
// API key — which, unbounded, is exactly how Copilot ended up paying ~$30/user
// of compute on a $10 subscription.
//
// Weekly, not daily, on purpose: a daily cap punishes the person having one hard
// day, who is precisely who this app exists for.
const FAIR_USE_WEEK_MAX = 250;
const FAIR_USE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Burst: anti-script, not anti-human. 60 in five hours is far past any real
// sitting — a 40-message marathon still passes clean. Earlier drafts used 15,
// which would have cut a normal user off mid-conversation.
const FAIR_USE_BURST_MAX = 60;
const FAIR_USE_BURST_MS = 5 * 60 * 60 * 1000;

// ── Localisation limiter ────────────────────────────────────────────────────
// Two modes ('opening' and 'archetype-prose') exist only to say the app's OWN
// copy in the user's language. Neither deducts a token, so both need a floor.
// They share one table (rate_limit_opening) and therefore must share one
// budget — if they didn't, the archetype calls would silently eat the opening
// allowance and a German user's greeting would quietly fall back to English.
//
// Sizing, for the heaviest honest user: 1 opening + 7 archetype readings (one
// per animal) = 8. Switching language, or reshaping their animals, buys another
// 8. 40 in a rolling 30 days covers that several times over, and every result is
// cached on-device forever, so a settled user makes zero calls from then on.
//
// Abuse ceiling: 40 calls, worst case all on the Sonnet opening path (~3.7c),
// is ~$1.48/month for someone holding a real authenticated session. The
// archetype path is Haiku and rounds to nothing.
const LOCALIZE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const LOCALIZE_WINDOW_MAX = 40;

Deno.serve(async (req: Request) => {
  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS });
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response('Unauthorized: Missing Authorization header', { status: 400, headers: CORS });
  }

  // Create a user-scoped client
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_ANON_KEY') || '',
    { global: { headers: { Authorization: authHeader } } },
  );

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return new Response(`Unauthorized: Auth failed - Session expired or invalid`, { status: 400, headers: CORS });
  }

  // ── Parse request body (before branching on mode) ─────────────────────────
  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON', 'BAD_REQUEST', 400);
  }

  // A3/B5: enforce model allowlist, cap max_tokens, limit message volume
  const ALLOWED_MODELS = new Set(['claude-sonnet-4-6', 'claude-haiku-4-5-20251001']);
  body.model = (typeof body.model === 'string' && ALLOWED_MODELS.has(body.model))
    ? body.model
    : 'claude-sonnet-4-6';
  body.max_tokens = Math.min(typeof body.max_tokens === 'number' ? body.max_tokens : 500, 750);

  if (Array.isArray(body.messages) && body.messages.length > 25) {
    return jsonError('Too many messages', 'TOO_MANY_MESSAGES', 400);
  }
  const totalContentLen = Array.isArray(body.messages)
    ? body.messages.reduce((s: number, m: any) => s + String(m.content ?? '').length, 0)
    : 0;
  if (totalContentLen > 50000) {
    return jsonError('Content too large', 'CONTENT_TOO_LARGE', 400);
  }


  // ── Language ──────────────────────────────────────────────────────────────
  // The language the user picked in onboarding. The reply must come back in it,
  // even though injected memories/context may be in another language.
  const LANG_NAMES: Record<string, string> = {
    en: 'English', es: 'Spanish', pt: 'Brazilian Portuguese', fr: 'French',
    de: 'German', it: 'Italian', ru: 'Russian', da: 'Danish', sv: 'Swedish', no: 'Norwegian',
  };
  const langCode: string = typeof body.language === 'string' ? body.language : 'en';
  const langName: string = LANG_NAMES[langCode] ?? 'English';
  const LANGUAGE_RULE = langCode === 'en'
    ? ''
    : `\n\n\u2550\u2550\u2550 LANGUAGE \u2550\u2550\u2550\nWrite your entire response in ${langName}, and only in ${langName}. This holds no matter what language the context, memories, or earlier messages are written in. Never mix languages. Keep exactly the same depth, nuance and register you would have in English.`;

  // ── Admin client (service role) — used by both paths ─────────────────────
  const admin = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  );

  // ── Consent gate ───────────────────────────────────────────────────────────
  // Structural enforcement: any user whose profiles.ai_consent is not strictly
  // true is refused — this fires before every mode, including daily-reflection.
  const { data: consentProfile, error: consentErr } = await admin
    .from('profiles')
    .select('ai_consent')
    .eq('user_id', user.id)
    .maybeSingle();

  if (consentErr || !consentProfile || consentProfile.ai_consent !== true) {
    return jsonError('consent required', 'consent_required', 403);
  }

  // ── Daily-reflection fast path ────────────────────────────────────────────
  // Token deduction bypassed for this mode. Authentication still required (above).
  if (body.mode === 'daily-reflection') {

    // Rate limit: max 10 calls per user per 24-hour rolling window
    const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await admin
      .from('rate_limit_daily_reflection')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', windowStart);

    if (countError) {
      console.error('Rate limit check failed:', countError);
      return jsonError('Rate limit check failed', 'INTERNAL_ERROR', 500);
    }

    if ((count ?? 0) >= 10) {
      const { data: oldest } = await admin
        .from('rate_limit_daily_reflection')
        .select('created_at')
        .eq('user_id', user.id)
        .gte('created_at', windowStart)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      const retryAfter = oldest
        ? Math.ceil((new Date(oldest.created_at).getTime() + 24 * 60 * 60 * 1000 - Date.now()) / 1000)
        : 86400;

      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded', code: 'RATE_LIMITED', retryAfter }),
        { status: 429, headers: JSON_HEADERS },
      );
    }

    // Validate required fields
    const context = body.context ?? {};
    const targetDate: string = body.targetDate ?? '';
    if (!targetDate) {
      return jsonError('Missing targetDate', 'BAD_REQUEST', 400);
    }

    // Normalize legacy frequency IDs to the three registers the prompt expects.
    const rawFreq: string = context.frequency ?? 'Precise';
    const frequency = FREQ_NORMALIZE[rawFreq] ?? rawFreq;

    // T12:00:00Z anchors the parse to noon UTC so the weekday is stable
    // regardless of which timezone the edge function happens to run in.
    const dayOfWeek = new Date(`${targetDate}T12:00:00Z`).toLocaleDateString('en-US', {
      weekday: 'long', timeZone: 'UTC',
    });

    const userMessage =
      `User name: ${context.name ?? 'unknown'}\n` +
      `Seven animals (in order): ${(context.animals ?? []).join(', ')}\n` +
      `Resonance frequency: ${frequency}\n` +
      `Target date: ${targetDate}\n` +
      `Day of week (for internal variation only — NEVER reference directly): ${dayOfWeek}`;

    const reflectionBody = {
      model: body.model ?? 'claude-sonnet-4-6',
      max_tokens: 300,
      system: DAILY_REFLECTION_PROMPT + LANGUAGE_RULE,
      messages: [{ role: 'user', content: userMessage }],
    };

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(reflectionBody),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      console.error('Anthropic error for daily-reflection:', err);
      return jsonError('Upstream API error', 'ANTHROPIC_ERROR', 500);
    }

    const json = await anthropicRes.json();
    const reflection = (json.content?.[0]?.text ?? '').trim();

    if (!reflection) {
      return jsonError('Empty response from AI', 'EMPTY_RESPONSE', 500);
    }

    // Record call for rate limiting (fire-and-forget).
    // Rows older than 48 hours can be purged by a scheduled cron.
    admin
      .from('rate_limit_daily_reflection')
      .insert({ user_id: user.id })
      .then(({ error }: { error: any }) => {
        if (error) console.error('Rate limit insert failed:', error);
      });

    // Log usage asynchronously
    (async () => {
      try {
        const usage = json?.usage;
        if (usage) {
          await admin.from('api_usage').insert({
            user_id: user.id,
            model: json.model ?? reflectionBody.model,
            input_tokens: usage.input_tokens ?? 0,
            output_tokens: usage.output_tokens ?? 0,
            cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
            cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
          });
        }
      } catch (e) {
        console.error('Usage log failed:', e);
      }
    })();

    return new Response(JSON.stringify({ reflection }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  }

  // ── Usage fast path ───────────────────────────────────────────────────────
  // Powers the Usage view in Settings. Read-only, no AI call, no cost.
  // Deliberately returns a WINDOW and a RESET TIME, not "tokens remaining" —
  // the app should never present someone's inner life as a depleting balance.
  if (body.mode === 'usage') {
    const { data: p } = await admin
      .from('profiles')
      .select('subscription_expires_at, tokens, topup_tokens, subscription_tokens')
      .eq('user_id', user.id)
      .maybeSingle();

    const exp: string | null = p?.subscription_expires_at ?? null;
    const subscribed = !!exp && new Date(exp) > new Date();

    if (!subscribed) {
      const left = (p?.tokens ?? 0) + (p?.topup_tokens ?? 0) + (p?.subscription_tokens ?? 0);
      return new Response(
        JSON.stringify({ subscribed: false, trialLeft: Math.max(0, left) }),
        { status: 200, headers: JSON_HEADERS },
      );
    }

    const since = new Date(Date.now() - FAIR_USE_WEEK_MS).toISOString();
    const { count } = await admin
      .from('rate_limit_reflections')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', since);

    // Reset = when the OLDEST reflection in the window ages out.
    const { data: oldest } = await admin
      .from('rate_limit_reflections')
      .select('created_at')
      .eq('user_id', user.id)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    return new Response(
      JSON.stringify({
        subscribed: true,
        used: count ?? 0,
        limit: FAIR_USE_WEEK_MAX,
        resetAt: oldest
          ? new Date(new Date(oldest.created_at).getTime() + FAIR_USE_WEEK_MS).toISOString()
          : null,
        renewsAt: exp,
      }),
      { status: 200, headers: JSON_HEADERS },
    );
  }

  // ── Opening fast path ─────────────────────────────────────────────────────
  // The first thing Symponia says in a session is built on the client
  // (buildAnimalGreeting) and pushed straight into the message list, where it
  // renders with <Text raw> — so the i18n dictionaries can never reach it. For
  // English that is exactly right. For the other eight languages it meant the
  // app opened in English and only switched once the user replied.
  //
  // So: the client sends the English reading it just composed, and Claude writes
  // the SAME reading in the user's language — composed, not translated, with the
  // card structure preserved verbatim. No token is deducted (this is not a
  // reflection, it is the app speaking its own copy), and the client caches the
  // result, so this normally fires once per animal set per language.
  if (body.mode === 'opening') {
    const source: string = typeof body.source === 'string' ? body.source : '';
    if (!source || source.length > 8000) {
      return jsonError('Missing or oversized source', 'BAD_REQUEST', 400);
    }
    // English never needs this — the client has the deterministic string already.
    if (langCode === 'en') {
      return new Response(JSON.stringify({ opening: source }), {
        status: 200, headers: JSON_HEADERS,
      });
    }

    // Rate limit: the shared localisation budget (see LOCALIZE_WINDOW_MAX) — a
    // rolling 30 DAYS, not per day.
    //
    // This path deducts no token, and at ~3.7c a call a 20/day limit exposed
    // ~$22/user/month of free inference to anyone holding a session. A real user
    // hits this once or twice ever: the result is cached on-device per language +
    // animal set, so it only regenerates if they switch language or redo their
    // animals.
    const openWindow = new Date(Date.now() - LOCALIZE_WINDOW_MS).toISOString();
    const { count: openCount, error: openCountErr } = await admin
      .from('rate_limit_opening')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', openWindow);

    if (openCountErr) {
      console.error('Opening rate limit check failed:', openCountErr);
      return jsonError('Rate limit check failed', 'INTERNAL_ERROR', 500);
    }
    if ((openCount ?? 0) >= LOCALIZE_WINDOW_MAX) {
      return jsonError('Rate limit exceeded', 'RATE_LIMITED', 429);
    }

    const openingBody = {
      model: 'claude-sonnet-4-6',
      max_tokens: 3000, // the 7-card archetype reading is long; the global 750 cap does not apply here
      system:
        `You are Symponia. Below is an opening reading you have just composed, written in English.\n\n` +
        `Write that same reading in ${langName}.\n\n` +
        `This is NOT a word-for-word translation. Write it as a native ${langName} speaker would ` +
        `write it — natural rhythm, natural register, the same quiet, unhurried, non-clinical voice.\n\n` +
        `Preserve the structure EXACTLY: the same line breaks, the same blank lines, the same numbering, ` +
        `the same separator characters (·, —, ✦, etc.), the same order of cards and sections. ` +
        `Do not add, remove, merge or reorder anything. Do not add a preamble, a title or a closing remark.\n\n` +
        `Animal names are proper nouns: render them in ${langName} (a Wolf is ein Wolf, un loup, волк). ` +
        `Keep them in the same case as the English (UPPERCASE stays uppercase).\n\n` +
        `Output the reading and nothing else.`,
      messages: [{ role: 'user', content: source }],
    };

    const openRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(openingBody),
    });

    if (!openRes.ok) {
      console.error('Anthropic error for opening:', await openRes.text());
      return jsonError('Upstream API error', 'ANTHROPIC_ERROR', 500);
    }

    const openJson = await openRes.json();
    const opening = (openJson.content?.[0]?.text ?? '').trim();
    if (!opening) {
      return jsonError('Empty response from AI', 'EMPTY_RESPONSE', 500);
    }

    admin
      .from('rate_limit_opening')
      .insert({ user_id: user.id })
      .then(({ error }: { error: any }) => {
        if (error) console.error('Opening rate limit insert failed:', error);
      });

    (async () => {
      try {
        const usage = openJson?.usage;
        if (usage) {
          await admin.from('api_usage').insert({
            user_id: user.id,
            model: openJson.model ?? openingBody.model,
            input_tokens: usage.input_tokens ?? 0,
            output_tokens: usage.output_tokens ?? 0,
            cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
            cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
          });
        }
      } catch (e) {
        console.error('Usage log failed:', e);
      }
    })();

    return new Response(JSON.stringify({ opening }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  }

  // ── Archetype prose fast path ─────────────────────────────────────────────
  // ANIMAL_ARCHETYPES — the gift / shadow / path reading for each of the ~39
  // animals — is English literary data, not UI copy. It is deliberately NOT in
  // the i18n dictionaries: 117 aphorisms × 8 languages is not something you
  // hand-translate, and a word-for-word machine translation would flatten
  // exactly the compression that makes them land.
  //
  // So the client sends the English reading it already holds, and Claude COMPOSES
  // the same three readings natively in the user's language. Cheap model (this is
  // three short lines of structured text), no token deducted, and the client
  // caches per language + animal — so this fires once per animal, ever.
  //
  // FAIL-SAFE BY CONSTRUCTION: every path that isn't a clean, parsed, non-empty
  // result returns the ENGLISH originals with a 200. The client must never see an
  // error here, because the fallback is not "broken" — it is today's behaviour.
  if (body.mode === 'archetype-prose') {
    const clamp = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 1000) : '');
    const animal = clamp(body.animal).slice(0, 60);
    const gift = clamp(body.gift);
    const shadow = clamp(body.shadow);
    const path = clamp(body.path);

    // Nothing to compose from — this is a malformed client, not a language issue.
    if (!animal || !gift || !shadow || !path) {
      return jsonError('Missing archetype fields', 'BAD_REQUEST', 400);
    }

    // The English source IS the answer for English. No model call, no row.
    const english = { gift, shadow, path };
    if (langCode === 'en') {
      return new Response(JSON.stringify(english), { status: 200, headers: JSON_HEADERS });
    }

    const { count: arcCount, error: arcCountErr } = await admin
      .from('rate_limit_opening')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', new Date(Date.now() - LOCALIZE_WINDOW_MS).toISOString());

    // Over budget, or the limiter itself is unhappy: fall back to English. This
    // is copy, not a reflection — degrading quietly beats failing loudly.
    if (arcCountErr || (arcCount ?? 0) >= LOCALIZE_WINDOW_MAX) {
      if (arcCountErr) console.error('Archetype rate limit check failed:', arcCountErr);
      return new Response(JSON.stringify(english), { status: 200, headers: JSON_HEADERS });
    }

    const arcBody = {
      // Haiku on purpose. Three short aphorisms — Sonnet buys nothing here and
      // this is the same model the long-press archetype path already uses.
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      system:
        `You are Symponia. Below are three Jungian archetype readings for the ${animal} — ` +
        `its GIFT (what the archetype gives), its SHADOW (how it distorts under pressure), ` +
        `and its PATH (the work that integrates it) — written in English.\n\n` +
        `Write those same three readings in ${langName}.\n\n` +
        `This is NOT a word-for-word translation. Compose them as a native ${langName} writer ` +
        `would: same meaning, same compressed aphoristic register, roughly the same length, ` +
        `the same quiet and unclinical voice. Keep the internal punctuation rhythm (semicolons, ` +
        `em dashes) where the language allows it. Render the animal's name in ${langName} if you ` +
        `need to name it. Do not soften, explain, expand or add a moral.\n\n` +
        `Return STRICT JSON and nothing else — no preamble, no code fence, no commentary:\n` +
        `{"gift": "...", "shadow": "...", "path": "..."}`,
      messages: [{
        role: 'user',
        content: JSON.stringify({ animal, gift, shadow, path }),
      }],
    };

    let arcJson: any;
    try {
      const arcRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(arcBody),
      });
      if (!arcRes.ok) {
        console.error('Anthropic error for archetype-prose:', await arcRes.text());
        return new Response(JSON.stringify(english), { status: 200, headers: JSON_HEADERS });
      }
      arcJson = await arcRes.json();
    } catch (e) {
      console.error('Archetype-prose upstream failed:', e);
      return new Response(JSON.stringify(english), { status: 200, headers: JSON_HEADERS });
    }

    // Defensive parse. A model that fences its JSON, or prefaces it, or returns
    // prose, must cost us nothing but a fallback to English.
    let out: { gift: string; shadow: string; path: string } | null = null;
    try {
      const raw: string = (arcJson?.content?.[0]?.text ?? '').trim();
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start !== -1 && end > start) {
        const parsed = JSON.parse(raw.slice(start, end + 1));
        const g = typeof parsed?.gift === 'string' ? parsed.gift.trim() : '';
        const s = typeof parsed?.shadow === 'string' ? parsed.shadow.trim() : '';
        const p = typeof parsed?.path === 'string' ? parsed.path.trim() : '';
        if (g && s && p) out = { gift: g, shadow: s, path: p };
      }
    } catch (e) {
      console.error('Archetype-prose parse failed:', e);
    }

    if (!out) {
      return new Response(JSON.stringify(english), { status: 200, headers: JSON_HEADERS });
    }

    // Only a call that actually produced usable prose is charged to the budget.
    admin
      .from('rate_limit_opening')
      .insert({ user_id: user.id })
      .then(({ error }: { error: any }) => {
        if (error) console.error('Archetype rate limit insert failed:', error);
      });

    (async () => {
      try {
        const usage = arcJson?.usage;
        if (usage) {
          await admin.from('api_usage').insert({
            user_id: user.id,
            model: arcJson.model ?? arcBody.model,
            input_tokens: usage.input_tokens ?? 0,
            output_tokens: usage.output_tokens ?? 0,
            cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
            cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
          });
        }
      } catch (e) {
        console.error('Usage log failed:', e);
      }
    })();

    return new Response(JSON.stringify(out), { status: 200, headers: JSON_HEADERS });
  }

  // ── Profile ───────────────────────────────────────────────────────────────
  const { data: profileData, error: profileError } = await admin
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileError) console.error('Profile fetch error:', profileError);

  // Safe defaults if the row is missing — never block a user over a missing row.
  const profile = profileData ?? { tokens: 0, frequency: 'Intellectual', name: null, gender: null, animals: null, subscription_expires_at: null, subscription_tokens: 0, topup_tokens: 0 };

  // ── Access check ──────────────────────────────────────────────────────────
  //
  // Subscriptions are ACCESS UNTIL A DATE, not a bucket of tokens. There is no
  // quota to grant, sync across three files, or run out of mid-month. A
  // subscriber reflects as much as they need; fair use only exists to stop abuse,
  // and is set high enough that a person in a hard week never meets it.
  //
  // Free users keep a lifetime trial balance (profiles.tokens). That is the only
  // place a counter still exists.
  const expiresAt: string | null = profile.subscription_expires_at ?? null;
  const isSubscriber = !!expiresAt && new Date(expiresAt) > new Date();

  if (!isSubscriber) {
    // Trial: legacy columns are honoured so nobody loses what they paid for.
    const trialLeft = (profile.tokens ?? 0) + (profile.subscription_tokens ?? 0) + (profile.topup_tokens ?? 0);
    if (trialLeft <= 0) {
      return jsonError('Trial finished', 'TRIAL_EXHAUSTED', 402);
    }
  } else {
    // ── Fair use ────────────────────────────────────────────────────────────
    // Modelled on Claude's own limits: a long window that constrains
    // *consistently* intensive use, plus a short burst window that stops a
    // script. Deliberately NOT a daily cap — a daily cap punishes the person
    // having one hard day, who is exactly who this app is for. The weekly
    // window lets them have that day and only bites sustained abuse.
    const { count: weekCount, error: weekErr } = await admin
      .from('rate_limit_reflections')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', new Date(Date.now() - FAIR_USE_WEEK_MS).toISOString());

    if (weekErr) {
      // Fail OPEN. A limiter outage must never lock a paying subscriber out of
      // the thing they are paying for.
      console.error('Fair-use week check failed (allowing):', weekErr);
    } else if ((weekCount ?? 0) >= FAIR_USE_WEEK_MAX) {
      const { data: oldest } = await admin
        .from('rate_limit_reflections')
        .select('created_at')
        .eq('user_id', user.id)
        .gte('created_at', new Date(Date.now() - FAIR_USE_WEEK_MS).toISOString())
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      const resetAt = oldest
        ? new Date(new Date(oldest.created_at).getTime() + FAIR_USE_WEEK_MS).toISOString()
        : new Date(Date.now() + FAIR_USE_WEEK_MS).toISOString();
      return new Response(
        JSON.stringify({ error: 'Fair use reached', code: 'FAIR_USE_WEEK', resetAt }),
        { status: 429, headers: JSON_HEADERS },
      );
    }

    const { count: burstCount, error: burstErr } = await admin
      .from('rate_limit_reflections')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', new Date(Date.now() - FAIR_USE_BURST_MS).toISOString());

    if (burstErr) {
      console.error('Fair-use burst check failed (allowing):', burstErr);
    } else if ((burstCount ?? 0) >= FAIR_USE_BURST_MAX) {
      const { data: oldest } = await admin
        .from('rate_limit_reflections')
        .select('created_at')
        .eq('user_id', user.id)
        .gte('created_at', new Date(Date.now() - FAIR_USE_BURST_MS).toISOString())
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      const resetAt = oldest
        ? new Date(new Date(oldest.created_at).getTime() + FAIR_USE_BURST_MS).toISOString()
        : new Date(Date.now() + FAIR_USE_BURST_MS).toISOString();
      return new Response(
        JSON.stringify({ error: 'Slow down', code: 'FAIR_USE_BURST', resetAt }),
        { status: 429, headers: JSON_HEADERS },
      );
    }
  }

  // ── Server-Side Prompt Construction ───────────────────────────────────────

  // Handle special 'archetype' mode override.
  // Long-press is a ~100-word definitional lookup, not the reflective voice, so
  // it runs on Haiku: 3x cheaper, and none of the depth that Sonnet is here for
  // is at stake. Chat and the daily reflection stay on Sonnet deliberately.
  if (body.mode === 'archetype' && body.word) {
    body.messages = [{ role: 'user', content: buildArchetypePrompt(body.word) }];
    body.model = 'claude-haiku-4-5-20251001';
  }

  // Handle special 'synthesis' mode override for the 7 animal structured view
  // sessionAnimals (from exploration chat) takes priority over saved profile animals
  const synthesisAnimals = body.sessionAnimals ?? profile.animals;
  delete body.sessionAnimals; // strip before sending to Anthropic

  // ── Build system prompt (static block cached, dynamic block per-user) ────
  // Synthesis mode uses a bespoke one-shot system prompt — no caching benefit.
  const isSynthesisWithAnimals = body.mode === 'synthesis' && synthesisAnimals && synthesisAnimals.length > 0;

  if (isSynthesisWithAnimals) {
    const POSITION_LABELS = ['Primary', '2nd Force', '3rd Force', 'Bridge', 'Bridge', 'Threshold', 'The Shadow'];
    const animalList = synthesisAnimals.map((a: string, i: number) => `${POSITION_LABELS[i] ?? String(i + 1)}: ${a}`).join('; ');
    body.system = `You are a soul oracle who reads character through animal archetypes. You have been given seven animals that belong to one person: ${animalList}. Write a 3–5 sentence non-judgmental character synthesis that describes the dominant energy of this person, the interplay between their primary animal and their shadow animal, and the essential quality this whole constellation reveals about who they are. Write in second person. Pure flowing prose. No markdown, no lists, no line breaks between sentences. No spiritual clichés. Do not name the animals explicitly — speak to the qualities they embody.` + LANGUAGE_RULE;
    body.messages = [{ role: 'user', content: 'Show me the synthesis.' }];
  } else {
    // For all other modes, split into a cacheable static block + a per-user dynamic block.
    const freq = body.resonanceFrequency || profile.frequency || 'Intellectual';
    const mode = body.mode === 'synthesis' ? 'oracle' : body.mode;
    const animals = body.mode === 'synthesis' ? undefined : profile.animals;

    // profile.attune — the nine intake answers. Passed into the DYNAMIC block so
    // it never pollutes the cached static prefix, and so the first reply already
    // knows who it is speaking to.
    const { staticText, dynamicText } = buildSystemPromptParts(freq, mode, profile.name, profile.gender, animals, profile.attune ?? undefined);

    // ── Prompt caching ───────────────────────────────────────────────────────
    // Before: only the static system block was cached, and the conversation
    // history (up to 20 messages, ~10k tokens) was re-sent at FULL input price
    // ($3.00/MTok) on every single turn. That was ~67% of the cost of a long
    // reflection and made the plans lose money on heavy users.
    //
    // Now: `cache_control` at the top level enables automatic caching, which
    // moves the breakpoint forward as the conversation grows — so system +
    // history are re-read at $0.30/MTok instead. Same data sent, same output,
    // one tenth the price on the repeated prefix.
    //
    // TTL is 1h, not the 5m default, for two reasons:
    //   1. Symponia is contemplative. People sit with a reflection for minutes
    //      before replying. A 5m cache would routinely expire between turns, and
    //      a miss costs 1.25x base — i.e. it would end up MORE expensive.
    //   2. Mixing TTLs is constrained: a longer-TTL entry must come BEFORE any
    //      shorter one. The system block precedes the messages, so if the system
    //      block stayed at 5m and the messages were 1h, the API returns 400 —
    //      every chat request would fail. Both must be 1h.
    body.system = [
      { type: 'text', text: staticText, cache_control: { type: 'ephemeral', ttl: '1h' } },
      { type: 'text', text: dynamicText + LANGUAGE_RULE },
    ];
    body.cache_control = { type: 'ephemeral', ttl: '1h' };

    if (body.mode === 'synthesis') {
      body.messages = [{ role: 'user', content: 'Show me the synthesis.' }];
    }
  }

  // Strip custom fields before sending to Anthropic
  delete body.mode;
  delete body.language;
  delete body.word;
  delete body.resonanceFrequency;

  // ── Call Anthropic ────────────────────────────────────────────────────────
  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text();
    return new Response(err, { status: anthropicRes.status, headers: CORS });
  }

  // ── Record the reflection (fire-and-forget) ──────────────────────────────
  // Subscribers: a row in the rolling window. Nothing is "spent".
  // Trial users: still decrement the lifetime balance — that IS a finite trial,
  // and it's the only counter left in the product.
  if (isSubscriber) {
    admin
      .from('rate_limit_reflections')
      .insert({ user_id: user.id })
      .then(({ error }: { error: any }) => {
        if (error) console.error('Fair-use record failed:', error);
      });
  } else {
    // Drain the legacy columns in the same order they were granted, so nobody
    // loses a top-up they paid for before the token system was retired.
    const t = profile.tokens ?? 0;
    const s = profile.subscription_tokens ?? 0;
    const u = profile.topup_tokens ?? 0;
    const deduct = s > 0 ? { subscription_tokens: s - 1 }
                 : u > 0 ? { topup_tokens: u - 1 }
                 : { tokens: Math.max(0, t - 1) };

    admin
      .from('profiles')
      .update(deduct)
      .eq('user_id', user.id)
      .then(({ error }: { error: any }) => {
        if (error) console.error('Trial deduct failed:', error);
      });
  }

  // ── Buffer response, log usage, return ────────────────────────────────────
  // All client calls currently use stream:false, so Anthropic returns a single
  // JSON body.  We buffer it to extract the usage object before forwarding.
  const responseText = await anthropicRes.text();

  // Log usage asynchronously — never block the client response on this.
  (async () => {
    try {
      const parsed = JSON.parse(responseText);
      const usage = parsed?.usage;
      if (usage) {
        await admin.from('api_usage').insert({
          user_id: user.id,
          model: parsed.model ?? body.model,
          input_tokens: usage.input_tokens ?? 0,
          output_tokens: usage.output_tokens ?? 0,
          cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
          cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
        });
      }
    } catch (e) {
      console.error('Usage log failed:', e);
    }
  })();

  return new Response(responseText, {
    status: 200,
    headers: {
      ...CORS,
      'Content-Type': 'application/json',
    },
  });
});
