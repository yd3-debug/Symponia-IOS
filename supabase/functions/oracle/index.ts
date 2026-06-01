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
      system: DAILY_REFLECTION_PROMPT,
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

  // ── Token & Profile check (all non-daily-reflection modes) ───────────────
  // Use service role to read/write profiles without RLS getting in the way
  const { data: profileData, error: profileError } = await admin
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileError) console.error('Profile fetch error:', profileError);

  // Use safe defaults if profile is missing — never block a user over a missing row
  const profile = profileData ?? { tokens: 3, frequency: 'Intellectual', name: null, gender: null, animals: null, subscription_expires_at: null, subscription_tokens: 0, topup_tokens: 0 };

  const subTokens   = profile.subscription_tokens ?? 0;
  const topupTokens = profile.topup_tokens ?? 0;

  if (subTokens <= 0 && topupTokens <= 0) {
    return new Response('Insufficient tokens', { status: 402, headers: CORS });
  }

  // ── Server-Side Prompt Construction ───────────────────────────────────────

  // Handle special 'archetype' mode override
  if (body.mode === 'archetype' && body.word) {
    body.messages = [{ role: 'user', content: buildArchetypePrompt(body.word) }];
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
    body.system = `You are a soul oracle who reads character through animal archetypes. You have been given seven animals that belong to one person: ${animalList}. Write a 3–5 sentence non-judgmental character synthesis that describes the dominant energy of this person, the interplay between their primary animal and their shadow animal, and the essential quality this whole constellation reveals about who they are. Write in second person. Pure flowing prose. No markdown, no lists, no line breaks between sentences. No spiritual clichés. Do not name the animals explicitly — speak to the qualities they embody.`;
    body.messages = [{ role: 'user', content: 'Show me the synthesis.' }];
  } else {
    // For all other modes, split into a cacheable static block + a per-user dynamic block.
    const freq = body.resonanceFrequency || profile.frequency || 'Intellectual';
    const mode = body.mode === 'synthesis' ? 'oracle' : body.mode;
    const animals = body.mode === 'synthesis' ? undefined : profile.animals;

    const { staticText, dynamicText } = buildSystemPromptParts(freq, mode, profile.name, profile.gender, animals);

    // Two-block system: static block is cached on the Anthropic side, dynamic is not.
    body.system = [
      { type: 'text', text: staticText, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: dynamicText },
    ];

    if (body.mode === 'synthesis') {
      body.messages = [{ role: 'user', content: 'Show me the synthesis.' }];
    }
  }

  // Strip custom fields before sending to Anthropic
  delete body.mode;
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

  // ── Deduct token (fire-and-forget, don't block response) ──────────────────
  // Deduct from subscription_tokens first; fall back to topup_tokens.
  const deductUpdate = subTokens > 0
    ? { subscription_tokens: subTokens - 1 }
    : { topup_tokens: topupTokens - 1 };

  admin
    .from('profiles')
    .update(deductUpdate)
    .eq('user_id', user.id)
    .then(({ error }: { error: any }) => {
      if (error) console.error('Token deduct failed:', error);
    });

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
