import { useTheme } from '@/constants/ThemeContext';
import {
  IAP_PRODUCTS,
  SUBSCRIPTION_PRODUCTS,
  cleanupIAP,
  fetchStoreProducts,
  fetchStoreSubscriptions,
  initIAP,
  restorePurchases,
  setupPurchaseListeners,
  triggerPurchase,
  triggerSubscription,
  verifyAndFinishPurchase,
  type IAPProductId,
  type ProductPurchase,
  type SubscriptionProductId,
} from '@/services/iap';
import { syncTokens, checkSubscription, addTokens } from '@/services/supabaseTokens';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

const FONT = Platform.select({ ios: 'Helvetica Neue', android: 'Roboto', default: 'System' });

// ── Reflection counts per product ─────────────────────────────────────────────

const PACK_META: Record<string, { reflections: number; approxMessages: number }> = {
  'com.symponia.tokens50':  { reflections: 50,  approxMessages: 100 },
  'com.symponia.tokens150': { reflections: 150, approxMessages: 300 },
};

const SUB_META = {
  reflections: 350,
  approxMessages: 700,
};

// ── Paywall Screen ─────────────────────────────────────────────────────────────

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { subscriberMode } = useLocalSearchParams<{ subscriberMode?: string }>();
  const isSubscriberMode = subscriberMode === '1';

  const [storeProducts, setStoreProducts] = useState<{ productId: string; localizedPrice: string }[]>([]);
  const [subProducts, setSubProducts]     = useState<{ productId: string; localizedPrice: string }[]>([]);
  const [pricesError, setPricesError]     = useState(false);
  const [isPurchasing, setIsPurchasing]   = useState(false);
  const [isRestoring, setIsRestoring]     = useState(false);
  const [notice, setNotice]               = useState('');

  const loadPrices = useCallback(() => {
    setPricesError(false);
    const timeoutId = setTimeout(() => setPricesError(true), 8000);
    initIAP()
      .then(() => Promise.all([fetchStoreProducts(), fetchStoreSubscriptions()]))
      .then(([products, subs]) => {
        clearTimeout(timeoutId);
        setStoreProducts(products.map((p) => ({ productId: p.productId, localizedPrice: p.localizedPrice })));
        setSubProducts(subs.map((p) => ({ productId: p.productId, localizedPrice: p.localizedPrice })));
      })
      .catch(() => { clearTimeout(timeoutId); setPricesError(true); });
  }, []);

  // ── IAP lifecycle ────────────────────────────────────────────────────────────

  useEffect(() => {
    let removePurchaseListeners: (() => void) | undefined;

    loadPrices();

    removePurchaseListeners = setupPurchaseListeners(
      async (purchase: ProductPurchase) => {
        setIsPurchasing(true);
        try {
          const result = await verifyAndFinishPurchase(purchase);
          if (result.type === 'subscription') {
            await AsyncStorage.multiSet([
              ['symponia_subscribed', 'true'],
              ['symponia_subscription_expires', result.expiresAt],
            ]);
            await addTokens(SUB_META.reflections);
            setNotice('Symponia Monthly activated.');
          } else {
            const current = await syncTokens();
            await AsyncStorage.setItem('symponia_tokens', String(current));
            setNotice(`${result.tokensAdded} reflections added.`);
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setTimeout(() => router.back(), 1400);
        } catch {
          setNotice('Purchase could not be verified. Please try again.');
        } finally {
          setIsPurchasing(false);
        }
      },
      (err) => {
        if ((err as any).code !== 'E_USER_CANCELLED') {
          setNotice('Purchase failed. Please try again.');
        }
        setIsPurchasing(false);
      },
    );

    return () => {
      removePurchaseListeners?.();
      cleanupIAP().catch(() => {});
    };
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleSubscribe = async (productId: SubscriptionProductId) => {
    if (isPurchasing) return;
    setIsPurchasing(true);
    setNotice('');
    try {
      await triggerSubscription(productId);
    } catch {
      setIsPurchasing(false);
    }
  };

  const handlePurchase = async (productId: IAPProductId) => {
    if (isPurchasing) return;
    setIsPurchasing(true);
    setNotice('');
    try {
      await triggerPurchase(productId);
    } catch {
      setIsPurchasing(false);
    }
  };

  const handleRestore = async () => {
    if (isRestoring) return;
    setIsRestoring(true);
    setNotice('');
    try {
      const purchases = await restorePurchases();
      if (purchases.length === 0) {
        setNotice('No previous purchases found.');
        setIsRestoring(false);
        return;
      }
      for (const purchase of purchases) {
        try {
          const result = await verifyAndFinishPurchase(purchase);
          if (result.type === 'subscription') {
            await AsyncStorage.multiSet([
              ['symponia_subscribed', 'true'],
              ['symponia_subscription_expires', result.expiresAt],
            ]);
          } else {
            const current = await syncTokens();
            await AsyncStorage.setItem('symponia_tokens', String(current));
          }
        } catch {}
      }
      setNotice('Purchases restored.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setNotice('Restore failed. Please try again.');
    } finally {
      setIsRestoring(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const cardBg = isDark ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.025)';

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.glassBorder }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.65} hitSlop={12}>
          <Text style={[styles.back, { color: colors.textDim }]}>← back</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Headline */}
        <Animated.View entering={FadeIn.duration(300)} style={styles.headlineBlock}>
          <Text style={[styles.headline, { color: colors.text }]}>
            {isSubscriberMode ? 'Top up your reflections' : 'Keep reflecting with Symponia'}
          </Text>
          <Text style={[styles.subheadline, { color: colors.textSub }]}>
            {isSubscriberMode ? 'Pick a pack to keep going.' : 'Choose a plan that fits you.'}
          </Text>
        </Animated.View>

        {/* ── Subscription — hidden for existing subscribers ────────────────── */}
        <Animated.View entering={FadeInDown.duration(280).delay(60)} style={isSubscriberMode ? { display: 'none' } : undefined}>
          <View style={[styles.card, { borderColor: colors.cyanBorder, backgroundColor: cardBg }]}>
            <View style={[styles.cardBorderTop, { backgroundColor: colors.cyanBorder }]} />
            <View style={styles.cardPad}>
              {SUBSCRIPTION_PRODUCTS.map((sub) => {
                const storeInfo = subProducts.find((p) => p.productId === sub.id);
                const loading = !pricesError && !storeInfo;
                const priceLabel = pricesError ? 'tap to retry' : (storeInfo?.localizedPrice || '…');
                const priceForLegalText = pricesError ? '—' : (storeInfo?.localizedPrice || '…');

                return (
                  <React.Fragment key={sub.id}>
                    <Text style={[styles.planTitle, { color: colors.cyan }]}>
                      {`Symponia Monthly — ${priceForLegalText} / month`}
                    </Text>

                    <Text style={[styles.planBody, { color: colors.textSub }]}>
                      350 reflection sessions across all three modes — Archetype, My Day, and Conversation.
                    </Text>
                    <Text style={[styles.planBody, { color: colors.textDim }]}>
                      Auto-renews every month until cancelled. Cancel anytime in your Apple ID settings.
                    </Text>

                    <TouchableOpacity
                      style={[
                        styles.primaryBtn,
                        {
                          backgroundColor: isPurchasing ? 'transparent' : colors.cyan + '22',
                          borderColor: isPurchasing ? colors.glassBorder : colors.cyan,
                        },
                      ]}
                      onPress={pricesError ? loadPrices : () => handleSubscribe(sub.id as SubscriptionProductId)}
                      disabled={isPurchasing || loading}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.primaryBtnText, { color: isPurchasing ? colors.textDim : colors.cyan }]}>
                        {isPurchasing ? 'processing…' : `Subscribe — ${priceLabel}/month`}
                      </Text>
                    </TouchableOpacity>

                    <Text style={[styles.renewalNote, { color: colors.textDim }]}>
                      {`${priceForLegalText}/month · auto-renews · cancel anytime in App Store Settings`}
                    </Text>

                    {/* Required legal links adjacent to subscription button */}
                    <View style={styles.legalRow}>
                      <TouchableOpacity onPress={() => Linking.openURL('https://symponia.io/terms')} activeOpacity={0.7}>
                        <Text style={[styles.legalLink, { color: colors.textDim }]}>Terms of Use</Text>
                      </TouchableOpacity>
                      <Text style={[styles.legalSep, { color: colors.textDim }]}>·</Text>
                      <TouchableOpacity onPress={() => Linking.openURL('https://symponia.io/privacy')} activeOpacity={0.7}>
                        <Text style={[styles.legalLink, { color: colors.textDim }]}>Privacy Policy</Text>
                      </TouchableOpacity>
                    </View>
                  </React.Fragment>
                );
              })}
            </View>
          </View>
        </Animated.View>

        {/* ── One-time packs ───────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(280).delay(120)}>
          <View style={[styles.card, { borderColor: colors.glassBorder, backgroundColor: cardBg }]}>
            <View style={[styles.cardBorderTop, { backgroundColor: colors.glassBorderStrong }]} />
            <View style={styles.cardPad}>
              <Text style={[styles.packsHeading, { color: colors.textSub }]}>
                One-time packs (no subscription — yours to keep, no expiry)
              </Text>

              {IAP_PRODUCTS.map((pack) => {
                const storeInfo = storeProducts.find((p) => p.productId === pack.id);
                const loading = !pricesError && !storeInfo;
                const priceForLegalText = pricesError ? '—' : (storeInfo?.localizedPrice || '…');
                const meta = PACK_META[pack.id];
                const isPopular = pack.id === 'com.symponia.tokens150';

                return (
                  <View key={pack.id} style={styles.packRow}>
                    <View style={styles.packMeta}>
                      {isPopular && (
                        <View style={[styles.popularBadge, { backgroundColor: colors.cyanDim, borderColor: colors.cyanBorder }]}>
                          <Text style={[styles.popularText, { color: colors.cyan }]}>popular</Text>
                        </View>
                      )}
                      <Text style={[styles.packLabel, { color: colors.text }]}>
                        {isPopular ? 'Popular pack' : 'Small pack'}
                        {` — ${priceForLegalText} — ${meta?.reflections ?? pack.tokens} reflections (~${meta?.approxMessages ?? pack.tokens * 2} messages)`}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.packBtn,
                        {
                          backgroundColor: isPurchasing ? 'transparent' : colors.cyanDim,
                          borderColor: isPurchasing ? colors.glassBorder : colors.cyanBorder,
                        },
                      ]}
                      onPress={pricesError ? loadPrices : () => handlePurchase(pack.id as IAPProductId)}
                      disabled={isPurchasing || loading}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.packBtnText, { color: isPurchasing ? colors.textDim : colors.cyan }]}>
                        {isPurchasing ? '…' : 'Buy'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </View>
        </Animated.View>

        {/* ── Restore ──────────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(280).delay(180)}>
          <TouchableOpacity
            style={[styles.restoreBtn, { borderColor: colors.glassBorder }]}
            onPress={handleRestore}
            disabled={isRestoring}
            activeOpacity={0.7}
          >
            <Text style={[styles.restoreBtnText, { color: isRestoring ? colors.textDim : colors.textSub }]}>
              {isRestoring ? 'restoring…' : 'Restore Purchases'}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Notice / feedback */}
        {!!notice && (
          <Animated.Text entering={FadeIn.duration(200)} style={[styles.notice, { color: colors.cyan }]}>
            {notice}
          </Animated.Text>
        )}

        {/* Footer legal */}
        <Text style={[styles.footerLegal, { color: colors.textDim }]}>
          {'By continuing you agree to our '}
          <Text
            style={{ textDecorationLine: 'underline' }}
            onPress={() => Linking.openURL('https://symponia.io/terms')}
          >
            Terms of Use
          </Text>
          {'  ·  '}
          <Text
            style={{ textDecorationLine: 'underline' }}
            onPress={() => Linking.openURL('https://symponia.io/privacy')}
          >
            Privacy Policy
          </Text>
        </Text>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen:  { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
  },
  back: { fontSize: 14, fontFamily: FONT, fontWeight: '300', letterSpacing: 0.3 },

  scroll: { paddingHorizontal: 20, paddingTop: 28, gap: 16 },

  headlineBlock: { alignItems: 'center', marginBottom: 8, gap: 6 },
  headline:    { fontSize: 22, fontFamily: FONT, fontWeight: '300', letterSpacing: 0.2, textAlign: 'center' },
  subheadline: { fontSize: 14, fontFamily: FONT, fontWeight: '300', letterSpacing: 0.3, textAlign: 'center' },

  card: { borderRadius: 20, overflow: 'hidden', borderWidth: 0.5 },
  cardBorderTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 0.5 },
  cardPad: { padding: 20, gap: 10 },

  planTitle: { fontSize: 15, fontFamily: FONT, fontWeight: '400', letterSpacing: 0.2, marginBottom: 4 },
  planBody: { fontSize: 13, fontFamily: FONT, fontWeight: '300', lineHeight: 20 },

  primaryBtn: {
    borderRadius: 14,
    borderWidth: 0.5,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryBtnText: { fontSize: 14, fontFamily: FONT, fontWeight: '400', letterSpacing: 0.3 },

  renewalNote: { fontSize: 10, fontFamily: FONT, fontWeight: '300', letterSpacing: 0.3 },

  legalRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  legalLink: { fontSize: 11, fontFamily: FONT, fontWeight: '300', textDecorationLine: 'underline' },
  legalSep:  { fontSize: 11, fontFamily: FONT, fontWeight: '300' },

  packsHeading: { fontSize: 12, fontFamily: FONT, fontWeight: '300', letterSpacing: 0.3, lineHeight: 18, marginBottom: 4 },

  packRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  packMeta: { flex: 1, gap: 4 },
  packLabel: { fontSize: 13, fontFamily: FONT, fontWeight: '300', lineHeight: 19 },
  popularBadge: { alignSelf: 'flex-start', borderRadius: 6, borderWidth: 0.5, paddingHorizontal: 7, paddingVertical: 2, marginBottom: 2 },
  popularText: { fontSize: 9, fontFamily: FONT, fontWeight: '500', letterSpacing: 1.2 },

  packBtn: {
    borderRadius: 12,
    borderWidth: 0.5,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  packBtnText: { fontSize: 13, fontFamily: FONT, fontWeight: '400', letterSpacing: 0.3 },

  restoreBtn: {
    alignSelf: 'center',
    borderRadius: 12,
    borderWidth: 0.5,
    paddingVertical: 10,
    paddingHorizontal: 24,
    marginTop: 4,
  },
  restoreBtnText: { fontSize: 13, fontFamily: FONT, fontWeight: '300', letterSpacing: 0.4 },

  notice: { textAlign: 'center', fontSize: 13, fontFamily: FONT, fontWeight: '300', letterSpacing: 0.3, marginTop: 4 },

  footerLegal: {
    textAlign: 'center',
    fontSize: 11,
    fontFamily: FONT,
    fontWeight: '300',
    letterSpacing: 0.3,
    lineHeight: 18,
    marginTop: 12,
  },
});
