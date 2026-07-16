// Sign in with Apple / Google.
//
// Apple's button is rendered by Apple's own component, not a lookalike — their
// Human Interface Guidelines require the official mark, and a hand-rolled copy is
// a rejection risk under 4.8.
//
// The Google button follows Google's Sign-In branding guidelines: the official
// four-colour "G" (see components/GoogleIcon.tsx), the prescribed neutral
// surface/stroke/label colours, logo left of a centred logo+label group. Those
// three hex values per theme are Google's, not ours — they deliberately ignore
// the app's palette. A themed, logo-less "Continue with Google" text button is a
// branding violation and, more practically, looks counterfeit.
//
// The Apple button only renders where Apple sign-in is actually available (iOS
// 13+). On anything else it silently disappears rather than showing a button that
// throws when tapped.

import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Text } from '@/components/Text';
import { GoogleIcon } from '@/components/GoogleIcon';
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

// Google's prescribed button colours. Fixed values, not theme tokens.
const GOOGLE = {
  light: { bg: '#FFFFFF', border: '#747775', text: '#1F1F1F' },
  dark: { bg: '#131314', border: '#8E918F', text: '#E3E3E3' },
};

export function SocialAuthButtons({
  onSuccess,
  onError,
  canSignIn,
  dividerPosition = 'top',
}: {
  /** isNewUser decides onboarding vs straight into the app. */
  onSuccess: (r: { isNewUser: boolean; fullName: string | null }) => void;
  onError: (message: string) => void;
  /**
   * Consent gate. Called on every tap BEFORE any provider flow starts; return
   * false to abort. The caller is responsible for telling the user why —
   * swallowing the tap in silence is worse than the old "hide the buttons"
   * behaviour it replaces.
   */
  canSignIn?: () => boolean;
  /** Which side of the buttons the single "or" rule sits on. */
  dividerPosition?: 'top' | 'bottom';
}) {
  const { colors, isDark } = useTheme();
  const [appleReady, setAppleReady] = useState(false);
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);

  const g = isDark ? GOOGLE.dark : GOOGLE.light;

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
    if (canSignIn && !canSignIn()) return;
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

  // One divider, and it lives with the buttons — so if this whole component
  // renders nothing, there is no orphan "or" left floating on the screen.
  const divider = (
    <View style={styles.dividerRow}>
      <View style={[styles.rule, { backgroundColor: colors.glassBorder }]} />
      <Text style={[styles.or, { color: colors.textDim }]}>{t('or')}</Text>
      <View style={[styles.rule, { backgroundColor: colors.glassBorder }]} />
    </View>
  );

  return (
    <View style={styles.wrap}>
      {dividerPosition === 'top' && divider}

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
          style={[styles.googleBtn, { borderColor: g.border, backgroundColor: g.bg }]}
          onPress={() => run('google')}
          disabled={busy !== null}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={t('Continue with Google')}
        >
          {busy === 'google' ? (
            <ActivityIndicator size="small" color={g.text} />
          ) : (
            <View style={styles.googleInner}>
              <GoogleIcon size={18} />
              <Text style={[styles.googleText, { color: g.text }]}>{t('Continue with Google')}</Text>
            </View>
          )}
        </TouchableOpacity>
      )}

      {dividerPosition === 'bottom' && divider}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginTop: 18 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 6 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  or: { fontSize: 11, fontFamily: FONT, letterSpacing: 1 },
  appleBtn: { height: 50, width: '100%' },
  googleBtn: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  googleText: { fontSize: 15, fontFamily: FONT, fontWeight: '500' },
});
