// Sign in with Apple / Google.
//
// Apple's button is rendered by Apple's own component, not a lookalike — their
// Human Interface Guidelines require the official mark, and a hand-rolled copy is
// a rejection risk under 4.8.
//
// The Apple button only renders where Apple sign-in is actually available (iOS
// 13+). On anything else it silently disappears rather than showing a button that
// throws when tapped.

import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Text } from '@/components/Text';
import { t } from '@/constants/i18n';
import Constants from 'expo-constants';
import { useTheme } from '@/constants/ThemeContext';
import {
  SocialAuthCancelled,
  isAppleSignInAvailable,
  signInWithApple,
  signInWithGoogle,
} from '@/services/socialAuth';

const FONT = Platform.select({ ios: 'Helvetica Neue', android: 'Roboto', default: 'System' });

export function SocialAuthButtons({
  onSuccess,
  onError,
}: {
  /** isNewUser decides onboarding vs straight into the app. */
  onSuccess: (r: { isNewUser: boolean; fullName: string | null }) => void;
  onError: (message: string) => void;
}) {
  const { colors, isDark } = useTheme();
  const [appleReady, setAppleReady] = useState(false);
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);

  // Google only renders once REAL client IDs are configured. Shipping the button
  // with the REPLACE_ME placeholders means a reviewer taps it, gets an error, and
  // the app is rejected under 2.1 (App Completeness). A missing Google button is
  // fully compliant — Sign in with Apple alone satisfies 4.8; Google alone does not.
  const googleId = (Constants.expoConfig?.extra as any)?.googleIosClientId as string | undefined;
  const googleReady = !!googleId && !googleId.startsWith('REPLACE_ME');

  useEffect(() => {
    isAppleSignInAvailable().then(setAppleReady);
  }, []);

  const run = async (which: 'apple' | 'google') => {
    if (busy) return;
    setBusy(which);
    try {
      const r = which === 'apple' ? await signInWithApple() : await signInWithGoogle();
      onSuccess(r);
    } catch (e: any) {
      // A cancel is not an error. Saying "sign-in failed" to someone who simply
      // changed their mind is a small insult that reads as a bug.
      if (!(e instanceof SocialAuthCancelled)) {
        onError(e?.message || t('Sign-in failed. Please try again.'));
      }
    } finally {
      setBusy(null);
    }
  };

  if (!appleReady && Platform.OS === 'ios') return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.dividerRow}>
        <View style={[styles.rule, { backgroundColor: colors.glassBorder }]} />
        <Text style={[styles.or, { color: colors.textDim }]}>{t('or')}</Text>
        <View style={[styles.rule, { backgroundColor: colors.glassBorder }]} />
      </View>

      {appleReady && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={
            isDark
              ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={14}
          style={styles.appleBtn}
          onPress={() => run('apple')}
        />
      )}

      {googleReady && (
        <TouchableOpacity
          style={[styles.googleBtn, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}
          onPress={() => run('google')}
          disabled={busy !== null}
          activeOpacity={0.75}
        >
          {busy === 'google' ? (
            <ActivityIndicator size="small" color={colors.textSub} />
          ) : (
            <Text style={[styles.googleText, { color: colors.text }]}>{t('Continue with Google')}</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginTop: 18 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  or: { fontSize: 11, fontFamily: FONT, letterSpacing: 1 },
  appleBtn: { height: 50, width: '100%' },
  googleBtn: {
    height: 50,
    borderRadius: 14,
    borderWidth: 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleText: { fontSize: 15, fontFamily: FONT, fontWeight: '500' },
});
