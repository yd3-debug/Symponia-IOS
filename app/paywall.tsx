import { useTheme } from '@/constants/ThemeContext';
import { t } from '@/constants/i18n';
import {
  SUBSCRIPTION_PRODUCTS,
  fetchStoreSubscriptions,
  initIAP,
  restorePurchases,
  setupPurchaseListeners,
  triggerSubscription,
  verifyAndFinishPurchase,
  type ProductPurchase,
  type SubscriptionProductId,
} from '@/services/iap';
import { syncTokens, checkSubscription } from '@/services/supabaseTokens';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

const FONT = Platform.select({ ios: 'Helvetica Neue', android: 'Roboto', default: 'System' });

// (Reflection quotas removed — a subscription is access, not a bucket. Usage is
//  governed by the fair-use window in the oracle and never counted at the user.)

// ── Paywall Screen ─────────────────────────────────────────────────────────────

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  // intro=1 -> shown straight after onboarding. Two differences:
  //   1. It leads with the free trial, not the price.
  //   2. Dismissing enters the app rather than going "back" to onboarding,
  //      which no longer exists in the stack.
  const { intro } = useLocalSearchParams<{ intro?: string }>();
  const isIntro = intro === '1';

  const [subProducts, setSubProducts]     = useState<{ productId: string; localizedPrice: string; trialDays: number | null }[]>([]);
  const [pricesError, setPricesError]     = useState(false);
  const [isPurchasing, setIsPurchasing]   = useState(false);
  const [isRestoring, setIsRestoring]     = useState(false);
  const [notice, setNotice]               = useState('');

  const dismiss = useCallback(() => {
    if (isIntro) router.replace('/(tabs)');
    else router.back();
  }, [isIntro]);

  const loadPrices = useCallback(() => {
    setPricesError(false);
    const timeoutId = setTimeout(() => setPricesError(true), 8000);
    // Defensive: ensures connection exists before fetchStoreSubscriptions.
    // initConnection is idempotent, so this is a no-op if _layout.tsx
    // already initialized IAP. Keeps paywall self-sufficient if deep-linked.
    initIAP()
      .then(() => fetchStoreSubscriptions())
      .then((subs) => {
        clearTimeout(timeoutId);
        setSubProducts(subs);   // keep trialDays — mapping it away is how the trial silently vanished
      })
      .catch(() => { clearTimeout(timeoutId); setPricesError(true); });
  }, []);

  // ── IAP lifecycle ────────────────────────────────────────────────────────────

  useEffect(() => {
    let removePurchaseListeners: (() => void) | undefined;

    loadPrices();

    // Verification and finishTransaction are handled by the global listener in
    // _layout.tsx. This listener only drives UI feedback (notice, haptic, navigation).
    removePurchaseListeners = setupPurchaseListeners(
      async (purchase: ProductPurchase) => {
        setIsPurchasing(false);
        const boughtSub = SUBSCRIPTION_PRODUCTS.find((p) => p.id === purchase.productId);
        if (boughtSub) {
          setNotice(t(boughtSub.activatedKey));
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setTimeout(dismiss, 1400);
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
      // Connection lifecycle managed by _layout.tsx global IAP handler.
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
          }
          const count = await syncTokens();
          await AsyncStorage.setItem('symponia_tokens', String(count));
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
        <TouchableOpacity onPress={dismiss} activeOpacity={0.65} hitSlop={12}>
          <Text style={[styles.back, { color: colors.textDim }]}>
            {isIntro ? t('not now') : t('← back')}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Headline */}
        <Animated.View entering={FadeIn.duration(300)} style={styles.headlineBlock}>
          <Text style={[styles.headline, { color: colors.text }]}>
            Keep reflecting with Symponia
          </Text>
          <Text style={[styles.subheadline, { color: colors.textSub }]}>
            Choose a plan that fits you.
          </Text>
        </Animated.View>

        {/* ── Subscription ─────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(280).delay(60)}>
          <View style={[styles.card, { borderColor: colors.cyanBorder, backgroundColor: cardBg }]}>
            <View style={[styles.cardBorderTop, { backgroundColor: colors.cyanBorder }]} />
            <View style={styles.cardPad}>
              {SUBSCRIPTION_PRODUCTS.map((sub) => {
                const storeInfo = subProducts.find((p) => p.productId === sub.id);
                const loading = !pricesError && !storeInfo;
                const priceLabel = pricesError ? 'tap to retry' : (storeInfo?.localizedPrice || '…');
                const priceForLegalText = pricesError ? '—' : (storeInfo?.localizedPrice || '…');

                const trialDays = storeInfo?.trialDays ?? null;
                const isWeekly = sub.id.endsWith('.weekly');

                return (
                  <React.Fragment key={sub.id}>
                    {/* Lead with the trial when Apple actually grants one. If the
                        intro offer isn't configured in ASC, trialDays is null and
                        this simply doesn't render — we never promise a trial that
                        doesn't exist. */}
                    {trialDays ? (
                      <Text style={[styles.planTitle, { color: colors.cyan }]}>
                        {t('{n} days free', { n: trialDays })}
                      </Text>
                    ) : (
                      <Text style={[styles.planTitle, { color: colors.cyan }]}>
                        {t(sub.titleKey, { price: priceForLegalText })}
                      </Text>
                    )}

                    <Text style={[styles.planBody, { color: colors.textSub }]}>
                      {t(sub.bodyKey)}
                    </Text>
                    <Text style={[styles.planBody, { color: colors.textDim }]}>
                      {trialDays
                        ? t('Then {price} / {period}. Cancel anytime before it ends and you are not charged.', {
                            price: priceForLegalText,
                            period: t(isWeekly ? 'week' : 'month'),
                          })
                        : t(sub.renewKey)}
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
                        {isPurchasing
                          ? t('processing…')
                          : trialDays
                            ? t('Start {n} days free', { n: trialDays })
                            : t(isWeekly ? 'subscribe — {price}/week' : 'subscribe — {price}/month', { price: priceLabel })}
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

        {/* ── Restore ──────────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(280).delay(120)}>
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
          {t('By continuing you agree to our ')}
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
  back: { fontSize: 14, fontFamily: FONT, fontWeight: '400', letterSpacing: 0.3 },

  scroll: { paddingHorizontal: 20, paddingTop: 28, gap: 16 },

  headlineBlock: { alignItems: 'center', marginBottom: 8, gap: 6 },
  headline:    { fontSize: 22, fontFamily: FONT, fontWeight: '400', letterSpacing: 0.2, textAlign: 'center' },
  subheadline: { fontSize: 14, fontFamily: FONT, fontWeight: '400', letterSpacing: 0.3, textAlign: 'center' },

  card: { borderRadius: 20, overflow: 'hidden', borderWidth: 0.5 },
  cardBorderTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 0.5 },
  cardPad: { padding: 20, gap: 10 },

  planTitle: { fontSize: 15, fontFamily: FONT, fontWeight: '400', letterSpacing: 0.2, marginBottom: 4 },
  planBody: { fontSize: 13, fontFamily: FONT, fontWeight: '400', lineHeight: 20 },

  primaryBtn: {
    borderRadius: 14,
    borderWidth: 0.5,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryBtnText: { fontSize: 14, fontFamily: FONT, fontWeight: '400', letterSpacing: 0.3 },

  renewalNote: { fontSize: 10, fontFamily: FONT, fontWeight: '400', letterSpacing: 0.3 },

  legalRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  legalLink: { fontSize: 11, fontFamily: FONT, fontWeight: '400', textDecorationLine: 'underline' },
  legalSep:  { fontSize: 11, fontFamily: FONT, fontWeight: '400' },

  restoreBtn: {
    alignSelf: 'center',
    borderRadius: 12,
    borderWidth: 0.5,
    paddingVertical: 10,
    paddingHorizontal: 24,
    marginTop: 4,
  },
  restoreBtnText: { fontSize: 13, fontFamily: FONT, fontWeight: '400', letterSpacing: 0.4 },

  notice: { textAlign: 'center', fontSize: 13, fontFamily: FONT, fontWeight: '400', letterSpacing: 0.3, marginTop: 4 },

  footerLegal: {
    textAlign: 'center',
    fontSize: 11,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.3,
    lineHeight: 18,
    marginTop: 12,
  },
});
