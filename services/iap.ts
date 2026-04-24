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

export const SUBSCRIPTION_PRODUCTS = [
  { id: 'com.symponia.premium.monthly', label: 'Monthly' },
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
  return products.map((p) => ({
    productId: p.id,
    localizedPrice: p.displayPrice ?? '',
  }));
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
