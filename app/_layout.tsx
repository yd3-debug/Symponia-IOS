import 'react-native-url-polyfill/auto';
import { ThemeProvider, useTheme } from '@/constants/ThemeContext';
import '@/services/notifications'; // initialise setNotificationHandler at app start
import { topUpDailyReflections } from '@/services/notifications';
import { supabase } from '@/services/supabase';
import { syncTokens } from '@/services/supabaseTokens';
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

async function maybeTopUpDailyReflections() {
  try {
    const [notifEnabled, animalsRaw, name, frequency, tokensStr, isSubscribedStr, lastOpenStr] = await Promise.all([
      AsyncStorage.getItem('symponia_notif_daily'),
      AsyncStorage.getItem('symponia_animals'),
      AsyncStorage.getItem('symponia_name'),
      AsyncStorage.getItem('symponia_frequency'),
      AsyncStorage.getItem('symponia_tokens'),
      AsyncStorage.getItem('symponia_subscribed'),
      AsyncStorage.getItem('symponia_last_app_open'),
    ]);
    if (notifEnabled !== 'true') return;
    const animals: string[] = animalsRaw ? JSON.parse(animalsRaw) : [];
    if (animals.length === 0) return;

    // Cost protection: users with 0 tokens who haven't opened the app for 7+ days
    // won't have new reflections generated or scheduled. Resumes automatically on
    // their next app open.
    const tokens = tokensStr ? parseInt(tokensStr, 10) : 0;
    const isSubscribed = isSubscribedStr === 'true';
    const lastOpen = lastOpenStr ? new Date(lastOpenStr) : null;
    const daysSinceOpen = lastOpen
      ? Math.floor((Date.now() - lastOpen.getTime()) / (1000 * 60 * 60 * 24))
      : 0;
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
        syncProfile(session.user.id);
        syncTokens().catch(() => {});
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
            if (!current) router.replace('/signin');
          });
        }, 1500);
      } else if (event === 'SIGNED_IN' && session) {
        // SIGNED_IN also fires on token refresh — only wipe local state when a
        // different user signs in on the same device.
        const userId = session.user.id;
        AsyncStorage.getItem('symponia_user_id').then((storedId) => {
          if (storedId === userId) {
            // Same user — token refresh or re-mount. Just sync, don't wipe.
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
              .then(() => syncProfile(userId))
              .then(() => syncTokens().catch(() => {}));
          }
        });
      }
      // TOKEN_REFRESHED, USER_UPDATED — no navigation needed
    });

    registerPushToken();
    migrateStaleNotifications().then(() => maybeTopUpDailyReflections());
    migrateDeprecatedKeys();
    AsyncStorage.setItem('symponia_last_app_open', new Date().toISOString());

    return () => {
      subscription.unsubscribe();
      urlSubscription.remove();
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
