// The agreement a person gives before Symponia does anything for them.
//
// Three separate, unticked boxes on components/revamp/BeforeWeBegin.tsx:
//   terms_age      18 or over, and agrees to the Terms and Privacy Policy
//   not_medical    understands this is an AI, not a person, not therapy or
//                  medical care, and cannot help in an emergency
//   ai_processing  agrees to their words being sent to Anthropic
//
// They are separate on purpose. Consent to send personal, possibly sensitive,
// writing to an AI provider has to be specific and freely given; folding it
// into "I agree to the Terms" would not be either.
//
// EVIDENCE. Each acceptance is written to consent_records with the wording
// version, the language it was shown in and the app version. The table lets a
// person add and read their own rows and nothing else, so a record cannot be
// altered afterwards. If the wording on the screen changes in any way that
// matters, bump CONSENT_VERSION: everyone is then asked again.
//
// The screen can be shown before an account exists. Acceptances made then are
// kept on the device and uploaded by flushPendingConsents() as soon as there is
// a session.

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { getLanguage } from '@/constants/i18n';
import { supabase } from './supabase';

export const CONSENT_VERSION = '2026-10-09';
export const BASIC_CONSENTS = ['terms_age', 'not_medical', 'ai_processing'] as const;
export type ConsentKind = (typeof BASIC_CONSENTS)[number] | 'voice';

const ACCEPTED = 'symponia_consent_version';
const PENDING = 'symponia_consent_pending';
// The flag the rest of the app, and the oracle function, already use.
const AI_CONSENT = 'symponia_ai_consent';

type Pending = { kind: ConsentKind; version: string; accepted: boolean; locale: string; app_version: string; accepted_at: string };

function row(kind: ConsentKind, accepted: boolean): Pending {
  return {
    kind,
    version: CONSENT_VERSION,
    accepted,
    locale: getLanguage(),
    app_version: Constants.expoConfig?.version ?? 'unknown',
    accepted_at: new Date().toISOString(),
  };
}

/** True only if the CURRENT wording has been accepted on this device. */
export async function hasAcceptedBasics(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ACCEPTED)) === CONSENT_VERSION;
  } catch {
    return false; // fail closed: if we cannot tell, ask again
  }
}

/** Call when all three boxes are ticked and the person presses Begin. */
export async function acceptBasics(): Promise<void> {
  await queue(BASIC_CONSENTS.map((kind) => row(kind, true)));
  try {
    await AsyncStorage.multiSet([[ACCEPTED, CONSENT_VERSION], [AI_CONSENT, 'true']]);
  } catch {}
  await flushPendingConsents();
}

/** Voice has its own screen; this records the answer either way. */
export async function recordVoiceConsent(accepted: boolean): Promise<void> {
  await queue([row('voice', accepted)]);
  await flushPendingConsents();
}

async function queue(rows: Pending[]): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PENDING);
    const existing: Pending[] = raw ? JSON.parse(raw) : [];
    await AsyncStorage.setItem(PENDING, JSON.stringify([...existing, ...rows]));
  } catch {}
}

/**
 * Uploads anything accepted before there was a session. Safe to call often:
 * it does nothing without a session or without pending rows, and keeps the
 * rows if the upload fails so they are tried again next time.
 */
export async function flushPendingConsents(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PENDING);
    const rows: Pending[] = raw ? JSON.parse(raw) : [];
    if (rows.length === 0) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('consent_records').insert(rows.map((r) => ({ ...r, user_id: user.id })));
    if (error) return;
    await AsyncStorage.removeItem(PENDING);

    if (rows.some((r) => r.kind === 'ai_processing' && r.accepted)) {
      await supabase.from('profiles').update({ ai_consent: true }).eq('user_id', user.id);
    }
  } catch {}
}
