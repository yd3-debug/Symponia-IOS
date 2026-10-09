import { THEMES, type ThemeId, useTheme } from '@/constants/ThemeContext';
import { TRIAL_TOKENS, SUPABASE_URL } from '@/constants/config';
import { ANIMAL_ARCHETYPES } from '@/constants/systemPrompt';
import { supabase } from '@/services/supabase';
import * as Notifications from 'expo-notifications';
import { requestNotificationPermission, scheduleDaily, scheduleMonthly, scheduleWeekly, topUpDailyReflections } from '@/services/notifications';
import { restorePurchases, verifyAndFinishPurchase, initIAP, fetchStoreSubscriptions, triggerSubscription, SUBSCRIPTION_PRODUCTS, type ProductPurchase, type SubscriptionProductId } from '@/services/iap';
import { clearAllConversations } from '@/services/conversations';
import { setMemoryEnabled, syncMemoryFlag } from '@/services/memory';
import { t, getLocale, LANGUAGES, getLanguage, useT, type Lang } from '@/constants/i18n';
import { saveLanguage } from '@/services/language';
import { checkSubscription, getActivePlanId, syncTokens } from '@/services/supabaseTokens';
import { fetchUsage, type Usage } from '@/services/usage';
import { MoodWeek } from '@/components/MoodWeek';
import { fetchMoodWeek, type MoodRow } from '@/services/mood';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CoachTips, useFirstTip, resetAllTips } from '@/components/CoachTip';
import {
  Alert,
  AppState,
  Image,
  Keyboard,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '@/components/Text';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ── Animal name → emoji lookup ────────────────────────────────────────────────

const ANIMAL_EMOJI: Record<string, string> = {
  // Big cats & canines
  Lion: '🦁', Tiger: '🐅', Leopard: '🐆', Panther: '🐈‍⬛', Wolf: '🐺', Fox: '🦊', Dog: '🐕', Cat: '🐈',
  // Bears & primates
  Bear: '🐻', Panda: '🐼', Koala: '🐨', Gorilla: '🦍',
  // Hooved
  Horse: '🐎', Deer: '🦌', Bison: '🦬', Giraffe: '🦒', Zebra: '🦓',
  Elephant: '🐘', Rhino: '🦏', Hippo: '🦛', Boar: '🐗', Kangaroo: '🦘',
  // Small mammals
  Raccoon: '🦝', Otter: '🦦', Badger: '🦡', Hedgehog: '🦔',
  Rabbit: '🐇', Squirrel: '🐿️', Beaver: '🦫', Bat: '🦇',
  // Birds
  Eagle: '🦅', Owl: '🦉', Peacock: '🦚', Parrot: '🦜',
  Crow: '🐦‍⬛', Flamingo: '🦩', Swan: '🦢', Dove: '🕊️', Penguin: '🐧',
  // Sea creatures
  Whale: '🐋', Dolphin: '🐬', Shark: '🦈', Octopus: '🐙', Seal: '🦭',
  // Reptiles & amphibians
  Snake: '🐍', Crocodile: '🐊', Turtle: '🐢', Lizard: '🦎', Frog: '🐸',
  // Insects & arachnids
  Butterfly: '🦋', Bee: '🐝', Spider: '🕷️', Scorpion: '🦂',
  // Legacy aliases
  Cheetah: '🐆',
};

const ZOO_LABELS = ['dominant', '2nd', '3rd', 'bridge', 'bridge', 'threshold', 'shadow'];

// ── Frequency config ──────────────────────────────────────────────────────────

const FREQUENCIES = ['Quiet', 'Intellectual', 'Deeply Emotional'] as const;
type Frequency = typeof FREQUENCIES[number];

const FREQ_CONFIG: Record<Frequency, { color: string; desc: string; label: string }> = {
  Quiet:              { color: '#6BB87A', desc: 'silence · few words · the heron simply waits',   label: 'still' },
  Intellectual:       { color: '#9B7FE8', desc: 'structure · depth · the eagle holds the long view', label: 'precise' },
  'Deeply Emotional': { color: '#C084FC', desc: 'presence · imagery · the snake sheds its skin',  label: 'felt' },
};

const GENDER_LABELS: Record<string, string> = {
  'he/him':           'he / him',
  'she/her':          'she / her',
  'they/them':        'they / them',
  'prefer not to say': 'prefer not to say',
};

// ── Apple-style Toggle ────────────────────────────────────────────────────────

function Toggle({ value, onValueChange }: { value: boolean; onValueChange: () => void }) {
  const { colors } = useTheme();
  const progress = useSharedValue(value ? 1 : 0);

  React.useEffect(() => {
    progress.value = withSpring(value ? 1 : 0, { damping: 18, stiffness: 280 });
  }, [value, progress]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * 20 }],
  }));

  return (
    <TouchableOpacity onPress={onValueChange} activeOpacity={0.85} hitSlop={8}>
      <View style={[
        styles.toggleTrack,
        { backgroundColor: value ? colors.cyanDim : colors.glass, borderColor: value ? colors.cyanBorder : colors.glassBorder },
      ]}>
        <Animated.View style={[styles.toggleThumb, thumbStyle, { backgroundColor: value ? colors.cyan : colors.textDim }]} />
      </View>
    </TouchableOpacity>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ children, index }: { children: React.ReactNode; index: number }) {
  return (
    <Animated.View entering={FadeInDown.duration(260).delay(index * 50)}>
      {children}
    </Animated.View>
  );
}

/**
 * A quiet heading that breaks the settings list into groups.
 *
 * Twelve cards in a single column is a wall — everything looks equally
 * important, so nothing does. These four headings give the page a shape:
 * what you're using, who you are, how it behaves, and the way out.
 */
function GroupHeading({ label, first }: { label: string; first?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: first ? 4 : 26, marginBottom: 8, paddingHorizontal: 4 }}>
      <Text
        style={{
          fontSize: 11,
          fontFamily: FONT,
          fontWeight: '600',
          letterSpacing: 1.6,
          color: colors.cyan,
          opacity: 0.75,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

// ── AI Consent Row ────────────────────────────────────────────────────────────

function AIConsentRow({ colors }: { colors: any }) {
  const [status, setStatus] = React.useState<string | null>(null);

  React.useEffect(() => {
    AsyncStorage.getItem('symponia_ai_consent').then(setStatus);
  }, []);

  // While still loading (null), treat as consented so we don't flash a warning.
  const consented = status === null || status === 'true';

  const enable = async () => {
    await AsyncStorage.setItem('symponia_ai_consent', 'true');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) await supabase.from('profiles').update({ ai_consent: true }).eq('user_id', session.user.id);
    } catch {}
    setStatus('true');
  };
  const revoke = async () => {
    await AsyncStorage.setItem('symponia_ai_consent', 'revoked');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) await supabase.from('profiles').update({ ai_consent: false }).eq('user_id', session.user.id);
    } catch {}
    setStatus('revoked');
  };

  const toggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!consented) {
      Alert.alert(
        t('Turn on AI processing?'),
        t("Symponia will send your messages to Anthropic's Claude to generate your reflections."),
        [{ text: t('cancel'), style: 'cancel' }, { text: t('turn on'), onPress: enable }],
      );
    } else {
      Alert.alert(
        t('Revoke AI processing consent?'),
        t("This turns off chat and reflections — your messages will no longer be sent to Anthropic's Claude. You can turn it back on here anytime."),
        [{ text: t('cancel'), style: 'cancel' }, { text: t('revoke'), style: 'destructive', onPress: revoke }],
      );
    }
  };

  return (
    <TouchableOpacity
      onPress={toggle}
      activeOpacity={0.75}
      style={{
        borderWidth: 0.5,
        borderRadius: 14,
        paddingVertical: 13,
        paddingHorizontal: 14,
        borderColor: consented ? colors.glassBorder : 'rgba(224,112,112,0.5)',
        backgroundColor: consented ? 'transparent' : 'rgba(224,112,112,0.08)',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: consented ? colors.green : '#e07070' }} />
        <Text style={{ fontSize: 13, fontFamily: FONT, fontWeight: '500', color: consented ? colors.text : '#c75a5a' }}>
          {consented ? 'AI processing is on' : 'AI processing is off'}
        </Text>
      </View>
      <Text style={{ fontSize: 12, fontFamily: FONT, fontWeight: '400', lineHeight: 18, color: colors.textSub }}>
        {consented
          ? "Symponia sends your messages to Anthropic's Claude to create your reflections. You can revoke this anytime."
          : "Chat and daily reflections won't work while this is off — your messages can't be sent to Anthropic's Claude. You can turn it back on right here."}
      </Text>
      <Text style={{ fontSize: 12, fontFamily: FONT, fontWeight: '500', letterSpacing: 0.3, marginTop: 9, color: colors.cyan }}>
        {consented ? 'revoke consent →' : 'turn on AI processing →'}
      </Text>
    </TouchableOpacity>
  );
}

// ── Profile Screen ────────────────────────────────────────────────────────────

export default function ProfiloScreen() {
  const insets = useSafeAreaInsets();
  const { themeId, colors, setTheme } = useTheme();

  const [name, setName] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [editingName, setEditingName] = useState(false);

  const [gender, setGender] = useState('');

  const [frequency, setFrequency] = useState<Frequency>('Intellectual');

  const [notifDaily,   setNotifDaily]   = useState(false);
  const [notifWeekly,  setNotifWeekly]  = useState(false);
  const [notifMonthly, setNotifMonthly] = useState(false);

  const [tokens, setTokens] = useState(TRIAL_TOKENS);
  const [isSubscribed, setIsSubscribed] = useState(false);
  // Which plan they're actually on. Null while loading or when not subscribed;
  // the UI falls back to the monthly copy, which is what every existing
  // subscriber is on, so nothing regresses for them.
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  // Fair-use window for subscribers. Null while loading / on failure — Settings
  // then simply renders nothing rather than showing a wrong number.
  const [usage, setUsage] = useState<Usage | null>(null);
  const [moodRows, setMoodRows] = useState<MoodRow[]>([]);
  const activePlan = activePlanId
    ? SUBSCRIPTION_PRODUCTS.find((p) => p.id === activePlanId) ?? null
    : null;
  const [subscriptionExpiry, setSubscriptionExpiry] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);
  const [isPurchasingSub, setIsPurchasingSub] = useState(false);
  const [subProducts, setSubProducts] = useState<{ productId: string; localizedPrice: string; trialDays: number | null }[]>([]);
  const [pricesError, setPricesError] = useState(false);
  const [userAnimals, setUserAnimals] = useState<string[]>([]);
  const [userEmail, setUserEmail] = useState('');
  const [memoryOn, setMemoryOn] = useState(false);
  const [lang, setLangState] = useState<Lang>(getLanguage());
  useT(); // re-render this screen when the language changes
  const archRef = useRef<View>(null);
  const settingsTip = useFirstTip('settings');

  // Signed-in email — read from the user's own local auth session, never a lookup,
  // so it is only ever their own address (private to this device/account).
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setUserEmail(data.session?.user?.email ?? '');
    });
    syncMemoryFlag().then((on) => { if (active) setMemoryOn(on); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserEmail(session?.user?.email ?? '');
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  const toggleMemory = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!memoryOn) {
      Alert.alert(
        t('Turn on memory?'),
        t('Symponia will store your reflections securely so it can remember your journey and get to know you over time. Your reflections are never used to train AI, and you can turn this off and delete everything anytime.'),
        [
          { text: t('not now'), style: 'cancel' },
          {
            text: t('turn on'),
            onPress: async () => {
              await setMemoryEnabled(true);
              setMemoryOn(true);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            },
          },
        ],
      );
    } else {
      Alert.alert(
        t('Turn off memory?'),
        t('Symponia will stop storing new reflections. Would you also like to delete everything already stored?'),
        [
          { text: t('cancel'), style: 'cancel' },
          {
            text: t('turn off, keep stored'),
            onPress: async () => { await setMemoryEnabled(false); setMemoryOn(false); },
          },
          {
            text: t('turn off and delete'),
            style: 'destructive',
            onPress: async () => {
              await setMemoryEnabled(false);
              await clearAllConversations();
              setMemoryOn(false);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            },
          },
        ],
      );
    }
  };

  const loadPrices = useCallback(() => {
    setPricesError(false);
    const timeoutId = setTimeout(() => setPricesError(true), 8000);
    initIAP()
      .then(() => fetchStoreSubscriptions())
      .then((subs) => {
        clearTimeout(timeoutId);
        setSubProducts(subs);
      })
      .catch(() => { clearTimeout(timeoutId); setPricesError(true); });
  }, []);

  useEffect(() => {
    AsyncStorage.multiGet([
      'symponia_name',
      'symponia_gender',
      'symponia_frequency',
      'symponia_notif_daily',
      'symponia_notif_weekly',
      'symponia_notif_monthly',
      'symponia_tokens',
      'symponia_animals',
      'symponia_subscription_expires',
    ]).then((pairs) => {
      const map = Object.fromEntries(pairs.map(([k, v]) => [k, v ?? '']));
      if (map.symponia_name)      setName(map.symponia_name);
      if (map.symponia_gender)    setGender(map.symponia_gender);
      if (map.symponia_frequency) setFrequency(map.symponia_frequency as Frequency);
      setNotifDaily(map.symponia_notif_daily === 'true');
      setNotifWeekly(map.symponia_notif_weekly === 'true');
      setNotifMonthly(map.symponia_notif_monthly === 'true');
      if (map.symponia_tokens) setTokens(parseInt(map.symponia_tokens, 10));
      if (map.symponia_animals) setUserAnimals(JSON.parse(map.symponia_animals));
      if (map.symponia_subscription_expires) setSubscriptionExpiry(map.symponia_subscription_expires);
    });
    checkSubscription().then(setIsSubscribed);
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkSubscription().then((subscribed) => {
          setIsSubscribed(subscribed);
          if (!subscribed) {
            setTimeout(() => {
              checkSubscription().then(setIsSubscribed);
            }, 1500);
          }
        });
      }
    });
    initIAP().catch(() => {}).finally(() => loadPrices());
    return () => appStateSub.remove();
  }, []);

  useFocusEffect(useCallback(() => {
    Promise.all([
      checkSubscription(),
      AsyncStorage.getItem('symponia_subscription_expires'),
      getActivePlanId(),
      fetchUsage(),
      fetchMoodWeek(),
    ]).then(([subscribed, expires, planId, u, mood]) => {
      setIsSubscribed(subscribed);
      if (expires) setSubscriptionExpiry(expires);
      setActivePlanId(planId);
      setUsage(u);
      setMoodRows(mood);
    });
  }, []));

  // iOS only ever presents the notification permission alert once. If it was
  // already denied, requestNotificationPermission() comes back 'blocked' and no
  // dialog will ever appear again — so the toggle would just flick back off with
  // no explanation. Send them to iOS Settings instead of failing silently.
  const explainBlocked = () => {
    Alert.alert(
      t('Notifications are turned off'),
      t('Notifications for Symponia are turned off in iOS Settings, so iOS will not ask again. You can turn them on there whenever you like.'),
      [
        { text: t('Not now'), style: 'cancel' },
        { text: t('Open Settings'), onPress: () => Linking.openSettings() },
      ],
    );
  };

  const toggleNotif = async (
    type: 'daily' | 'weekly' | 'monthly',
    current: boolean,
    setter: (v: boolean) => void,
    scheduler: (enabled: boolean) => Promise<void>,
  ) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = !current;
    if (next) {
      if (type === 'daily') {
        // Show in-app pre-prompt before the iOS system dialog
        Alert.alert(
          t("A daily notification, if you'd like one."),
          t('Once a day, Symponia can send a short, centering thought shaped by your archetype. Nothing else.'),
          [
            { text: t('Not now'), style: 'cancel' },
            {
              text: t('Yes, please'),
              onPress: async () => {
                const result = await requestNotificationPermission();
                if (result === 'blocked') { explainBlocked(); return; }
                if (result !== 'granted') return;
                setter(true);
                AsyncStorage.setItem('symponia_notif_daily', 'true');
                scheduler(true);
              },
            },
          ],
        );
        return;
      }
      const result = await requestNotificationPermission();
      if (result === 'blocked') { explainBlocked(); return; }
      if (result !== 'granted') return;
    }
    setter(next);
    AsyncStorage.setItem(`symponia_notif_${type}`, String(next));
    scheduler(next);
  };

  const devRegenerateReflections = async () => {
    try {
      const existing = await Notifications.getAllScheduledNotificationsAsync();
      await Promise.all(
        existing
          .filter((n) => n.identifier.startsWith('symponia-drefl-'))
          .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})),
      );
      const [animalsRaw, name, frequency] = await Promise.all([
        AsyncStorage.getItem('symponia_animals'),
        AsyncStorage.getItem('symponia_name'),
        AsyncStorage.getItem('symponia_frequency'),
      ]);
      const animals: string[] = animalsRaw ? JSON.parse(animalsRaw) : [];
      await topUpDailyReflections({ name: name ?? undefined, animals, frequency: frequency ?? undefined });
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      const drefl = scheduled.filter((n) => n.identifier.startsWith('symponia-drefl-'));
      const tomorrowKey = (() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return d.toISOString().split('T')[0];
      })();
      const body =
        drefl.find((n) => n.identifier === `symponia-drefl-${tomorrowKey}`)?.content.body ??
        drefl[0]?.content.body ??
        '(none generated)';
      Alert.alert(t("Tomorrow's reflection"), body);
    } catch (err: any) {
      Alert.alert(t('Generation failed'), err?.message ?? String(err));
    }
  };

  const saveName = () => {
    const trimmed = nameInput.trim();
    setName(trimmed);
    AsyncStorage.setItem('symponia_name', trimmed);
    setEditingName(false);
    Keyboard.dismiss();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const selectFrequency = (f: Frequency) => {
    setFrequency(f);
    // Clear daily reading cache so it regenerates with the new tone on next app open
    AsyncStorage.multiSet([
      ['symponia_frequency', f],
      ['symponia_daily_date', ''],
    ]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleRestore = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsRestoring(true);
    try {
      await initIAP();
      const purchases = await restorePurchases();
      console.log(`[Restore] getAvailablePurchases returned ${purchases.length} purchase(s)`);
      if (purchases.length === 0) {
        Alert.alert(t('Nothing to restore'), t('No previous purchases found for this Apple ID.'));
        setIsRestoring(false);
        return;
      }
      let restored = false;
      for (const purchase of purchases) {
        console.log(`[Restore] verifying ${purchase.productId} txId:${purchase.transactionId ?? 'n/a'}`);
        try {
          const result = await verifyAndFinishPurchase(purchase as any);
          console.log(`[Restore] ✓ ${purchase.productId} → ${result.type}`);
          if (result.type === 'subscription') {
            setIsSubscribed(true);
            setSubscriptionExpiry(result.expiresAt);
            await AsyncStorage.multiSet([
              ['symponia_subscribed', 'true'],
              ['symponia_subscription_expires', result.expiresAt],
            ]);
          } else if (result.type === 'consumable') {
            const next = tokens + result.tokensAdded;
            setTokens(next);
            await AsyncStorage.setItem('symponia_tokens', String(next));
          }
          restored = true;
        } catch (e: any) {
          console.log(`[Restore] ✗ ${purchase.productId} failed:`, e?.message ?? e);
        }
      }
      if (restored) {
        const count = await syncTokens();
        setTokens(count);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      Alert.alert(restored ? 'Restored' : 'Nothing to restore', restored ? 'Your purchases have been restored.' : 'No purchases could be verified.');
    } catch (e: any) {
      Alert.alert(t('Restore failed'), e?.message ?? 'Something went wrong.');
    } finally {
      setIsRestoring(false);
    }
  };

  const handleSubscribe = async (productId: SubscriptionProductId) => {
    if (isPurchasingSub) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsPurchasingSub(true);
    try {
      await triggerSubscription(productId);
    } catch (e: any) {
      Alert.alert(t('Purchase failed'), e?.message ?? 'Something went wrong.');
    } finally {
      setIsPurchasingSub(false);
    }
  };



  const cardBg = colors.glassStrong;
  const cardStyle = [styles.card, { borderColor: colors.glassBorder }];

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <Animated.View entering={FadeIn.duration(500)} style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.cyan }]}>PROFILE</Text>
        </Animated.View>

        {/* ── NAME ── */}
        {/* The mood week. First thing in Settings, above even usage — it is the
            only screen that answers "is this actually helping me?" */}
        <GroupHeading label={t('HOW YOU ARE')} first />
        <Section index={0}>
          <View style={cardStyle}>
            <View style={[styles.cardBg, { backgroundColor: cardBg }]} />
            <View style={[styles.cardBorderTop, { backgroundColor: colors.glassBorderStrong }]} />
            <View style={styles.cardPad}>
              <Text style={[styles.sectionLabel, { color: colors.textDim }]}>{t('THIS WEEK')}</Text>
              <View style={{ marginTop: 12 }}>
                <MoodWeek rows={moodRows} />
              </View>
            </View>
          </View>
        </Section>

        <GroupHeading label={t('YOUR PLAN')} />
        <Section index={0}>
          <View style={cardStyle}>
            <View style={[styles.cardBg, { backgroundColor: cardBg }]} />
            <View style={[styles.cardBorderTop, { backgroundColor: colors.glassBorderStrong }]} />
            <View style={styles.cardPad}>
              <Text style={[styles.sectionLabel, { color: colors.textDim }]}>{t('SYMPONIA · USAGE')}</Text>

              {/* SUBSCRIBER: a usage window, in the shape Claude reports its own.
                  Never a balance. The bar is informational — it says "here is how
                  much you've leaned on this", not "here is what you have left". */}
              {isSubscribed && usage?.subscribed && (
                <View style={{ marginTop: 6 }}>
                  <View style={[styles.tokenTrack, { marginBottom: 6 }]}>
                    <View style={[styles.tokenFill, {
                      width: `${Math.min(usage.used / usage.limit, 1) * 100}%`,
                      backgroundColor: colors.cyan + 'CC',
                    }]} />
                  </View>
                  <Text style={[styles.tokenBarLabel, { color: colors.cyan + 'AA' }]}>
                    {t('{n} reflections this week', { n: usage.used })}
                  </Text>
                  <Text style={[styles.tokenPackNote, { color: colors.textDim, marginTop: 6 }]}>
                    {t('Unlimited · Archetype · My Day · Conversation')}
                  </Text>
                  {usage.renewsAt && (
                    <Text style={[styles.tokenPackNote, { color: colors.textDim, marginTop: 2 }]}>
                      {t('Renews {date}', {
                        date: new Date(usage.renewsAt).toLocaleDateString(getLocale(), {
                          day: 'numeric', month: 'long',
                        }),
                      })}
                    </Text>
                  )}
                </View>
              )}

              {/* TRIAL: the one place a count still honestly belongs. */}
              {!isSubscribed && (
                <View style={{ marginTop: 6 }}>
                  <View style={[styles.tokenTrack, { marginBottom: 6 }]}>
                    <View style={[styles.tokenFill, {
                      width: `${Math.min(tokens / TRIAL_TOKENS, 1) * 100}%`,
                      backgroundColor: tokens <= 3 ? '#e07070CC' : colors.cyan + 'CC',
                    }]} />
                  </View>
                  <Text style={[styles.tokenBarLabel, { color: tokens <= 3 ? '#e07070AA' : colors.cyan + 'AA' }]}>
                    {tokens === 1 ? t('1 FREE REFLECTION LEFT') : t('{n} FREE REFLECTIONS LEFT', { n: tokens })}
                  </Text>
                </View>
              )}

              {!isSubscribed && (
                <Text style={[styles.tokenPackNote, { color: colors.textDim, marginTop: 10 }]}>
                  {t('Subscribe to reflect as often as you need.')}
                </Text>
              )}
            </View>
          </View>
        </Section>

        <Section index={1}>
          <View style={cardStyle}>
            <View style={[styles.cardBg, { backgroundColor: cardBg }]} />
            <View style={[styles.cardBorderTop, { backgroundColor: colors.glassBorderStrong }]} />
            <View style={styles.cardPad}>
              <Text style={[styles.sectionLabel, { color: colors.textDim }]}>SUBSCRIPTION</Text>

              {/* Status row */}
              <View style={[styles.rowBetween, { marginBottom: 16 }]}>
                <Text style={[styles.settingLabel, { color: colors.textSub }]}>status</Text>
                {isSubscribed ? (
                  <View style={styles.subBadgeActive}>
                    <Text style={[styles.subBadgeText, { color: colors.cyan }]}>premium</Text>
                  </View>
                ) : (
                  <Text style={[styles.settingLabel, { color: colors.textDim }]}>no active plan</Text>
                )}
              </View>

              {/* Expiry */}
              {isSubscribed && subscriptionExpiry ? (
                <Text style={[styles.subExpiry, { color: colors.textDim, marginBottom: 16 }]}>
                  {t('renews · {date}', {
                    date: new Date(subscriptionExpiry).toLocaleDateString(getLocale(), {
                      day: 'numeric', month: 'long', year: 'numeric',
                    }),
                  })}
                </Text>
              ) : null}

              {/* Subscribe buttons — shown when not subscribed */}
              {!isSubscribed && SUBSCRIPTION_PRODUCTS.map((sub) => {
                const storeInfo = subProducts.find((p) => p.productId === sub.id);
                const loading = !pricesError && !storeInfo;
                const priceLabel = pricesError ? 'tap to retry' : (storeInfo?.localizedPrice || '…');
                const priceForLegalText = pricesError ? '—' : (storeInfo?.localizedPrice || '…');
                const isWeekly = sub.id.endsWith('.weekly');
                // Trial comes from the STORE, never hardcoded. If the intro offer
                // isn't configured, this is null and we quietly show the price —
                // we never advertise a trial Apple wouldn't actually grant.
                const trialDays = storeInfo?.trialDays ?? null;
                return (
                  <React.Fragment key={sub.id}>
                    <Text style={[styles.subDescription, { color: colors.textSub }]}>
                      {t(sub.nameKey)}
                    </Text>
                    <Text style={[styles.subFeatureList, { color: colors.textDim }]}>
                      {t(sub.pitchKey)}
                    </Text>
                    <TouchableOpacity
                      style={[styles.subBtn, { borderColor: isPurchasingSub ? colors.glassBorder : colors.cyan, backgroundColor: isPurchasingSub ? 'transparent' : colors.cyan + '22', marginBottom: 4 }]}
                      onPress={pricesError ? loadPrices : () => handleSubscribe(sub.id as SubscriptionProductId)}
                      disabled={isPurchasingSub || loading}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.subBtnText, { color: isPurchasingSub ? colors.textDim : colors.cyan }]}>
                        {isPurchasingSub
                          ? t('processing…')
                          : pricesError
                            ? t('tap to retry')
                            : trialDays
                              ? t('Start {n} days free', { n: trialDays })
                              : t('Subscribe')}
                      </Text>
                    </TouchableOpacity>
                    {/* The button carries no number — but Apple (3.1.2) requires the
                        real price and renewal terms ADJACENT to the purchase control.
                        So the price lives here, quietly, and must never be removed:
                        strip it and the subscription is rejected. */}
                    <Text style={[styles.subRenewalNote, { color: colors.textDim }]}>
                      {trialDays
                        ? t('Then {price} / {period}. Cancel anytime before it ends and you are not charged.', {
                            price: priceForLegalText,
                            period: t(isWeekly ? 'week' : 'month'),
                          })
                        : t('{price} / {period} · auto-renews · cancel anytime in App Store Settings', {
                            price: priceForLegalText,
                            period: t(isWeekly ? 'week' : 'month'),
                          })}
                    </Text>
                    {/* Legal links adjacent to purchase button — required by Apple */}
                    <View style={[styles.subLegalInline]}>
                      <TouchableOpacity onPress={() => Linking.openURL('https://symponia.io/privacy')} activeOpacity={0.7}>
                        <Text style={[styles.subLegalLink, { color: colors.textDim }]}>privacy policy</Text>
                      </TouchableOpacity>
                      <Text style={[styles.subLegalSep, { color: colors.textDim }]}>·</Text>
                      <TouchableOpacity onPress={() => Linking.openURL('https://symponia.io/terms')} activeOpacity={0.7}>
                        <Text style={[styles.subLegalLink, { color: colors.textDim }]}>terms of use</Text>
                      </TouchableOpacity>
                    </View>
                  </React.Fragment>
                );
              })}

              {/* Restore purchases */}
              <TouchableOpacity
                style={[styles.subBtn, { borderColor: isRestoring ? colors.glassBorder : colors.cyanBorder, backgroundColor: isRestoring ? 'transparent' : colors.cyanDim }]}
                onPress={handleRestore}
                disabled={isRestoring}
                activeOpacity={0.75}
              >
                <Text style={[styles.subBtnText, { color: isRestoring ? colors.textDim : colors.cyan }]}>
                  {isRestoring ? 'restoring…' : 'restore purchases'}
                </Text>
              </TouchableOpacity>

              {/* Manage in App Store — only relevant when subscribed */}
              {isSubscribed && (
                <TouchableOpacity
                  style={[styles.linkRow, { marginTop: 8 }]}
                  onPress={() => Linking.openURL('itms-apps://apps.apple.com/account/subscriptions')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.linkText, { color: colors.textSub }]}>manage in App Store</Text>
                  <Text style={[styles.linkChevron, { color: colors.textDim }]}>›</Text>
                </TouchableOpacity>
              )}

              {/* Required legal links */}
              <View style={[styles.subLegalRow, { borderTopColor: colors.glassBorder }]}>
                <TouchableOpacity
                  onPress={() => Linking.openURL('https://symponia.io/privacy')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.subLegalLink, { color: colors.textDim }]}>privacy policy</Text>
                </TouchableOpacity>
                <Text style={[styles.subLegalSep, { color: colors.textDim }]}>·</Text>
                <TouchableOpacity
                  onPress={() => Linking.openURL('https://symponia.io/terms')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.subLegalLink, { color: colors.textDim }]}>terms of use</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Section>

        <GroupHeading label={t('YOU')} />

        <Section index={2}>
          <View style={cardStyle}>
            <View style={[styles.cardBg, { backgroundColor: cardBg }]} />
            <View style={[styles.cardBorderTop, { backgroundColor: colors.glassBorderStrong }]} />
            <View style={styles.cardPad}>
              <Text style={[styles.sectionLabel, { color: colors.textDim }]}>YOUR NAME</Text>
              {editingName ? (
                <View style={styles.inlineRow}>
                  <TextInput
                    style={[styles.inlineInput, { color: colors.text, borderColor: colors.glassBorder }]}
                    value={nameInput}
                    onChangeText={setNameInput}
                    placeholder={t("your name...")}
                    placeholderTextColor={colors.textDim}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={saveName}
                  />
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: colors.cyanDim, borderColor: colors.cyanBorder }]}
                    onPress={saveName}
                  >
                    <Text style={[styles.smallBtnText, { color: colors.cyan }]}>✓</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => { setNameInput(name); setEditingName(true); }}>
                  <Text style={[styles.nameDisplay, { color: name ? colors.text : colors.textDim }]}>
                    {name || 'tap to set your name'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Section>

        <Section index={3}>
          <View style={cardStyle}>
            <View style={[styles.cardBg, { backgroundColor: cardBg }]} />
            <View style={[styles.cardBorderTop, { backgroundColor: colors.glassBorderStrong }]} />
            <View style={[styles.cardPad, styles.rowBetween]}>
              <Text style={[styles.sectionLabel, { color: colors.textDim }]}>PRONOUNS</Text>
              <TouchableOpacity
                onPress={() => router.navigate('/onboarding')}
                activeOpacity={0.7}
              >
                <Text style={[styles.genderValue, { color: gender ? colors.text : colors.textDim }]}>
                  {gender ? (GENDER_LABELS[gender] ?? gender) : 'not set'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Section>

          <Section index={4}>
            <View ref={archRef} collapsable={false} style={cardStyle}>
              <View style={[styles.cardBg, { backgroundColor: cardBg }]} />
              <View style={[styles.cardBorderTop, { backgroundColor: colors.glassBorderStrong }]} />
              <View style={styles.cardPad}>
                <Text style={[styles.sectionLabel, { color: colors.textDim }]}>YOUR ARCHETYPES</Text>
                <Text style={[styles.sectionSub, { color: colors.textDim, marginBottom: 6 }]}>
                  the seven that shape how Symponia reflects with you
                </Text>
                {userAnimals.map((animal, i) => {
                  const isShadow = i === 6;
                  const emoji = ANIMAL_EMOJI[animal] ?? ANIMAL_EMOJI[animal.charAt(0).toUpperCase() + animal.slice(1).toLowerCase()] ?? '🐾';
                  return (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7 }}>
                      <Text style={{ fontSize: 22 }}>{emoji}</Text>
                      {/* The animal's name is DATA in the database ('wolf'), but a
                          NAME on screen. Translate the display form only — never the
                          stored value, or every lookup keyed on it would break. */}
                      <Text style={{ flex: 1, fontSize: 14, fontFamily: FONT, fontWeight: '400', color: colors.text }}>
                        {t(animal.charAt(0).toUpperCase() + animal.slice(1).toLowerCase())}
                      </Text>
                      <Text style={{ fontSize: 11, fontFamily: FONT, fontWeight: '400', letterSpacing: 0.5, color: isShadow ? colors.violet : colors.textDim }}>
                        {ZOO_LABELS[i]}
                      </Text>
                    </View>
                  );
                })}
                <TouchableOpacity
                  onPress={() => router.navigate('/archetype')}
                  activeOpacity={0.7}
                  style={[styles.zooUpdateBtn, { marginTop: 12 }]}
                >
                  <Text style={[styles.zooUpdateText, { color: colors.cyan }]}>view your archetype →</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => router.navigate('/update-animals')}
                  activeOpacity={0.7}
                  style={[styles.zooUpdateBtn, { marginTop: 6 }]}
                >
                  <Text style={[styles.zooUpdateText, { color: colors.textSub }]}>update animals →</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Section>

        <Section index={5}>
          <View style={cardStyle}>
            <View style={[styles.cardBg, { backgroundColor: cardBg }]} />
            <View style={[styles.cardBorderTop, { backgroundColor: colors.glassBorderStrong }]} />
            <View style={styles.cardPad}>
              <Text style={[styles.sectionLabel, { color: colors.textDim }]}>RESONANCE FREQUENCY</Text>
              <Text style={[styles.sectionSub, { color: colors.textDim }]}>
                how shall symponia speak to you
              </Text>
              <View style={styles.freqList}>
                {([ 'Deeply Emotional', 'Intellectual', 'Quiet' ] as Frequency[]).map((f) => {
                  const active = f === frequency;
                  const fc = FREQ_CONFIG[f];
                  return (
                    <TouchableOpacity
                      key={f}
                      style={[
                        styles.freqOption,
                        { borderColor: active ? colors.cyanBorder : colors.glassBorder },
                        active && { backgroundColor: colors.cyanDim },
                      ]}
                      onPress={() => selectFrequency(f)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.freqOptionTop}>
                        <View style={[styles.radioOuter, { borderColor: active ? colors.cyan : colors.textDim }]}>
                          {active && <View style={[styles.radioInner, { backgroundColor: colors.cyan }]} />}
                        </View>
                        <Text style={[styles.freqOptionLabel, { color: active ? colors.text : colors.textSub }]}>
                          {fc.label}
                        </Text>
                      </View>
                      <Text style={[styles.freqOptionDesc, { color: active ? colors.textSub : colors.textDim }]}>
                        {fc.desc}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        </Section>

        <Section index={6}>
          <View style={cardStyle}>
            <View style={[styles.cardBg, { backgroundColor: cardBg }]} />
            <View style={[styles.cardBorderTop, { backgroundColor: colors.glassBorderStrong }]} />
            <View style={styles.cardPad}>
              <Text style={[styles.sectionLabel, { color: colors.textDim }]}>LANGUAGE</Text>
              <Text style={[styles.sectionSub, { color: colors.textDim }]}>
                Symponia speaks with you in this language
              </Text>
              <View style={styles.langGrid}>
                {LANGUAGES.map((l) => {
                  const active = lang === l.code;
                  return (
                    <TouchableOpacity
                      key={l.code}
                      style={[
                        styles.langBubble,
                        { borderColor: active ? colors.cyanBorder : colors.glassBorder },
                        active && { backgroundColor: colors.cyanDim },
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setLangState(l.code);
                        saveLanguage(l.code);
                        // Weekly/monthly bodies are baked in at schedule time, so a
                        // language change must re-cut them or they fire in the old one.
                        scheduleWeekly(notifWeekly).catch(() => {});
                        scheduleMonthly(notifMonthly).catch(() => {});
                      }}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.langFlag}>{l.flag}</Text>
                      <Text style={[styles.langLabel, { color: active ? colors.text : colors.textSub }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                        {l.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        </Section>

        <GroupHeading label={t('PREFERENCES')} />

        <Section index={7}>
          <View style={cardStyle}>
            <View style={[styles.cardBg, { backgroundColor: cardBg }]} />
            <View style={[styles.cardBorderTop, { backgroundColor: colors.glassBorderStrong }]} />
            <View style={styles.cardPad}>
              <Text style={[styles.sectionLabel, { color: colors.textDim }]}>APPEARANCE</Text>
              <View style={styles.themeRow}>
                {THEMES.map((theme) => {
                  const active = themeId === theme.id;
                  return (
                    <TouchableOpacity
                      key={theme.id}
                      style={styles.themeSwatch}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setTheme(theme.id as ThemeId);
                      }}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.swatchCircle, active && styles.swatchActive]}>
                        <View style={[styles.swatchBg, { backgroundColor: theme.bgColor }]} />
                        <View style={[styles.swatchAccent, { backgroundColor: theme.accentColor }]} />
                        {active && (
                          <View style={styles.swatchDot} />
                        )}
                      </View>
                      <Text style={[styles.swatchLabel, { color: active ? colors.cyan : colors.textDim }]}>
                        {theme.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        </Section>

        <Section index={8}>
          <View style={cardStyle}>
            <View style={[styles.cardBg, { backgroundColor: cardBg }]} />
            <View style={[styles.cardBorderTop, { backgroundColor: colors.glassBorderStrong }]} />
            <View style={styles.cardPad}>
              <Text style={[styles.sectionLabel, { color: colors.textDim }]}>NOTIFICATIONS</Text>
              {(
                [
                  { label: 'daily', display: t('daily notification'), value: notifDaily, setter: setNotifDaily, scheduler: scheduleDaily },
                ] as const
              ).map(({ label, display, value, setter, scheduler }) => (
                <View key={label} style={[styles.rowBetween, styles.notifRow]}>
                  <Text style={[styles.settingLabel, { color: colors.textSub }]}>{display}</Text>
                  <Toggle
                    value={value}
                    onValueChange={() => toggleNotif(label, value, setter as (v: boolean) => void, scheduler)}
                  />
                </View>
              ))}
              {__DEV__ && (
                <TouchableOpacity
                  style={[styles.linkRow, { marginTop: 4 }]}
                  onPress={devRegenerateReflections}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.linkText, { color: colors.textDim }]}>regenerate daily reflections (dev)</Text>
                  <Text style={[styles.linkChevron, { color: colors.textDim }]}>›</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Section>

        <GroupHeading label={t('PRIVACY')} />

        <Section index={9}>
          <View style={cardStyle}>
            <View style={[styles.cardBg, { backgroundColor: cardBg }]} />
            <View style={[styles.cardBorderTop, { backgroundColor: colors.glassBorderStrong }]} />
            <View style={styles.cardPad}>
              <Text style={[styles.sectionLabel, { color: colors.textDim }]}>MEMORY</Text>
              <Text style={[styles.sectionSub, { color: colors.textDim }]}>
                let Symponia hold the thread of your journey — only you can ever see your reflections
              </Text>
              <View style={[styles.rowBetween, styles.notifRow]}>
                <Text style={[styles.settingLabel, { color: colors.textSub }]}>remember me</Text>
                <Toggle value={memoryOn} onValueChange={toggleMemory} />
              </View>
              <Text style={[styles.sectionSub, { color: colors.textDim }]}>
                {memoryOn
                  ? 'on · private to you, encrypted, never sold or used to train AI.'
                  : 'off · nothing leaves your device beyond each live reply.'}
              </Text>
            </View>
          </View>
        </Section>

        <GroupHeading label={t('ACCOUNT')} />

        <Section index={10}>
          <View style={cardStyle}>
            <View style={[styles.cardBg, { backgroundColor: cardBg }]} />
            <View style={[styles.cardBorderTop, { backgroundColor: colors.glassBorderStrong }]} />
            <View style={styles.cardPad}>
              <Text style={[styles.sectionLabel, { color: colors.textDim }]}>ACCOUNT</Text>
              {userEmail ? (
                <Text
                  style={[styles.sectionSub, { color: colors.textSub }]}
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  {t('signed in as {email}', { email: userEmail })}
                </Text>
              ) : null}
              <Text style={[styles.sectionSub, { color: colors.textDim }]}>
                erase your saved conversations with Symponia
              </Text>
              <TouchableOpacity
                style={styles.linkRow}
                onPress={() => {
                  Alert.alert(
                    t('Clear all conversations?'),
                    t('This removes all your saved chats from this device and your account. Your profile and animals are untouched.'),
                    [
                      { text: t('cancel'), style: 'cancel' },
                      {
                        text: t('clear all'),
                        style: 'destructive',
                        onPress: async () => {
                          await clearAllConversations();
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        },
                      },
                    ],
                  );
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.linkText, { color: '#e07070' }]}>clear all conversations</Text>
                <Text style={[styles.linkChevron, { color: colors.textDim }]}>›</Text>
              </TouchableOpacity>

              <AIConsentRow colors={colors} />

              <TouchableOpacity
                style={[styles.linkRow, { marginTop: 4 }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  Alert.alert(
                    t('Sign Out'),
                    t('You will need to sign in again to access your profile.'),
                    [
                      { text: t('cancel'), style: 'cancel' },
                      {
                        text: t('sign out'),
                        style: 'destructive',
                        onPress: async () => {
                          await AsyncStorage.multiRemove([
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
                            'symponia_user_id',
                            'symponia_last_reset_seen',
                            'symponia_ai_consent',
                            'symponia_active_mode',
                          ]);
                          await supabase.auth.signOut();
                        },
                      },
                    ],
                  );
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.linkText, { color: colors.textSub }]}>sign out</Text>
                <Text style={[styles.linkChevron, { color: colors.textDim }]}>›</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.linkRow, { marginTop: 4 }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                  Alert.alert(
                    t('Delete Account'),
                    t('This will permanently delete your account and all data. This cannot be undone.'),
                    [
                      { text: t('cancel'), style: 'cancel' },
                      {
                        text: t('delete account'),
                        style: 'destructive',
                        onPress: async () => {
                          try {
                            const { error } = await supabase.functions.invoke('delete-account', {
                              method: 'POST',
                              body: { confirm: true },
                            });
                            if (error) {
                              // Extract real error body from FunctionsHttpError
                              const body = error.context
                                ? await error.context.text().catch(() => '')
                                : '';
                              throw new Error(body || error.message);
                            }
                            // Clear all local data then sign out
                            await AsyncStorage.clear();
                            await supabase.auth.signOut().catch(() => {});
                            router.replace('/signin');
                          } catch (e: any) {
                            Alert.alert(t('Error'), `${e?.message ?? 'unknown error'}`);
                          }
                        },
                      },
                    ],
                  );
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.linkText, { color: '#e07070' }]}>delete account</Text>
                <Text style={[styles.linkChevron, { color: colors.textDim }]}>›</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Section>

        <Section index={11}>
          <View style={cardStyle}>
            <View style={[styles.cardBg, { backgroundColor: cardBg }]} />
            <View style={[styles.cardBorderTop, { backgroundColor: colors.glassBorderStrong }]} />
            <View style={styles.cardPad}>
              <Text style={[styles.sectionLabel, { color: colors.textDim }]}>SYMPONIA</Text>
              <TouchableOpacity
                style={styles.linkRow}
                onPress={() => Linking.openURL('https://symponia.io')}
                activeOpacity={0.7}
              >
                <Text style={[styles.linkText, { color: colors.cyan }]}>symponia.io</Text>
                <Text style={[styles.linkChevron, { color: colors.textDim }]}>›</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.linkRow}
                onPress={() => Linking.openURL('https://symponia.io/privacy')}
                activeOpacity={0.7}
              >
                <Text style={[styles.linkText, { color: colors.textSub }]}>privacy policy</Text>
                <Text style={[styles.linkChevron, { color: colors.textDim }]}>›</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.linkRow}
                onPress={() => Linking.openURL('https://symponia.io/terms')}
                activeOpacity={0.7}
              >
                <Text style={[styles.linkText, { color: colors.textSub }]}>terms of service</Text>
                <Text style={[styles.linkChevron, { color: colors.textDim }]}>›</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.linkRow, { marginTop: 4 }]}
                onPress={() => {
                  AsyncStorage.removeItem('symponia_walkthrough_done');
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  router.navigate('/');
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.linkText, { color: colors.textSub }]}>show app guide again</Text>
                <Text style={[styles.linkChevron, { color: colors.textDim }]}>›</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Section>

        <Section index={12}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              resetAllTips().then(() => {
                Alert.alert(t('Tips reset'), t('The guided tips will show again next time you open each screen.'), [{ text: t('OK') }]);
              });
            }}
            activeOpacity={0.7}
            style={{ borderWidth: 0.5, borderColor: colors.glassBorder, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
          >
            <Text style={{ color: colors.cyan, fontSize: 13, fontFamily: FONT, fontWeight: '400', letterSpacing: 0.3 }}>show guided tips again</Text>
          </TouchableOpacity>
        </Section>

        {/* ── FOOTER ── */}
        <Animated.View entering={FadeIn.duration(300).delay(350)} style={styles.footerWrap}>
          <Image
            source={require('../../Assets/images/LOGO.jpg')}
            style={styles.footerLogo}
            resizeMode="contain"
          />
          <Text style={[styles.footerName, { color: colors.cyan }]}>SYMPONIA</Text>
          <Text style={[styles.footerVersion, { color: colors.textDim }]}>{`version ${Constants.expoConfig?.version ?? '1.0.1'}`}</Text>
        </Animated.View>

      </ScrollView>

      {settingsTip.visible && userAnimals.length > 0 && (
        <CoachTips
          tipKey="settings"
          steps={[{
            title: 'your archetype lives here',
            body: "See each animal's gift, shadow, and path — and reshape your archetype, voice, and theme anytime.",
            target: archRef,
            place: 'above',
          }]}
          onClose={settingsTip.dismiss}
        />
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const FONT = Platform.select({ ios: 'Helvetica Neue', android: 'Roboto', default: 'System' });

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 12 },

  header: { alignItems: 'center', marginBottom: 8 },
  headerTitle: {
    fontSize: 13,
    letterSpacing: 7,
    fontFamily: FONT,
    fontWeight: '400',
  },

  // Card shell
  card: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 0.5,
  },
  cardBg: { ...StyleSheet.absoluteFill },
  cardBorderTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 0.5 },
  cardPad: { padding: 18 },

  langGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  langBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 999,
    borderWidth: 1,
  },
  langFlag: {
    fontSize: 16,
  },
  langLabel: {
    fontSize: 13,
    letterSpacing: 0.2,
  },
  sectionLabel: {
    fontSize: 9,
    letterSpacing: 2.5,
    fontFamily: FONT,
    fontWeight: '500',
    marginBottom: 12,
  },
  sectionSub: {
    fontSize: 11,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.3,
    marginBottom: 12,
    marginTop: -4,
  },

  // Name
  nameDisplay: {
    fontSize: 18,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.3,
  },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  inlineInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: FONT,
    fontWeight: '400',
    borderBottomWidth: 0.5,
    paddingVertical: 4,
  },

  // Gender
  genderValue: {
    fontSize: 14,
    fontFamily: FONT,
    fontWeight: '400',
  },

  // Frequency
  freqList: { gap: 10 },
  freqOption: {
    borderRadius: 16,
    borderWidth: 0.5,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 6,
  },
  freqOptionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  freqOptionLabel: {
    fontSize: 15,
    fontFamily: FONT,
    fontWeight: '400',
  },
  freqOptionDesc: {
    fontSize: 11,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.3,
    paddingLeft: 30,
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  freqBtn: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 0.5,
    paddingVertical: 10,
    alignItems: 'center',
  },
  freqBtnText: {
    fontSize: 10,
    fontFamily: FONT,
    fontWeight: '400',
    textAlign: 'center',
  },

  // Settings row
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  notifRow: { paddingVertical: 6 },
  settingLabel: {
    fontSize: 11,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.5,
  },

  // Links
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  linkText: {
    fontSize: 13,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.3,
  },
  linkChevron: { fontSize: 18 },

  // Subscription
  subBadgeActive: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  subBadgeText: {
    fontSize: 11,
    fontFamily: FONT,
    fontWeight: '500',
    letterSpacing: 1.5,
  },
  subExpiry: {
    fontSize: 11,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.3,
    marginTop: -10,
  },
  tokenPackNote: {
    fontSize: 10,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  subDescription: {
    fontSize: 13,
    fontFamily: FONT,
    fontWeight: '400',
    color: '#eae6f8',
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  subFeatureList: {
    fontSize: 10,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.2,
    lineHeight: 16,
    marginBottom: 10,
  },
  subRenewalNote: {
    fontSize: 10,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.2,
    lineHeight: 15,
    marginBottom: 8,
  },
  subLegalInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  subBtn: {
    borderRadius: 14,
    borderWidth: 0.5,
    paddingVertical: 13,
    alignItems: 'center',
  },
  subBtnText: {
    fontSize: 11,
    letterSpacing: 2,
    fontFamily: FONT,
    fontWeight: '500',
  },

  // Subscription legal links
  subLegalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 0.5,
  },
  subLegalLink: {
    fontSize: 10,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.3,
  },
  subLegalSep: {
    fontSize: 10,
    fontFamily: FONT,
  },

  // Shared
  smallBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtnText: { fontSize: 16 },

  // Inner Zoo cards
  zooCard: {
    borderRadius: 16,
    borderWidth: 0.5,
    marginBottom: 10,
    overflow: 'hidden',
  },
  zooCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    paddingBottom: 10,
  },
  zooCardEmoji: { fontSize: 32 },
  zooCardMeta: { flex: 1, gap: 2 },
  zooCardName: {
    fontSize: 13,
    fontFamily: FONT,
    fontWeight: '500',
    letterSpacing: 2,
  },
  zooCardRank: {
    fontSize: 9,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 1.5,
  },
  zooCardBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 8 },
  zooLayer: {
    borderLeftWidth: 2,
    paddingLeft: 10,
    gap: 2,
  },
  zooLayerLabel: {
    fontSize: 8,
    fontFamily: FONT,
    fontWeight: '500',
    letterSpacing: 2,
  },
  zooLayerText: {
    fontSize: 12,
    fontFamily: FONT,
    fontWeight: '400',
    lineHeight: 18,
    letterSpacing: 0.1,
  },
  zooUpdateBtn: { alignSelf: 'flex-start' },
  zooUpdateText: { fontSize: 11, fontFamily: FONT, fontWeight: '400', letterSpacing: 0.5 },

  // Theme swatches
  themeRow: { flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  themeSwatch: { flex: 1, alignItems: 'center', gap: 7 },
  swatchCircle: {
    width: 48, height: 48, borderRadius: 24, overflow: 'hidden',
    borderWidth: 1.5, borderColor: 'transparent',
  },
  swatchActive: { borderColor: 'rgba(255,255,255,0.55)' },
  swatchBg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  swatchAccent: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 20,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
    opacity: 0.85,
  },
  swatchDot: {
    position: 'absolute', top: '50%', left: '50%',
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.9)',
    marginTop: -4, marginLeft: -4,
  },
  swatchLabel: {
    fontSize: 9, letterSpacing: 1.2, fontFamily: FONT, fontWeight: '400',
  },

  // Toggle
  toggleTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    borderWidth: 0.5,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },

  // Footer
  footerWrap: {
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
    paddingBottom: 4,
  },
  footerLogo: {
    width: 44,
    height: 44,
    borderRadius: 12,
  },
  footerName: {
    fontSize: 11,
    letterSpacing: 6,
    fontFamily: FONT,
    fontWeight: '400',
  },
  footerVersion: {
    fontSize: 10,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.3,
  },

  // Tokens
  tokenTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  tokenFill: {
    height: '100%',
    borderRadius: 2,
  },
  tokenBarLabel: {
    fontSize: 9,
    letterSpacing: 1.2,
    fontFamily: FONT,
    fontWeight: '400',
  },
  tokenBtn: {
    borderRadius: 16,
    borderWidth: 0.5,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tokenBtnText: {
    fontSize: 13,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.3,
  },
});
