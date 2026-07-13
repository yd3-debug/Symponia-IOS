// ── Apple In-App Purchases ────────────────────────────────────────────────────
// Gracefully no-ops in Expo Go (which lacks native IAP modules).
// Full functionality available in development builds and production.

import { SUPABASE_URL } from '@/constants/config';
import { supabase } from './supabase';
import Constants from 'expo-constants';

// ── Product catalogue ─────────────────────────────────────────────────────────

export const IAP_PRODUCTS = [
  { id: 'com.symponia.tokens50',  tokens: 50 },
  { id: 'com.symponia.tokens150', tokens: 150 },
] as const;

// Subscription plans.
//
// SINGLE SOURCE OF TRUTH for plan copy. Every plan-dependent string lives here,
// so no screen can ever tell a weekly subscriber their plan "renews monthly".
// The `*Key` fields are English source strings, i.e. i18n dictionary keys — all
// verified against the 8 dictionaries by scripts/i18n-audit.py.
//
// NO QUOTAS. A subscription is access, not a bucket of reflections. Usage is
// governed by the fair-use window in the oracle (50 / 7 days), which the user
// never sees unless they reach it. Nothing here promises a number, because the
// app no longer counts.
//
// {price} is filled from the STORE at runtime, never hardcoded — that keeps it
// correct in every currency and satisfies Apple's requirement to show the real
// price at the point of purchase.
export const SUBSCRIPTION_PRODUCTS = [
  {
    id: 'com.symponia.premium.monthly',
    label: 'Monthly',
    nameKey:    'Symponia Monthly',
    titleKey:   'Unlimited — {price} / month',
    bodyKey:    'Reflect as often as you need, across Archetype, My Day and Conversation.',
    renewKey:   'Auto-renews every month until cancelled. Cancel anytime in your Apple ID settings.',
    shortRenewKey: 'auto-renews monthly · cancel anytime in App Store Settings',
    activatedKey:  'Symponia Monthly activated.',
    pitchKey:   'Reflect as often as you need.',
    renewsKey:  'Renews monthly with your subscription',
  },
  // WEEKLY IS DELIBERATELY NOT HERE.
  //
  // It was never created in App Store Connect, so the store returns nothing for
  // it — leaving a permanently-loading card with a "…" price on both the paywall
  // and Settings. And with everything unlimited, "7 days free, then £4.99 every
  // week" is a worse deal than the monthly and only muddies the choice.
  //
  // If you ever add it back: create com.symponia.premium.weekly in the SAME
  // subscription group (different groups = a user can be billed for both), give
  // it its own 7-day intro offer, and re-add it to SUBSCRIPTION_IDS in
  // verify-receipt AND apple-notification or its renewals are silently ignored.
] as const;

export type IAPProductId = (typeof IAP_PRODUCTS)[number]['id'];
export type SubscriptionProductId = (typeof SUBSCRIPTION_PRODUCTS)[number]['id'];

export type PurchaseResult =
  | { type: 'consumable'; tokensAdded: number }
  | { type: 'subscription'; expiresAt: string };

// v14 uses Purchase (PurchaseIOS | PurchaseAndroid)
export type ProductPurchase = import('react-native-iap').Purchase;
export type PurchaseError = import('react-native-iap').PurchaseError;

const SUBSCRIPTION_IDS = new Set(SUBSCRIPTION_PRODUCTS.map((p) => p.id));
const VERIFY_URL = `${SUPABASE_URL}/functions/v1/verify-receipt`;

// Detect Expo Go — IAP native module is unavailable there
const isExpoGo = Constants.executionEnvironment === 'storeClient';

// ── Lazy IAP loader ───────────────────────────────────────────────────────────

let _iap: typeof import('react-native-iap') | null = null;

async function getIAP() {
  if (isExpoGo) return null;
  if (!_iap) _iap = await import('react-native-iap');
  return _iap;
}

// ── Connection ────────────────────────────────────────────────────────────────

export async function initIAP(): Promise<void> {
  const iap = await getIAP();
  if (!iap) return;
  await iap.initConnection();
}

export async function cleanupIAP(): Promise<void> {
  const iap = await getIAP();
  if (!iap) return;
  await iap.endConnection();
}

// Initialises the global IAP connection with the correct listener-first ordering:
//   1. Register purchaseUpdatedListener BEFORE initConnection so StoreKit
//      transaction replays are caught immediately on connection.
//   2. Call initConnection (StoreKit may replay pending transactions here).
//   3. Drain pre-existing pending transactions via getAvailablePurchases.
// Returns a cleanup function that removes the listener (does NOT end the
// connection — call cleanupIAP() separately when the session ends).
export async function initIAPGlobal(
  onPurchase: (purchase: ProductPurchase) => Promise<void>,
): Promise<() => void> {
  const iap = await getIAP();
  if (!iap) return () => {};

  console.log('[IAP] initIAPGlobal — registering global listener');

  // 1. Listener FIRST
  const purchaseSub = iap.purchaseUpdatedListener((purchase) => {
    console.log(`[IAP Global] purchaseUpdatedListener — product:${purchase.productId} txId:${(purchase as any).transactionId ?? 'n/a'}`);
    onPurchase(purchase as ProductPurchase);
  });

  // 2. Connect — StoreKit replays pending transactions into the listener above
  await iap.initConnection();
  console.log('[IAP] initIAPGlobal — connection established');

  // 3. Drain any transactions that preceded this listener registration
  try {
    const pending = await iap.getAvailablePurchases({});
    console.log(`[IAP] initIAPGlobal — ${pending?.length ?? 0} pending transaction(s) on launch`);
    for (const purchase of (pending ?? [])) {
      console.log(`[IAP] Draining — product:${purchase.productId} txId:${(purchase as any).transactionId ?? 'n/a'}`);
      await onPurchase(purchase as ProductPurchase);
    }
  } catch (err: any) {
    console.warn('[IAP] initIAPGlobal — drain failed:', err?.message);
  }

  console.log('[IAP] initIAPGlobal — done');
  return () => { purchaseSub.remove(); };
}

export async function fetchStoreProducts() {
  const iap = await getIAP();
  if (!iap) return [];
  await iap.initConnection();
  const products = await iap.fetchProducts({
    skus: IAP_PRODUCTS.map((p) => p.id),
    type: 'in-app',
  });
  if (!products) {
    console.log('[IAP] fetchStoreProducts → null response');
    return [];
  }
  console.log(`[IAP] fetchStoreProducts → ${products.length} product(s):`, products.map((p) => `${p.id}=${p.displayPrice}`));
  return products.map((p) => ({
    productId: p.id,
    localizedPrice: p.displayPrice ?? '',
  }));
}

export async function fetchStoreSubscriptions() {
  const iap = await getIAP();
  if (!iap) return [];
  await iap.initConnection();
  const products = await iap.fetchProducts({
    skus: SUBSCRIPTION_PRODUCTS.map((p) => p.id),
    type: 'subs',
  });
  if (!products) {
    console.log('[IAP] fetchStoreSubscriptions → null response');
    return [];
  }
  console.log(`[IAP] fetchStoreSubscriptions → ${products.length} product(s):`, products.map((p) => `${p.id}=${p.displayPrice}`));

  return products.map((p) => {
    // Free trial, read from the STORE rather than hardcoded. If the introductory
    // offer isn't configured in App Store Connect yet, this is simply absent and
    // the paywall silently falls back to showing the price — it never promises a
    // trial that doesn't exist. That matters: advertising a trial Apple doesn't
    // actually grant is a guideline 3.1.2 rejection.
    const intro = (p as any)?.subscriptionInfoIOS?.introductoryOffer ?? null;
    const isFreeTrial = intro?.paymentMode === 'free-trial';

    return {
      productId: p.id,
      localizedPrice: p.displayPrice ?? '',
      /** e.g. 7 when the offer is "7 days free". Null when there is no trial. */
      trialDays: isFreeTrial ? periodToDays(intro.period, intro.periodCount ?? 1) : null,
    };
  });
}

/** Apple gives the trial as a unit + count ("1 week"); the UI wants days. */
function periodToDays(period: unknown, count: number): number | null {
  const unit = String(period ?? '').toLowerCase();
  if (unit.includes('day')) return count;
  if (unit.includes('week')) return count * 7;
  if (unit.includes('month')) return count * 30;
  if (unit.includes('year')) return count * 365;
  return null;
}

// ── Purchase triggers ─────────────────────────────────────────────────────────

export async function triggerPurchase(productId: IAPProductId): Promise<void> {
  const iap = await getIAP();
  if (!iap) return;
  await iap.requestPurchase({
    request: {
      apple: { sku: productId, andDangerouslyFinishTransactionAutomatically: false },
    },
    type: 'in-app',
  });
}

export async function triggerSubscription(productId: SubscriptionProductId): Promise<void> {
  const iap = await getIAP();
  if (!iap) return;
  await iap.requestPurchase({
    request: {
      apple: { sku: productId, andDangerouslyFinishTransactionAutomatically: false },
    },
    type: 'subs',
  });
}

// ── Listeners ─────────────────────────────────────────────────────────────────

export function setupPurchaseListeners(
  onPurchase: (purchase: ProductPurchase) => void,
  onError: (err: PurchaseError) => void,
): () => void {
  if (isExpoGo) return () => {};

  let purchaseSub: any;
  let errorSub: any;

  getIAP().then((iap) => {
    if (!iap) return;
    purchaseSub = iap.purchaseUpdatedListener((purchase) => {
      console.log(`[IAP] purchaseUpdatedListener — product:${purchase.productId} txId:${purchase.transactionId ?? 'n/a'}`);
      onPurchase(purchase);
    });
    errorSub = iap.purchaseErrorListener((err) => {
      console.log(`[IAP] purchaseErrorListener — code:${(err as any).code} msg:${err.message}`);
      onError(err);
    });
  });

  return () => {
    purchaseSub?.remove();
    errorSub?.remove();
  };
}

// ── Restore purchases ─────────────────────────────────────────────────────────

export async function restorePurchases(): Promise<ProductPurchase[]> {
  const iap = await getIAP();
  if (!iap) return [];
  await iap.initConnection();
  const purchases = await iap.getAvailablePurchases({});
  console.log(`[IAP] getAvailablePurchases → ${purchases?.length ?? 0} purchase(s)`);
  if (purchases?.length) {
    console.log('[IAP] restore productIds:', (purchases as any[]).map((p) => p.productId));
  }
  return (purchases ?? []) as ProductPurchase[];
}

// ── Server verification ───────────────────────────────────────────────────────

export async function verifyAndFinishPurchase(purchase: ProductPurchase): Promise<PurchaseResult> {
  const iap = await getIAP();
  if (!iap) throw new Error('IAP not available in Expo Go');

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');

  const isSubscription = SUBSCRIPTION_IDS.has(purchase.productId as SubscriptionProductId);

  // v14: token is in purchaseToken (JWS on iOS, purchaseToken on Android)
  const receipt = purchase.purchaseToken ?? '';
  const isJWS = receipt.split('.').length === 3 && !receipt.includes('\n');
  console.log(`[IAP] verifyAndFinishPurchase — product:${purchase.productId} type:${isSubscription ? 'subscription' : 'consumable'} receiptFormat:${isJWS ? 'JWS' : 'legacy'} receiptLen:${receipt.length}`);

  const res = await fetch(VERIFY_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      receipt,
      product_id: purchase.productId,
      is_subscription: isSubscription,
    }),
  });

  console.log(`[IAP] verify-receipt response → status:${res.status}`);
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    console.log(`[IAP] verify-receipt error body:`, err);
    throw new Error(`Receipt verification failed (${res.status}) ${err}`.trim());
  }

  const data = await res.json();

  try {
    if (isSubscription) {
      console.log(`[IAP] subscription verified — expires:${data.expires_at}`);
      return { type: 'subscription', expiresAt: data.expires_at };
    }
    console.log(`[IAP] consumable verified — tokensAdded:${data.tokens_added}`);
    return { type: 'consumable', tokensAdded: data.tokens_added };
  } finally {
    console.log(`[IAP] finishTransaction — product:${purchase.productId}`);
    await iap.finishTransaction({ purchase, isConsumable: !isSubscription }).catch((e: any) => {
      console.log(`[IAP] finishTransaction error:`, e?.message ?? e);
    });
  }
}
