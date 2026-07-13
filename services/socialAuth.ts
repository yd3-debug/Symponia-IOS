// Sign in with Apple + Google.
//
// Both go through Supabase's signInWithIdToken, which means the ID token is
// verified server-side against Apple/Google's public keys. We never see, store,
// or handle a password — which is the entire point, and also why this is the
// safest auth we can offer.
//
// ─────────────────────────────────────────────────────────────────────────────
// APPLE GUIDELINE 4.8 — READ BEFORE REMOVING EITHER OF THESE
// If the app offers Google sign-in, it MUST also offer Sign in with Apple.
// Shipping Google alone is an automatic rejection. They go together or not at
// all.
// ─────────────────────────────────────────────────────────────────────────────
//
// CREDENTIALS ARE NOT IN THIS FILE and never should be. Both providers are
// configured in the Supabase dashboard (Authentication → Providers). The Google
// iOS client ID is not a secret (it ships in the app binary regardless), but it
// still lives in app config rather than here.

import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import Constants from 'expo-constants';
import { supabase } from './supabase';

export class SocialAuthCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'SocialAuthCancelled';
  }
}

/** True only on a real iOS device/simulator running iOS 13+. */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Sign in with Apple.
 *
 * NOTE ON THE NAME: Apple gives you the user's real name EXACTLY ONCE — on the
 * very first authorisation, and never again, not even if the app is deleted and
 * reinstalled. If we don't capture it here it is gone forever. Symponia speaks to
 * people by name, so we take it now and let onboarding overwrite it if they'd
 * rather be called something else.
 */
export async function signInWithApple(): Promise<{ isNewUser: boolean; fullName: string | null }> {
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED') throw new SocialAuthCancelled();
    throw e;
  }

  if (!credential.identityToken) {
    throw new Error('Apple did not return an identity token.');
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;

  // First authorisation only — see note above.
  const given = credential.fullName?.givenName ?? '';
  const family = credential.fullName?.familyName ?? '';
  const fullName = `${given} ${family}`.trim() || null;

  return { isNewUser: isFreshUser(data), fullName };
}

/**
 * Sign in with Google.
 *
 * Requires the iOS client ID (configured via app.json → extra.googleIosClientId)
 * and, for Supabase to accept the token, the WEB client ID as the audience —
 * that's the one you paste into Supabase's Google provider settings.
 */
export async function signInWithGoogle(): Promise<{ isNewUser: boolean; fullName: string | null }> {
  const iosClientId = (Constants.expoConfig?.extra as any)?.googleIosClientId;
  const webClientId = (Constants.expoConfig?.extra as any)?.googleWebClientId;

  if (!iosClientId || !webClientId) {
    throw new Error(
      'Google sign-in is not configured. Set extra.googleIosClientId and extra.googleWebClientId in app.json.',
    );
  }

  GoogleSignin.configure({ iosClientId, webClientId });

  let idToken: string | null | undefined;
  try {
    await GoogleSignin.hasPlayServices();
    const res: any = await GoogleSignin.signIn();
    // v16 returns { type: 'success' | 'cancelled', data }
    if (res?.type === 'cancelled') throw new SocialAuthCancelled();
    idToken = res?.data?.idToken ?? res?.idToken;
  } catch (e: any) {
    if (e instanceof SocialAuthCancelled) throw e;
    if (e?.code === '-5' || /cancel/i.test(String(e?.message))) throw new SocialAuthCancelled();
    throw e;
  }

  if (!idToken) throw new Error('Google did not return an ID token.');

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });
  if (error) throw error;

  const meta: any = data.user?.user_metadata ?? {};
  const fullName: string | null = meta.full_name ?? meta.name ?? null;

  return { isNewUser: isFreshUser(data), fullName };
}

/**
 * Did this sign-in just CREATE the account, or sign into an existing one?
 *
 * Supabase doesn't hand us a flag, so we compare timestamps: on a brand-new user
 * created_at and last_sign_in_at are seconds apart. A returning user's created_at
 * is days or months old. The 10-second window is generous enough to absorb clock
 * skew and slow networks.
 *
 * This matters because a NEW user must go through onboarding (they have no
 * animals, no voice, no consent), while a returning one must go straight to the
 * app — sending a returning user back through intake would be maddening.
 */
function isFreshUser(data: { user: { created_at?: string; last_sign_in_at?: string | null } | null }): boolean {
  const u = data.user;
  if (!u?.created_at) return true; // fail toward onboarding, which is recoverable
  const created = new Date(u.created_at).getTime();
  const signedIn = u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : Date.now();
  return Math.abs(signedIn - created) < 10_000;
}
