// Symponia — verify-receipt Edge Function
// Validates Apple receipts for subscriptions and consumable purchases.
// StoreKit 2 JWS receipts are cryptographically verified against the leaf cert
// public key extracted from the x5c header — no trust without verification.
//
// Deploy: supabase functions deploy verify-receipt
// Required secrets:
//   SUPABASE_SERVICE_ROLE_KEY
//   APPLE_SHARED_SECRET  ← App Store Connect → your app → In-App Purchases → App-Specific Shared Secret

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno';
import { verifyAppleJWS } from '../_shared/jws-verify.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json' };

function jsonRes(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// ── Catalogues ─────────────────────────────────────────────────────────────

const PRODUCT_TOKENS: Record<string, number> = {
  'com.symponia.tokens50':  50,
  'com.symponia.tokens150': 150,
  'com.symponia.tokens500': 500,
};

const SUBSCRIPTION_IDS = new Set(['com.symponia.premium.monthly']);
const SUBSCRIPTION_TOKENS_PER_PERIOD = 350;

const ALL_KNOWN_PRODUCT_IDS = new Set([
  'com.symponia.premium.monthly',
  'com.symponia.tokens50',
  'com.symponia.tokens150',
  'com.symponia.tokens500',
]);

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;

// ── StoreKit 2 JWS verifier ────────────────────────────────────────────────
// Cryptographically verifies signature then validates payload fields.
// Throws with a safe-to-log message on any failure.
async function verifyAndExtractJWSPayload(jws: string): Promise<{
  productId: string;
  expiresDateMs?: number;
  originalTransactionId?: string;
}> {
  const rawPayload = (await verifyAppleJWS(jws)) as Record<string, unknown>;

  const productId = rawPayload.productId as string | undefined;
  if (!productId || !ALL_KNOWN_PRODUCT_IDS.has(productId)) {
    throw new Error(`Unknown productId: ${String(productId)}`);
  }

  const originalTransactionId = (
    rawPayload.originalTransactionId ?? rawPayload.transactionId
  ) as string | undefined;

  const expiresDateMs = rawPayload.expiresDate as number | undefined;

  if (SUBSCRIPTION_IDS.has(productId)) {
    if (!originalTransactionId) {
      throw new Error('Subscription JWS missing originalTransactionId');
    }
    if (typeof expiresDateMs !== 'number' || expiresDateMs <= 0) {
      throw new Error('Subscription JWS missing or invalid expiresDate');
    }
    if (expiresDateMs < Date.now() - NINETY_DAYS_MS) {
      throw new Error(`Subscription expiresDate expired more than 90 days ago: ${expiresDateMs}`);
    }
    if (expiresDateMs > Date.now() + TEN_YEARS_MS) {
      throw new Error(`Subscription expiresDate absurdly far in future: ${expiresDateMs}`);
    }
  }

  return { productId, expiresDateMs, originalTransactionId };
}

// ── Apple legacy receipt verification (StoreKit 1) ─────────────────────────
async function verifyAppleReceipt(receiptData: string, sharedSecret: string) {
  const body = JSON.stringify({
    'receipt-data': receiptData,
    password: sharedSecret,
    'exclude-old-transactions': true,
  });

  for (const url of [
    'https://buy.itunes.apple.com/verifyReceipt',
    'https://sandbox.itunes.apple.com/verifyReceipt',
  ]) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const json = await res.json();

    if (json.status === 21007) continue; // sandbox receipt — retry with sandbox URL
    if (json.status !== 0) return { valid: false };

    const purchases: any[] = json.latest_receipt_info ?? json.receipt?.in_app ?? [];
    if (purchases.length === 0) return { valid: false };

    const latest = purchases.sort(
      (a, b) => Number(b.purchase_date_ms) - Number(a.purchase_date_ms),
    )[0];

    return {
      valid: true,
      productId: latest.product_id as string,
      expiresDateMs: latest.expires_date_ms ? Number(latest.expires_date_ms) : undefined,
      originalTransactionId: latest.original_transaction_id as string | undefined,
    };
  }

  return { valid: false };
}

// ── Handler ────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  try {
  // ── Authenticate caller ───────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonRes({ error: 'unauthorized' }, 401);
  }
  const jwt = authHeader.slice('Bearer '.length).trim();

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: { user }, error: authError } = await adminClient.auth.getUser(jwt);
  if (authError || !user) {
    return jsonRes({ error: 'unauthorized' }, 401);
  }
  const userId = user.id;

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { receipt: string; product_id: string; is_subscription?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonRes({ error: 'invalid_json' }, 400);
  }

  const { receipt, product_id, is_subscription } = body;
  if (!receipt || !product_id) {
    return jsonRes({ error: 'missing_fields' }, 400);
  }

  // ── Verify receipt ────────────────────────────────────────────────────────
  const isJWS = receipt.split('.').length === 3 && !receipt.includes('\n');
  let result: {
    valid: boolean;
    productId?: string;
    expiresDateMs?: number;
    originalTransactionId?: string;
  };
  let verificationPath: 'jws' | 'legacy';

  if (isJWS) {
    verificationPath = 'jws';
    try {
      const extracted = await verifyAndExtractJWSPayload(receipt);
      result = { valid: true, ...extracted };
      console.log(`[verify-receipt] JWS verified — product:${result.productId} user:${userId}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[verify-receipt] JWS verification failed:', msg);
      adminClient.from('apple_webhook_log').insert({
        notification_type: 'VERIFY_RECEIPT_FAILED',
        subtype: 'jws',
        original_transaction_id: null,
        payload: { user_id: userId, product_id, error: msg },
        error: msg,
      }).then(null, () => {});
      return jsonRes({ error: 'invalid_receipt' }, 400);
    }
  } else {
    verificationPath = 'legacy';
    const sharedSecret = Deno.env.get('APPLE_SHARED_SECRET')!;
    result = await verifyAppleReceipt(receipt, sharedSecret);
    console.log(`[verify-receipt] legacy path — valid:${result.valid}`);
  }

  if (!result.valid) {
    adminClient.from('apple_webhook_log').insert({
      notification_type: 'VERIFY_RECEIPT_FAILED',
      subtype: verificationPath,
      original_transaction_id: null,
      payload: { user_id: userId, product_id },
      error: 'invalid_receipt',
    }).then(null, () => {});
    return jsonRes({ error: 'invalid_receipt' }, 400);
  }

  const verifiedId = result.productId ?? product_id;

  // ── Subscription ──────────────────────────────────────────────────────────
  if (is_subscription || SUBSCRIPTION_IDS.has(verifiedId)) {
    if (!result.expiresDateMs) {
      return jsonRes({ error: 'invalid_receipt' }, 400);
    }

    const expiresAt = new Date(result.expiresDateMs).toISOString();
    const originalTxId: string | undefined = result.originalTransactionId ?? undefined;

    // Cross-user conflict: same originalTransactionId claimed by a different account
    if (originalTxId) {
      const { data: conflictRow } = await adminClient
        .from('profiles')
        .select('user_id')
        .eq('original_transaction_id', originalTxId)
        .maybeSingle();

      if (conflictRow && conflictRow.user_id !== userId) {
        console.error('[verify-receipt] transaction_conflict:', {
          existing_user: conflictRow.user_id,
          claiming_user: userId,
          txId: originalTxId,
        });
        adminClient.from('apple_webhook_log').insert({
          notification_type: 'VERIFY_RECEIPT_CONFLICT',
          subtype: null,
          original_transaction_id: originalTxId,
          payload: { claiming_user: userId, existing_user: conflictRow.user_id, product_id: verifiedId },
          error: 'transaction_conflict',
        }).then(null, () => {});
        return jsonRes({ error: 'transaction_conflict' }, 409);
      }
    }

    // Idempotency: only reset tokens when the billing period genuinely advances
    const { data: existingProfile } = await adminClient
      .from('profiles')
      .select('subscription_expires_at')
      .eq('user_id', userId)
      .maybeSingle();

    const existingExpiresAt: string | null = existingProfile?.subscription_expires_at ?? null;
    const isNewBillingPeriod = !existingExpiresAt || expiresAt > existingExpiresAt;

    const upsertPayload: Record<string, unknown> = {
      user_id: userId,
      ...(!existingExpiresAt || expiresAt >= existingExpiresAt ? { subscription_expires_at: expiresAt } : {}),
      ...(originalTxId ? { original_transaction_id: originalTxId } : {}),
    };

    if (isNewBillingPeriod) {
      upsertPayload.tokens = SUBSCRIPTION_TOKENS_PER_PERIOD;
      upsertPayload.tokens_reset_at = new Date().toISOString();
      console.log(`subscription new period — reset to ${SUBSCRIPTION_TOKENS_PER_PERIOD} tokens, expires ${expiresAt} → user ${userId}`);
    } else {
      console.log(`subscription replay — skipping token reset, expires ${expiresAt} → user ${userId}`);
    }

    const { error } = await adminClient
      .from('profiles')
      .upsert(upsertPayload, { onConflict: 'user_id' });

    if (error) {
      console.error('subscription upsert failed:', error);
      return jsonRes({ error: 'db_error' }, 500);
    }

    adminClient.from('apple_webhook_log').insert({
      notification_type: 'VERIFY_RECEIPT',
      subtype: isNewBillingPeriod ? 'new_period' : 'replay',
      original_transaction_id: originalTxId ?? null,
      payload: {
        user_id: userId,
        product_id: verifiedId,
        expires_at: expiresAt,
        verification_path: verificationPath,
      },
      error: null,
    }).then(null, () => {});

    return jsonRes({ type: 'subscription', expires_at: expiresAt }, 200);
  }

  // ── Consumable ────────────────────────────────────────────────────────────
  const tokensToAdd = PRODUCT_TOKENS[verifiedId] ?? 0;
  if (tokensToAdd === 0) {
    return jsonRes({ error: 'unknown_product' }, 400);
  }

  const { error } = await adminClient.rpc('add_tokens', {
    p_user_id: userId,
    p_tokens: tokensToAdd,
  });

  if (error) {
    console.error('add_tokens failed:', error);
    return jsonRes({ error: 'db_error' }, 500);
  }

  adminClient.from('apple_webhook_log').insert({
    notification_type: 'VERIFY_RECEIPT',
    subtype: 'consumable',
    original_transaction_id: result.originalTransactionId ?? null,
    payload: {
      user_id: userId,
      product_id: verifiedId,
      tokens_added: tokensToAdd,
      verification_path: verificationPath,
    },
    error: null,
  }).then(null, () => {});

  console.log(`+${tokensToAdd} tokens → user ${userId} (${verifiedId})`);
  return jsonRes({ type: 'consumable', tokens_added: tokensToAdd }, 200);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[verify-receipt] Unexpected error:', msg);
    return jsonRes({ error: 'internal_error' }, 500);
  }
});
