import { useTheme } from '@/constants/ThemeContext';
import { supabase } from '@/services/supabase';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
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
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const FONT = Platform.select({ ios: 'Helvetica Neue', android: 'Roboto', default: 'System' });

export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const inputBg = isDark ? 'rgba(120,90,220,0.06)' : 'rgba(70,50,160,0.06)';

  // ── Extract recovery tokens from the deep link URL ─────────────────────────
  useEffect(() => {
    const extractAndSetSession = async (url: string) => {
      const hashIndex = url.indexOf('#');
      if (hashIndex === -1) {
        // Try query params (some Supabase configs use ? instead of #)
        const queryIndex = url.indexOf('?');
        if (queryIndex === -1) { setSessionError('Invalid reset link — please request a new one.'); return; }
        const params = new URLSearchParams(url.slice(queryIndex + 1));
        const type = params.get('type');
        const at = params.get('access_token');
        const rt = params.get('refresh_token');
        if (type !== 'recovery' || !at || !rt) { setSessionError('Invalid reset link — please request a new one.'); return; }
        const { error } = await supabase.auth.setSession({ access_token: at, refresh_token: rt });
        if (error) { setSessionError('Reset link has expired — please request a new one.'); return; }
        setSessionReady(true);
        return;
      }

      const params = new URLSearchParams(url.slice(hashIndex + 1));
      const type = params.get('type');
      const at   = params.get('access_token');
      const rt   = params.get('refresh_token');

      if (type !== 'recovery' || !at || !rt) {
        // Might already have a recovery session from the layout handler
        const { data: { session } } = await supabase.auth.getSession();
        if (session) { setSessionReady(true); return; }
        setSessionError('Invalid reset link — please request a new one.');
        return;
      }

      const { error } = await supabase.auth.setSession({ access_token: at, refresh_token: rt });
      if (error) {
        setSessionError('Reset link has expired — please request a new one.');
        return;
      }
      setSessionReady(true);
    };

    const init = async () => {
      // Check if we already have a recovery session (set by _layout.tsx)
      const { data: { session } } = await supabase.auth.getSession();
      if (session) { setSessionReady(true); return; }

      // Otherwise read tokens from the initial URL
      const url = await Linking.getInitialURL();
      if (url) {
        await extractAndSetSession(url);
      } else {
        setSessionError('No reset link found — please request a new one.');
      }
    };

    init();
  }, []);

  const updatePassword = async () => {
    if (password.length < 8) { setError('password must be at least 8 characters'); return; }
    if (password !== confirm) { setError('passwords do not match'); return; }
    Keyboard.dismiss();
    setIsLoading(true);
    setError('');

    const { data: { user }, error: updateError } = await supabase.auth.updateUser({ password });
    setIsLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    // Stamp the profile record so the password change is reflected there too
    if (user?.id) {
      await supabase
        .from('profiles')
        .update({ updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDone(true);
    setTimeout(() => router.replace('/(tabs)'), 1800);
  };

  const canSubmit = password.length >= 8 && confirm.length >= 1 && !isLoading && sessionReady;

  // ── Loading / error state ──────────────────────────────────────────────────
  if (!sessionReady && !sessionError) {
    return (
      <View style={[styles.screen, styles.center, { backgroundColor: colors.bg }]}>
        <Text style={[styles.glyph, { color: colors.violet }]}>◈</Text>
        <Text style={[styles.hintText, { color: colors.textDim, marginTop: 16 }]}>
          verifying reset link…
        </Text>
      </View>
    );
  }

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
        <Animated.View entering={FadeIn.duration(400)} style={styles.wrap}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.glyph, { color: colors.violet }]}>◈</Text>
            <Text style={[styles.title, { color: colors.text }]}>
              {done ? 'password\nupdated' : 'new\npassword'}
            </Text>
            <Text style={[styles.hint, { color: colors.textDim }]}>
              {sessionError
                ? sessionError
                : done
                ? 'you are being signed in…'
                : 'choose a strong password for your account'}
            </Text>
          </View>

          {/* Error state */}
          {sessionError && (
            <View style={styles.form}>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: colors.cyanDim, borderColor: colors.cyanBorder }]}
                onPress={() => router.replace('/signin')}
                activeOpacity={0.75}
              >
                <Text style={[styles.btnText, { color: colors.cyan }]}>back to sign in</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Success state */}
          {done && (
            <Animated.View entering={FadeIn.duration(400)} style={styles.form}>
              <View style={[styles.sentCard, { borderColor: colors.cyanBorder, backgroundColor: colors.cyanDim }]}>
                <Text style={[styles.sentIcon, { color: colors.cyan }]}>◎</Text>
                <Text style={[styles.sentText, { color: colors.text }]}>all set — welcome back</Text>
              </View>
            </Animated.View>
          )}

          {/* Password form */}
          {sessionReady && !done && (
            <View style={styles.form}>
              {/* New password */}
              <View style={[styles.inputRow, { borderColor: colors.glassBorder, backgroundColor: inputBg }]}>
                <TextInput
                  style={[styles.inputInner, { color: colors.text }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="new password"
                  placeholderTextColor={colors.textDim}
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                />
                <TouchableOpacity onPress={() => setShowPw(v => !v)} hitSlop={8} activeOpacity={0.6} style={styles.eyeBtn}>
                  <Text style={[styles.eyeText, { color: colors.textDim }]}>{showPw ? 'hide' : 'show'}</Text>
                </TouchableOpacity>
              </View>

              {/* Confirm */}
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.glassBorder, backgroundColor: inputBg }]}
                value={confirm}
                onChangeText={setConfirm}
                placeholder="confirm password"
                placeholderTextColor={colors.textDim}
                secureTextEntry={!showPw}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={updatePassword}
              />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <TouchableOpacity
                style={[styles.btn, {
                  backgroundColor: canSubmit ? colors.cyanDim : 'transparent',
                  borderColor: canSubmit ? colors.cyanBorder : colors.glassBorder,
                  marginTop: 4,
                }]}
                onPress={updatePassword}
                disabled={!canSubmit}
                activeOpacity={0.75}
              >
                <Text style={[styles.btnText, { color: canSubmit ? colors.cyan : colors.textDim }]}>
                  {isLoading ? 'updating…' : 'set new password'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => router.replace('/signin')} activeOpacity={0.65} style={styles.backBtn}>
                <Text style={[styles.backText, { color: colors.textDim }]}>← back to sign in</Text>
              </TouchableOpacity>
            </View>
          )}

        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 1, paddingHorizontal: 28 },
  wrap:   { flex: 1, paddingTop: 24, gap: 40 },

  header: { gap: 8 },
  glyph:  { fontSize: 44, lineHeight: 52, marginBottom: 8 },
  title:  { fontSize: 34, fontFamily: FONT, fontWeight: '300', lineHeight: 42, letterSpacing: -0.5 },
  hint:   { fontSize: 13, fontFamily: FONT, fontWeight: '300', letterSpacing: 0.2, lineHeight: 20, marginTop: 2 },
  hintText: { fontSize: 13, fontFamily: FONT, fontWeight: '300', letterSpacing: 0.2 },

  form: { gap: 12 },

  input: {
    fontSize: 15, fontFamily: FONT, fontWeight: '400',
    borderWidth: 0.5, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 0.5, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 4,
  },
  inputInner: { flex: 1, fontSize: 15, fontFamily: FONT, fontWeight: '400', paddingVertical: 9 },
  eyeBtn:     { paddingLeft: 10, paddingVertical: 6 },
  eyeText:    { fontSize: 11, fontFamily: FONT, fontWeight: '400', letterSpacing: 0.5 },

  btn: { borderRadius: 18, borderWidth: 0.5, paddingVertical: 16, alignItems: 'center' },
  btnText: { fontSize: 11, letterSpacing: 3, fontFamily: FONT, fontWeight: '500' },

  backBtn:  { alignSelf: 'center', paddingVertical: 8 },
  backText: { fontSize: 12, fontFamily: FONT, fontWeight: '300', letterSpacing: 0.2 },

  errorText: { fontSize: 12, fontFamily: FONT, color: '#e07070', textAlign: 'center', lineHeight: 18 },

  sentCard: { borderRadius: 16, borderWidth: 0.5, padding: 24, alignItems: 'center', gap: 10 },
  sentIcon: { fontSize: 28 },
  sentText: { fontSize: 14, fontFamily: FONT, fontWeight: '300', textAlign: 'center', lineHeight: 22 },
});
