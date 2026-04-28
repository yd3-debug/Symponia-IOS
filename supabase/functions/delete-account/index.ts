// Symponia — Delete Account Edge Function
// Deploy: supabase functions deploy delete-account
//
// Security: JWT verified cryptographically via adminClient.auth.getUser.
// Requires { confirm: true } in request body.
// Rate-limited to 3 authenticated attempts per user per hour.
// Logs every attempt to account_deletion_log before deletion.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json' };

function jsonRes(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    // ── 1. Cryptographic JWT verification ──────────────────────────────────
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonRes({ error: 'unauthorized' }, 401);
    }
    const jwt = authHeader.slice('Bearer '.length).trim();
    if (!jwt) {
      return jsonRes({ error: 'unauthorized' }, 401);
    }

    const { data: { user }, error: authError } = await adminClient.auth.getUser(jwt);
    if (authError || !user) {
      return jsonRes({ error: 'unauthorized' }, 401);
    }
    const userId = user.id;
    const userEmail = user.email ?? null;

    // ── 2. Rate limit: max 3 authenticated attempts per user per hour ───────
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count, error: countError } = await adminClient
      .from('account_deletion_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('deleted_at', windowStart);

    if (countError) {
      console.error('[delete-account] Rate limit check failed:', countError);
      return jsonRes({ error: 'internal_error' }, 500);
    }
    if ((count ?? 0) >= RATE_LIMIT_MAX) {
      return jsonRes({ error: 'too_many_attempts' }, 429);
    }

    // ── 3. Explicit confirmation opt-in ────────────────────────────────────
    let body: { confirm?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      return jsonRes({ error: 'confirmation_required' }, 400);
    }
    if (body.confirm !== true) {
      return jsonRes({ error: 'confirmation_required' }, 400);
    }

    // ── 4. Idempotency — capture original_transaction_id before any deletes ─
    const { data: existingProfile } = await adminClient
      .from('profiles')
      .select('user_id, original_transaction_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!existingProfile) {
      return jsonRes({ status: 'already_deleted' }, 200);
    }
    const originalTxId: string | null = existingProfile.original_transaction_id ?? null;

    // ── 5. Audit log (written before deletion; user_id is not a FK so it
    //        persists after the user is gone for accountability purposes) ────
    const requestIp =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      req.headers.get('x-real-ip') ??
      null;

    const { error: logError } = await adminClient.from('account_deletion_log').insert({
      user_id: userId,
      email: userEmail,
      request_ip: requestIp,
      user_agent: req.headers.get('user-agent') ?? null,
      confirmation_received: true,
    });
    if (logError) {
      // Non-fatal: a log failure must not block GDPR right-to-erasure
      console.error('[delete-account] Audit log insert failed:', logError);
    }

    // ── 6. Revoke all sessions (invalidates refresh tokens) ────────────────
    // The access token stays cryptographically valid until its ~1h expiry, but
    // auth.getUser will reject it once auth.users is deleted, so oracle and all
    // protected endpoints will refuse it regardless.
    const { error: signOutError } = await adminClient.auth.admin.signOut(userId, 'global');
    if (signOutError) {
      console.warn('[delete-account] Session revocation failed (non-fatal):', signOutError.message);
    }

    // ── 7. Explicit cascade — delete all user-owned rows ───────────────────
    // Each step continues on error except profiles (which gates auth.users).
    // Explicit deletes cover tables that may lack FK cascade to auth.users.

    // (a) apple_webhook_log — no user_id column; keyed on original_transaction_id.
    //     Must run before profiles is deleted since we read originalTxId from it above.
    if (originalTxId) {
      const { error: webhookErr } = await adminClient
        .from('apple_webhook_log')
        .delete()
        .eq('original_transaction_id', originalTxId);
      if (webhookErr) {
        console.error('[delete-account] apple_webhook_log delete failed (continuing):', webhookErr);
      }
    }

    // (b) generation_jobs — table may not exist in all environments; wrapped entirely
    try {
      const { error: jobsErr } = await adminClient
        .from('generation_jobs')
        .delete()
        .eq('user_id', userId);
      if (jobsErr) {
        console.error('[delete-account] generation_jobs delete failed (continuing):', jobsErr);
      }
    } catch (jobsEx: unknown) {
      const msg = jobsEx instanceof Error ? jobsEx.message : String(jobsEx);
      console.warn('[delete-account] generation_jobs step threw (table may not exist):', msg);
    }

    // (c) api_usage
    const { error: usageErr } = await adminClient
      .from('api_usage')
      .delete()
      .eq('user_id', userId);
    if (usageErr) {
      console.error('[delete-account] api_usage delete failed (continuing):', usageErr);
    }

    // (d) rate_limit_daily_reflection
    const { error: rlErr } = await adminClient
      .from('rate_limit_daily_reflection')
      .delete()
      .eq('user_id', userId);
    if (rlErr) {
      console.error('[delete-account] rate_limit_daily_reflection delete failed (continuing):', rlErr);
    }

    // (e) conversations
    const { error: convErr } = await adminClient
      .from('conversations')
      .delete()
      .eq('user_id', userId);
    if (convErr) {
      console.error('[delete-account] conversations delete failed (continuing):', convErr);
    }

    // (f) profiles — hard stop: if this fails we must not delete auth.users,
    //     which would leave an authenticated identity with no data record.
    const { error: profileErr } = await adminClient
      .from('profiles')
      .delete()
      .eq('user_id', userId);
    if (profileErr) {
      console.error('[delete-account] profiles delete failed — aborting before auth.users:', profileErr);
      return jsonRes({ error: 'internal_error' }, 500);
    }

    // ── 8. Delete auth.users (must be last) ────────────────────────────────
    const { error: deleteAuthErr } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteAuthErr) {
      console.error('[delete-account] auth.admin.deleteUser failed:', JSON.stringify(deleteAuthErr));
      return jsonRes({ error: 'internal_error' }, 500);
    }

    console.log('[delete-account] User deleted successfully:', userId);
    return jsonRes({ success: true }, 200);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[delete-account] Unexpected error:', msg);
    return jsonRes({ error: 'internal_error' }, 500);
  }
});
