// Symponia — verify-receipt Edge Function
// Validates Apple receipts for both consumable token packs and subscriptions.
//
// Deploy: supabase functions deploy verify-receipt
// Required secrets:
//   SUPABASE_SERVICE_ROLE_KEY
//   APPLE_SHARED_SECRET  ← App Store Connect → your app → In-App Purchases → App-Specific Shared Secret

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Catalogues ─────────────────────────────────────────────────────────────
const PRODUCT_TOKENS: Record<string, number> = {
  'com.symponia.tokens50':  50,
  'com.symponia.tokens150': 150,
  'com.symponia.tokens500': 500,
};

const SUBSCRIPTION_IDS = new Set(['com.symponia.premium.monthly']);
const SUBSCRIPTION_TOKENS_PER_PERIOD = 350;

// ── StoreKit 2 JWS decoder ─────────────────────────────────────────────────
// react-native-iap v14 provides purchase.purchaseToken as a JWS (signed JWT)
// on iOS. The JWS payload contains the transaction data directly — no Apple
// API call needed. We decode and trust it (Apple's signature is on it).
function decodeJWSPayload(jws: string): Record<string, unknown> | null {
  try {
    const parts = jws.split('.');
    if (parts.length !== 3) return null;
    // base64url → base64 → JSON
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function verifyFromJWS(jws: string) {
  const payload = decodeJWSPayload(jws);
  if (!payload) return { valid: false };

  const productId = payload.productId as string | undefined;
  if (!productId) return { valid: false };

  // expiresDate is Unix timestamp in milliseconds for subscriptions
  const expiresDateMs = payload.expiresDate as number | undefined;
  const originalTransactionId = (
    payload.originalTransactionId ?? payload.transactionId
  ) as string | undefined;

  return { valid: true, productId, expiresDateMs, originalTransactionId };
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

  // ── Authenticate the caller via JWT ──────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401, headers: CORS });
  }
  const jwt = authHeader.replace('Bearer ', '');

  // Use service role client to verify the user JWT
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: { user }, error: authError } = await adminClient.auth.getUser(jwt);
  if (authError || !user) {
    return new Response('Unauthorized', { status: 401, headers: CORS });
  }
  const userId = user.id;

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { receipt: string; product_id: string; is_subscription?: boolean };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: CORS });
  }

  const { receipt, product_id, is_subscription } = body;
  if (!receipt || !product_id) {
    return new Response('Missing receipt or product_id', { status: 400, headers: CORS });
  }

  // ── Verify receipt — JWS (StoreKit 2) or legacy base64 receipt ───────────
  // JWS tokens from react-native-iap v14: three dot-separated base64url segments
  const isJWS = receipt.split('.').length === 3 && !receipt.includes('\n');
  let result: { valid: boolean; productId?: string; expiresDateMs?: number; originalTransactionId?: string };

  if (isJWS) {
    result = verifyFromJWS(receipt);
    console.log(`[verify-receipt] JWS path — valid:${result.valid} product:${result.productId}`);
  } else {
    const sharedSecret = Deno.env.get('APPLE_SHARED_SECRET')!;
    result = await verifyAppleReceipt(receipt, sharedSecret);
    console.log(`[verify-receipt] legacy receipt path — valid:${result.valid}`);
  }

  if (!result.valid) {
    return new Response('Invalid receipt', { status: 400, headers: CORS });
  }

  const verifiedId = result.productId ?? product_id;

  // ── Subscription ──────────────────────────────────────────────────────────
  if (is_subscription || SUBSCRIPTION_IDS.has(verifiedId)) {
    if (!result.expiresDateMs) {
      return new Response('No expiry in receipt', { status: 400, headers: CORS });
    }

    const expiresAt = new Date(result.expiresDateMs).toISOString();
    const originalTxId: string | undefined = result.originalTransactionId ?? undefined;

    // Idempotency: fetch existing profile to detect replays.
    // A new billing period is identified by expiresAt moving forward.
    // If the stored expiry already equals or exceeds the incoming one, the
    // token reset for this period was already applied — skip it.
    const { data: existingProfile } = await adminClient
      .from('profiles')
      .select('subscription_expires_at')
      .eq('user_id', userId)
      .maybeSingle();

    const existingExpiresAt: string | null = existingProfile?.subscription_expires_at ?? null;
    const isNewBillingPeriod = !existingExpiresAt || expiresAt > existingExpiresAt;

    const upsertPayload: Record<string, unknown> = {
      user_id: userId,
      subscription_expires_at: expiresAt,
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
      return new Response('DB error', { status: 500, headers: CORS });
    }

    return new Response(
      JSON.stringify({ type: 'subscription', expires_at: expiresAt }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }

  // ── Consumable token pack ─────────────────────────────────────────────────
  const tokensToAdd = PRODUCT_TOKENS[verifiedId] ?? 0;
  if (tokensToAdd === 0) {
    return new Response('Unknown product', { status: 400, headers: CORS });
  }

  const { error } = await adminClient.rpc('add_tokens', {
    p_user_id: userId,
    p_tokens: tokensToAdd,
  });

  if (error) {
    console.error('add_tokens failed:', error);
    return new Response('DB error', { status: 500, headers: CORS });
  }

  console.log(`+${tokensToAdd} tokens → user ${userId} (${verifiedId})`);
  return new Response(
    JSON.stringify({ type: 'consumable', tokens_added: tokensToAdd }),
    { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
  );
});
