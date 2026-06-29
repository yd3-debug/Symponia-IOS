import { useTheme } from '@/constants/ThemeContext';
import { supabase } from '@/services/supabase';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const LOGO = require('../Assets/images/app_logo_transparent.png');

const FONT = Platform.select({ ios: 'Helvetica Neue', android: 'Roboto', default: 'System' });

type Mode = 'landing' | 'signin' | 'forgot';

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [mode, setMode] = useState<Mode>('landing');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const inputBg = isDark ? 'rgba(120,90,220,0.06)' : 'rgba(70,50,160,0.06)';

  const reset = (next: Mode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Keyboard.dismiss();
    setError('');
    setShowPassword(false);
    setForgotSent(false);
    setMode(next);
  };

  const signIn = async () => {
    if (!email.trim() || !password) return;
    Keyboard.dismiss();
    setIsLoading(true);
    setError('');

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    setIsLoading(false);

    if (authError) {
      setError(
        authError.message.toLowerCase().includes('invalid login')
          ? 'incorrect email or password'
          : authError.message,
      );
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/(tabs)');
  };

  const sendReset = async () => {
    if (!email.includes('@')) { setError('enter a valid email address'); return; }
    Keyboard.dismiss();
    setIsLoading(true);
    setError('');

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: 'symponia://reset-password' },
    );

    setIsLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setForgotSent(true);
  };

  const canSignIn = email.includes('@') && password.length >= 1 && !isLoading;

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ paddingTop: insets.top }} />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Landing ── */}
        {mode === 'landing' && (
          <Animated.View
            key="landing"
            entering={FadeIn.duration(500)}
            exiting={FadeOut.duration(200)}
            style={styles.landingWrap}
          >
            <View style={styles.brandCenter}>
              <Image source={LOGO} style={styles.logoLarge} contentFit="contain" />
              <Text style={[styles.appName, { color: colors.cyan }]}>SYMPONIA</Text>
              <Text style={[styles.tagline, { color: colors.textSub }]}>a resonant presence</Text>
              <Text style={[styles.bodyText, { color: colors.textDim }]}>
                {'An AI shaped by your inner world.\nEvery session listens. Nothing is generic.'}
              </Text>
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.cyanDim, borderColor: colors.cyanBorder }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/onboarding');
                }}
                activeOpacity={0.75}
              >
                <Text style={[styles.primaryBtnText, { color: colors.cyan }]}>create account</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: colors.glassBorder }]}
                onPress={() => reset('signin')}
                activeOpacity={0.75}
              >
                <Text style={[styles.secondaryBtnText, { color: colors.textSub }]}>
                  already a member?{'  '}
                  <Text style={{ color: colors.cyan }}>sign in</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* ── Sign in ── */}
        {mode === 'signin' && (
          <Animated.View
            key="signin"
            entering={FadeIn.duration(400)}
            exiting={FadeOut.duration(200)}
            style={styles.formWrap}
          >
            <TouchableOpacity onPress={() => reset('landing')} activeOpacity={0.65} style={styles.backBtn}>
              <Text style={[styles.backText, { color: colors.textDim }]}>← back</Text>
            </TouchableOpacity>

            <View style={styles.formHeader}>
              <Text style={[styles.formTitle, { color: colors.text }]}>{'welcome\nback'}</Text>
              <Text style={[styles.formHint, { color: colors.textDim }]}>continue where you left off</Text>
            </View>

            <View style={styles.form}>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.glassBorder, backgroundColor: inputBg }]}
                value={email}
                onChangeText={setEmail}
                placeholder="your@email.com"
                placeholderTextColor={colors.textDim}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                autoFocus
              />

              {/* Password field with show/hide */}
              <View style={[styles.inputRow, { borderColor: colors.glassBorder, backgroundColor: inputBg }]}>
                <TextInput
                  style={[styles.inputInner, { color: colors.text }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="password"
                  placeholderTextColor={colors.textDim}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={signIn}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(v => !v)}
                  hitSlop={8}
                  activeOpacity={0.6}
                  style={styles.eyeBtn}
                >
                  <Text style={[styles.eyeText, { color: colors.textDim }]}>
                    {showPassword ? 'hide' : 'show'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Forgot password */}
              <TouchableOpacity
                onPress={() => { reset('forgot'); }}
                activeOpacity={0.65}
                style={styles.forgotBtn}
              >
                <Text style={[styles.forgotText, { color: colors.cyan }]}>forgot password?</Text>
              </TouchableOpacity>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  {
                    backgroundColor: canSignIn ? colors.cyanDim : 'transparent',
                    borderColor: canSignIn ? colors.cyanBorder : colors.glassBorder,
                    marginTop: 4,
                  },
                ]}
                onPress={signIn}
                disabled={!canSignIn}
                activeOpacity={0.75}
              >
                <Text style={[styles.primaryBtnText, { color: canSignIn ? colors.cyan : colors.textDim }]}>
                  {isLoading ? 'signing in…' : 'sign in'}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.footerNote, { color: colors.textDim }]}>
              {'new here?  '}
              <Text
                style={{ color: colors.cyan }}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/onboarding');
                }}
              >
                create your account
              </Text>
            </Text>

            <View style={styles.brandFooter}>
              <Image source={LOGO} style={styles.brandFooterLogo} contentFit="contain" />
              <Text style={[styles.brandFooterName, { color: colors.cyan }]}>SYMPONIA</Text>
            </View>
          </Animated.View>
        )}

        {/* ── Forgot password ── */}
        {mode === 'forgot' && (
          <Animated.View
            key="forgot"
            entering={FadeIn.duration(400)}
            exiting={FadeOut.duration(200)}
            style={styles.formWrap}
          >
            <TouchableOpacity onPress={() => reset('signin')} activeOpacity={0.65} style={styles.backBtn}>
              <Text style={[styles.backText, { color: colors.textDim }]}>← back</Text>
            </TouchableOpacity>

            <View style={styles.formHeader}>
              <Text style={[styles.formTitle, { color: colors.text }]}>{'reset\npassword'}</Text>
              <Text style={[styles.formHint, { color: colors.textDim }]}>
                {forgotSent
                  ? 'check your inbox — and your junk folder just in case'
                  : 'enter your email and we will send a reset link'}
              </Text>
            </View>

            {!forgotSent && (
              <View style={styles.form}>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.glassBorder, backgroundColor: inputBg }]}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="your@email.com"
                  placeholderTextColor={colors.textDim}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={sendReset}
                  autoFocus
                />

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    {
                      backgroundColor: email.includes('@') && !isLoading ? colors.cyanDim : 'transparent',
                      borderColor: email.includes('@') && !isLoading ? colors.cyanBorder : colors.glassBorder,
                    },
                  ]}
                  onPress={sendReset}
                  disabled={!email.includes('@') || isLoading}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.primaryBtnText, { color: email.includes('@') && !isLoading ? colors.cyan : colors.textDim }]}>
                    {isLoading ? 'sending…' : 'send reset link'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {forgotSent && (
              <Animated.View entering={FadeIn.duration(400)} style={styles.form}>
                <View style={[styles.sentCard, { borderColor: colors.cyanBorder, backgroundColor: colors.cyanDim }]}>
                  <Text style={[styles.sentIcon, { color: colors.cyan }]}>◎</Text>
                  <Text style={[styles.sentText, { color: colors.text }]}>
                    reset link sent to{'\n'}{email.trim().toLowerCase()}{'\n\n'}
                    <Text style={{ fontSize: 12 }}>if you don't see it, check your junk folder.</Text>
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => reset('signin')}
                  style={[styles.primaryBtn, { backgroundColor: colors.cyanDim, borderColor: colors.cyanBorder }]}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.primaryBtnText, { color: colors.cyan }]}>back to sign in</Text>
                </TouchableOpacity>
              </Animated.View>
            )}

            <View style={styles.brandFooter}>
              <Image source={LOGO} style={styles.brandFooterLogo} contentFit="contain" />
              <Text style={[styles.brandFooterName, { color: colors.cyan }]}>SYMPONIA</Text>
            </View>
          </Animated.View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
  },

  // ── Landing ──────────────────────────────────────────────────────────────────

  landingWrap: {
    flex: 1,
    paddingTop: 80,
    gap: 56,
  },

  brandCenter: {
    alignItems: 'center',
    gap: 12,
  },

  logoLarge: {
    width: 96,
    height: 96,
    marginBottom: 8,
  },

  appName: {
    fontSize: 13,
    letterSpacing: 8,
    fontFamily: FONT,
    fontWeight: '400',
  },

  tagline: {
    fontSize: 15,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.3,
    marginBottom: 4,
  },

  bodyText: {
    fontSize: 14,
    fontFamily: FONT,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 8,
  },

  actions: {
    gap: 14,
  },

  primaryBtn: {
    borderRadius: 18,
    borderWidth: 0.5,
    paddingVertical: 16,
    alignItems: 'center',
  },

  primaryBtnText: {
    fontSize: 11,
    letterSpacing: 3,
    fontFamily: FONT,
    fontWeight: '500',
  },

  secondaryBtn: {
    borderRadius: 18,
    borderWidth: 0.5,
    paddingVertical: 14,
    alignItems: 'center',
  },

  secondaryBtnText: {
    fontSize: 13,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.2,
  },

  // ── Form screens (signin / forgot) ───────────────────────────────────────────

  formWrap: {
    flex: 1,
    paddingTop: 24,
    gap: 40,
  },

  backBtn: {
    alignSelf: 'flex-start',
  },

  backText: {
    fontFamily: FONT,
    fontSize: 12,
    letterSpacing: 0.3,
  },

  formHeader: {
    gap: 8,
  },

  formTitle: {
    fontSize: 34,
    fontFamily: FONT,
    fontWeight: '400',
    lineHeight: 42,
    letterSpacing: -0.5,
  },

  formHint: {
    fontSize: 13,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.2,
    lineHeight: 20,
    marginTop: 2,
  },

  form: {
    gap: 12,
  },

  input: {
    fontSize: 15,
    fontFamily: FONT,
    fontWeight: '400',
    borderWidth: 0.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },

  // Password row with inline show/hide
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 0.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  inputInner: {
    flex: 1,
    fontSize: 15,
    fontFamily: FONT,
    fontWeight: '400',
    paddingVertical: 9,
  },
  eyeBtn: {
    paddingLeft: 10,
    paddingVertical: 6,
  },
  eyeText: {
    fontSize: 11,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.5,
  },

  forgotBtn: {
    alignSelf: 'flex-end',
    marginTop: -4,
  },
  forgotText: {
    fontSize: 12,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.2,
  },

  errorText: {
    fontSize: 12,
    fontFamily: FONT,
    color: '#e07070',
    textAlign: 'center',
    lineHeight: 18,
  },

  footerNote: {
    fontSize: 13,
    fontFamily: FONT,
    fontWeight: '400',
    textAlign: 'center',
    letterSpacing: 0.2,
    marginTop: -16,
  },

  // Forgot password sent confirmation
  brandFooter: {
    alignItems: 'center',
    gap: 8,
    paddingTop: 32,
    paddingBottom: 8,
  },
  brandFooterLogo: {
    width: 40,
    height: 40,
  },
  brandFooterName: {
    fontSize: 11,
    letterSpacing: 8,
    fontFamily: FONT,
    fontWeight: '400',
  },

  sentCard: {
    borderRadius: 16,
    borderWidth: 0.5,
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  sentIcon: {
    fontSize: 28,
  },
  sentText: {
    fontSize: 14,
    fontFamily: FONT,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 22,
  },
});
