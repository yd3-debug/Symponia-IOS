import 'react-native-url-polyfill/auto';
import { ThemeProvider, useTheme } from '@/constants/ThemeContext';
import '@/services/notifications'; // initialise setNotificationHandler at app start
import { topUpDailyReflections } from '@/services/notifications';
import { supabase } from '@/services/supabase';
import { checkSubscription, syncTokens } from '@/services/supabaseTokens';
import { TRIAL_TOKENS } from '@/constants/config';
import { initIAPGlobal, cleanupIAP, verifyAndFinishPurchase, type ProductPurchase } from '@/services/iap';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

async function migrateStaleNotifications() {
  const migrated = await AsyncStorage.getItem('symponia_drefl_migration_v1');
  if (migrated === 'done') return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  await AsyncStorage.setItem('symponia_drefl_migration_v1', 'done');
  console.log('[Symponia] Cleared stale notifications on migration');
}

async function migrateDeprecatedKeys() {
  const migrated = await AsyncStorage.getItem('symponia_drefl_migration_v2');
  if (migrated === 'done') return;
  await AsyncStorage.removeItem('symponia_daily_reading');
  await AsyncStorage.setItem('symponia_drefl_migration_v2', 'done');
}

// Restores symponia_notif_daily for users whose preference was wiped by the
// old SIGNED_IN bug (fixed in 9ef452c). Only runs once, only acts when the
// flag is absent AND the user already has iOS permission + archetypes set.
async function migrateRestoreNotificationPref() {
  const migrated = await AsyncStorage.getItem('symponia_drefl_migration_v3');
  if (migrated === 'done') return;
  await AsyncStorage.setItem('symponia_drefl_migration_v3', 'done');
  const notifDaily = await AsyncStorage.getItem('symponia_notif_daily');
  if (notifDaily !== null) return; // already set — don't overwrite
  const [{ status }, animalsRaw] = await Promise.all([
    Notifications.getPermissionsAsync(),
    AsyncStorage.getItem('symponia_animals'),
  ]);
  if (status !== 'granted') return;
  const animals: string[] = animalsRaw ? JSON.parse(animalsRaw) : [];
  if (animals.length === 0) return;
  await AsyncStorage.setItem('symponia_notif_daily', 'true');
  console.log('[Symponia] Restored daily notification preference (was wiped by old SIGNED_IN bug)');
}

async function maybeTopUpDailyReflections() {
  try {
    const [notifEnabled, animalsRaw, name, frequency, tokensStr, lastOpenStr] = await Promise.all([
      AsyncStorage.getItem('symponia_notif_daily'),
      AsyncStorage.getItem('symponia_animals'),
      AsyncStorage.getItem('symponia_name'),
      AsyncStorage.getItem('symponia_frequency'),
      AsyncStorage.getItem('symponia_tokens'),
      AsyncStorage.getItem('symponia_last_app_open'),
    ]);
    if (notifEnabled !== 'true') {
      console.log('[Symponia] Skipping topup — daily notif toggle is off');
      return;
    }
    const animals: string[] = animalsRaw ? JSON.parse(animalsRaw) : [];
    if (animals.length === 0) {
      console.log('[Symponia] Skipping topup — no animals set');
      return;
    }

    // Cost protection: users with 0 tokens who haven't opened the app for 7+ days
    // won't have new reflections generated or scheduled. Resumes automatically on
    // their next app open.
    const tokens = tokensStr ? parseInt(tokensStr, 10) : 0;
    const lastOpen = lastOpenStr ? new Date(lastOpenStr) : null;
    const daysSinceOpen = lastOpen
      ? Math.floor((Date.now() - lastOpen.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // Use live Supabase subscription status so stale/wiped AsyncStorage cache
    // doesn't misclassify a real subscriber as unsubscribed.
    let isSubscribed: boolean;
    try {
      const [localIsSubscribedStr, liveIsSubscribed] = await Promise.all([
        AsyncStorage.getItem('symponia_subscribed'),
        checkSubscription(),
      ]);
      isSubscribed = liveIsSubscribed;
      if (liveIsSubscribed && localIsSubscribedStr !== 'true') {
        AsyncStorage.setItem('symponia_subscribed', 'true');
      }
    } catch (err) {
      console.warn('[Symponia] checkSubscription failed in topup, falling back to cached value', err);
      const localIsSubscribedStr = await AsyncStorage.getItem('symponia_subscribed');
      isSubscribed = localIsSubscribedStr === 'true';
    }

    if (!isSubscribed && tokens === 0 && daysSinceOpen >= 7) {
      console.log('[Symponia] Skipping reflection topup — cold depleted free user');
      const existing = await Notifications.getAllScheduledNotificationsAsync();
      await Promise.all(
        existing
          .filter((n) => n.identifier.startsWith('symponia-drefl-'))
          .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})),
      );
      return;
    }

    await topUpDailyReflections({ name: name ?? undefined, animals, frequency: frequency ?? undefined });
  } catch (err) {
    console.error('[Symponia] Notification top-up failed:', err);
  }
}

async function ensureProfileRow(user: { id: string; email?: string | null }) {
  const { data: existing } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (existing) return;

  if (!user.email) {
    console.warn('[SelfHeal] Skipping — no email on session user');
    return;
  }

  await supabase.from('profiles').upsert(
    { email: user.email, user_id: user.id, tokens: TRIAL_TOKENS },
    { onConflict: 'email' },
  ).catch((err: any) => console.warn('[SelfHeal] Upsert failed:', err?.message));
}

// Global IAP purchase handler — single source of truth for server verification.
// Runs from app boot through app lifetime; local listeners in echo/paywall do
// UI-only work and never call verifyAndFinishPurchase.
async function handleGlobalPurchase(purchase: ProductPurchase): Promise<void> {
  console.log(`[IAP Global] Processing — product:${purchase.productId} txId:${(purchase as any).transactionId ?? 'n/a'}`);
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    console.warn('[IAP Global] No session — skipping verification, will replay on next sign-in');
    return;
  }
  try {
    const result = await verifyAndFinishPurchase(purchase);
    console.log(`[IAP Global] Verified — type:${result.type}`);
    if (result.type === 'subscription') {
      await AsyncStorage.multiSet([
        ['symponia_subscribed', 'true'],
        ['symponia_subscription_expires', result.expiresAt],
      ]);
      await syncTokens();
      console.log('[IAP Global] Subscription state written to AsyncStorage');
    }
  } catch (err: any) {
    console.warn('[IAP Global] Verification failed:', err?.message);
  }
}

async function registerPushToken() {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    const token = await Notifications.getExpoPushTokenAsync();
    await AsyncStorage.setItem('symponia_push_token', token.data);
  } catch {
    // device may not support push (simulator, etc.)
  }
}

function AppShell() {
  const { isDark, colors } = useTheme();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // ── Global IAP lifecycle ───────────────────────────────────────────────────
    let removeIAPGlobal: (() => void) | null = null;
    let iapStarting = false;

    const startIAP = () => {
      if (removeIAPGlobal || iapStarting) return;
      iapStarting = true;
      initIAPGlobal(handleGlobalPurchase)
        .then((fn) => { removeIAPGlobal = fn; })
        .catch((err) => console.warn('[IAP] initIAPGlobal failed:', err?.message))
        .finally(() => { iapStarting = false; });
    };

    const stopIAP = () => {
      removeIAPGlobal?.();
      removeIAPGlobal = null;
      cleanupIAP().catch(() => {});
    };

    const syncProfile = async (userId: string) => {
      const { data: profile } = await supabase.from('profiles').select('*').eq('user_id', userId).single();
      if (profile) {
        await AsyncStorage.multiSet([
          ['symponia_name', profile.name || ''],
          ['symponia_gender', profile.gender || ''],
          ['symponia_frequency', profile.frequency || 'Intellectual'],
          ['symponia_animals', JSON.stringify(profile.animals || [])],
        ]);
      }
    };

    // ── Handle recovery deep link (password reset email) ─────────────────────
    const handleRecoveryUrl = async (url: string): Promise<boolean> => {
      // Decode URL in case it's double-encoded (%2523 → %23 → #)
      let decoded = url;
      try { decoded = decodeURIComponent(url); } catch {}

      const hashIndex = decoded.indexOf('#');
      const queryIndex = decoded.indexOf('?');
      const separatorIndex = hashIndex !== -1 ? hashIndex : queryIndex;
      if (separatorIndex === -1) return false;

      const params = new URLSearchParams(decoded.slice(separatorIndex + 1));

      // Supabase error redirect (e.g. otp_expired) — send to signin
      if (params.get('error')) {
        router.replace('/signin');
        return true;
      }

      const type = params.get('type');
      if (type !== 'recovery') return false;

      const accessToken  = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (!accessToken || !refreshToken) return false;

      // Set the recovery session so reset-password screen can call updateUser
      await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      return true;
    };

    const init = async () => {
      // 1. Check initial URL first — handles app opened via password reset email
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        const isRecovery = await handleRecoveryUrl(initialUrl);
        if (isRecovery) {
          setIsReady(true);
          router.replace('/reset-password');
          return;
        }
      }

      // 2. Normal session check
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/signin');
      } else {
        AsyncStorage.setItem('symponia_user_id', session.user.id);
        await ensureProfileRow(session.user);
        syncProfile(session.user.id);
        syncTokens().catch(() => {});
        startIAP();
      }
      setIsReady(true);
    };

    init();

    // Listen for URLs while the app is already open (app in background)
    const urlSubscription = Linking.addEventListener('url', async ({ url }) => {
      const isRecovery = await handleRecoveryUrl(url);
      if (isRecovery) router.push('/reset-password');
    });

    // Listen for auth changes
    // IMPORTANT: don't navigate on SIGNED_OUT immediately — Supabase fires it
    // during token refresh which can kick logged-in users back to the login screen.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // Tokens already set via handleRecoveryUrl — just navigate
        router.replace('/reset-password');
        return;
      }
      if (event === 'SIGNED_OUT') {
        // Give the SDK 1.5s to re-establish the session (token refresh race)
        setTimeout(() => {
          supabase.auth.getSession().then(({ data: { session: current } }) => {
            if (!current) {
              stopIAP();
              router.replace('/signin');
            }
          });
        }, 1500);
      } else if (event === 'SIGNED_IN' && session) {
        // SIGNED_IN also fires on token refresh — only wipe local state when a
        // different user signs in on the same device.
        const userId = session.user.id;
        AsyncStorage.getItem('symponia_user_id').then((storedId) => {
          if (storedId === userId) {
            // Same user — token refresh or re-mount. Just sync, don't wipe.
            startIAP(); // no-op if already running
            ensureProfileRow(session.user).catch(() => {});
            syncProfile(userId);
            syncTokens().catch(() => {});
          } else {
            console.log(`[Auth] User changed (${storedId ?? 'none'} → ${userId}) — clearing local state`);
            AsyncStorage.multiRemove([
              'symponia_name',
              'symponia_gender',
              'symponia_frequency',
              'symponia_notif_daily',
              'symponia_notif_weekly',
              'symponia_notif_monthly',
              'symponia_tokens',
              'symponia_animals',
              'symponia_subscription_expires',
              'symponia_subscribed',
              'symponia_push_token',
              'symponia_last_reset_seen',
            ])
              .then(() => AsyncStorage.setItem('symponia_user_id', userId))
              .then(() => { stopIAP(); startIAP(); }) // re-init for new user's session
              .then(() => ensureProfileRow(session.user).catch(() => {}))
              .then(() => syncProfile(userId))
              .then(() => syncTokens().catch(() => {}));
          }
        });
      }
      // TOKEN_REFRESHED, USER_UPDATED — no navigation needed
    });

    registerPushToken();
    migrateStaleNotifications()
      .then(() => migrateRestoreNotificationPref())
      .then(() => maybeTopUpDailyReflections());
    migrateDeprecatedKeys();
    AsyncStorage.setItem('symponia_last_app_open', new Date().toISOString());

    return () => {
      subscription.unsubscribe();
      urlSubscription.remove();
      stopIAP();
    };
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'fade',
        }}
      />
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.bg} translucent />
      {!isReady && <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} />}
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AppShell />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
