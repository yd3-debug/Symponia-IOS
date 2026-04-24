// supabase/functions/apple-notification/index.ts
//
// Receives App Store Server Notifications V2 from Apple.
// Verifies the signedPayload JWS, routes on notification_type,
// and updates profiles accordingly.
//
// Deploy: supabase functions deploy apple-notification
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// ── Post-launch hardening (not blocking) ──────────────────────────────────────
// TODO(security): Cert chain validation not implemented. Signature is verified
//   against the leaf cert's public key (in x5c[0]), but the chain from leaf →
//   intermediate → Apple root is NOT checked. A sophisticated attacker with a
//   valid originalTransactionId could forge a notification with a self-signed cert.
//   Fix: verify chain signatures + match root thumbprint against Apple's published
//   root CA before acting on any notification.
//
// TODO(idempotency): Apple may retry the same notification on transient failure.
//   DID_RENEW retried twice is harmless (resets to 350 both times). REFUND retried
//   twice would double-deduct. Fix: before processing, check apple_webhook_log for
//   existing row with same (original_transaction_id, notification_type, notificationUUID).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUBSCRIPTION_SESSIONS_PER_RENEWAL = 350;

const SUBSCRIPTION_PRODUCT_IDS = new Set(['com.symponia.premium.monthly']);

// Defensive: include tokens500 even though it was never surfaced in the UI —
// handles any edge-case purchase that may exist in the wild.
const TOPUP_SESSION_COUNTS: Record<string, number> = {
  'com.symponia.tokens50':  50,
  'com.symponia.tokens150': 150,
  'com.symponia.tokens500': 500,
};

// ── JWS verification ──────────────────────────────────────────────────────────

function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - padded.length % 4) % 4;
  const b64 = padded + '='.repeat(pad);
  const binary = atob(b64);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function base64Decode(str: string): Uint8Array {
  const binary = atob(str);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function verifyAppleJWS(signedPayload: string): Promise<unknown> {
  const parts = signedPayload.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWS structure');

  const [headerB64, payloadB64, signatureB64] = parts;

  const header = JSON.parse(new TextDecoder().decode(base64urlDecode(headerB64)));
  const x5c: string[] = header.x5c;
  if (!x5c || x5c.length < 2) throw new Error('Missing x5c cert chain in JWS header');

  // Import leaf cert public key (first entry in x5c, DER base64-encoded)
  const leafDer = base64Decode(x5c[0]);

  // Try ECDSA P-256 first (Apple's current algorithm); fall back to RSA
  let publicKey: CryptoKey;
  let algorithm: AlgorithmIdentifier;
  try {
    publicKey = await crypto.subtle.importKey(
      'spki', leafDer,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false, ['verify'],
    );
    algorithm = { name: 'ECDSA', hash: 'SHA-256' };
  } catch {
    publicKey = await crypto.subtle.importKey(
      'spki', leafDer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false, ['verify'],
    );
    algorithm = { name: 'RSASSA-PKCS1-v1_5' };
  }

  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64urlDecode(signatureB64);

  const valid = await crypto.subtle.verify(algorithm, publicKey, signature, signingInput);
  if (!valid) throw new Error('JWS signature verification failed');

  return JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64)));
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: { signedPayload?: string };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: CORS });
  }

  if (!body.signedPayload) {
    return new Response('Missing signedPayload', { status: 400, headers: CORS });
  }

  // ── Decode + verify JWS signature ─────────────────────────────────────────
  let decodedPayload: any;
  try {
    decodedPayload = await verifyAppleJWS(body.signedPayload);
  } catch (err: any) {
    const verifyError = err.message ?? 'Unknown verification error';
    console.error('[apple-notification] JWS verification failed:', verifyError);
    await admin.from('apple_webhook_log').insert({
      notification_type: 'VERIFY_FAILED',
      subtype: null,
      original_transaction_id: null,
      payload: { signedPayload: body.signedPayload.slice(0, 200) },
      error: verifyError,
    }).catch(() => {});
    // Return 200 — a permanently bad payload should not be retried by Apple
    return new Response('OK', { status: 200 });
  }

  // ── Extract fields ────────────────────────────────────────────────────────
  const notificationType: string = decodedPayload.notificationType ?? '';
  const subtype: string          = decodedPayload.subtype ?? '';
  const data: any                = decodedPayload.data ?? {};

  // signedTransactionInfo and signedRenewalInfo are inner JWSes — decode payload
  // without re-verifying (outer signature already verified above)
  let transactionInfo: any = {};
  if (data.signedTransactionInfo) {
    try {
      const parts = data.signedTransactionInfo.split('.');
      transactionInfo = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[1])));
    } catch { /* non-critical — proceed with empty */ }
  }

  let renewalInfo: any = {};
  if (data.signedRenewalInfo) {
    try {
      const parts = data.signedRenewalInfo.split('.');
      renewalInfo = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[1])));
    } catch { /* non-critical */ }
  }

  const originalTransactionId: string =
    transactionInfo.originalTransactionId ?? renewalInfo.originalTransactionId ?? '';
  const expiresDateMs: number | null = transactionInfo.expiresDate ?? null;
  const productId: string            = transactionInfo.productId ?? '';

  // ── Log entry (written at end of handler) ─────────────────────────────────
  const logEntry: Record<string, any> = {
    notification_type: notificationType,
    subtype,
    original_transaction_id: originalTransactionId,
    payload: decodedPayload,
    error: null,
  };

  // ── Look up user by original_transaction_id ───────────────────────────────
  const { data: profileRow } = await admin
    .from('profiles')
    .select('user_id, subscription_tokens, topup_tokens, subscription_expires_at')
    .eq('original_transaction_id', originalTransactionId)
    .maybeSingle();

  if (!profileRow && originalTransactionId) {
    console.warn(`[apple-notification] No profile for transaction ${originalTransactionId}`);
    await admin.from('apple_webhook_log')
      .insert({ ...logEntry, error: 'user_not_found' }).catch(() => {});
    return new Response('OK', { status: 200 });
  }

  const userId: string = profileRow?.user_id ?? '';

  // ── Route on notification type ────────────────────────────────────────────
  try {
    if (notificationType === 'DID_RENEW') {
      const expiresAt = expiresDateMs ? new Date(expiresDateMs).toISOString() : null;

      // Idempotency: Apple may retry notifications. Only reset tokens when the
      // billing period has genuinely advanced (expiresAt moved forward).
      // If verify-receipt already handled this renewal client-side, the stored
      // subscription_expires_at will already equal the incoming expiresAt — skip.
      const existingExpiresAt: string | null = (profileRow as any)?.subscription_expires_at ?? null;
      const isNewBillingPeriod = !existingExpiresAt || (expiresAt && expiresAt > existingExpiresAt);

      const updateData: Record<string, unknown> = {
        ...(expiresAt ? { subscription_expires_at: expiresAt } : {}),
      };

      if (isNewBillingPeriod) {
        updateData.tokens = SUBSCRIPTION_SESSIONS_PER_RENEWAL;
        updateData.tokens_reset_at = new Date().toISOString();
        console.log(`[apple-notification] DID_RENEW new period → reset to ${SUBSCRIPTION_SESSIONS_PER_RENEWAL} tokens for user ${userId}`);
      } else {
        console.log(`[apple-notification] DID_RENEW replay → skipping token reset for user ${userId}`);
      }

      await admin.from('profiles').update(updateData).eq('user_id', userId);

    } else if (notificationType === 'EXPIRED' || notificationType === 'DID_CANCEL') {
      const expiresAt = expiresDateMs
        ? new Date(expiresDateMs).toISOString()
        : new Date(0).toISOString();
      await admin.from('profiles').update({
        subscription_tokens: 0,
        subscription_expires_at: expiresAt,
      }).eq('user_id', userId);
      console.log(`[apple-notification] ${notificationType} → subscription_tokens = 0 for user ${userId}`);

    } else if (notificationType === 'REFUND') {
      if (SUBSCRIPTION_PRODUCT_IDS.has(productId)) {
        await admin.from('profiles')
          .update({ subscription_tokens: 0 })
          .eq('user_id', userId);
        console.log(`[apple-notification] REFUND (subscription) → subscription_tokens = 0 for user ${userId}`);

      } else if (productId in TOPUP_SESSION_COUNTS) {
        const deduction = TOPUP_SESSION_COUNTS[productId];
        const newBalance = Math.max(0, (profileRow?.topup_tokens ?? 0) - deduction);
        await admin.from('profiles')
          .update({ topup_tokens: newBalance })
          .eq('user_id', userId);
        console.log(`[apple-notification] REFUND (${productId}) → topup_tokens = ${newBalance} for user ${userId}`);

      } else {
        console.warn(`[apple-notification] REFUND for unknown product: ${productId}`);
        logEntry.error = `unknown_product:${productId}`;
      }

    } else if (notificationType === 'DID_FAIL_TO_RENEW') {
      // Billing retry in progress — Apple retries for up to 60 days.
      // subscription_expires_at from the last receipt remains valid during grace period.
      console.log(`[apple-notification] DID_FAIL_TO_RENEW → no action for user ${userId}`);

    } else {
      console.log(`[apple-notification] Unhandled: ${notificationType}/${subtype}`);
    }
  } catch (err: any) {
    logEntry.error = err.message ?? 'handler error';
    console.error('[apple-notification] Handler error:', err);
  }

  await admin.from('apple_webhook_log').insert(logEntry).catch(() => {});
  return new Response('OK', { status: 200 });
});
