import { THEMES, type ThemeId, useTheme } from '@/constants/ThemeContext';
import { TRIAL_TOKENS, SUPABASE_URL } from '@/constants/config';
import { ANIMAL_ARCHETYPES } from '@/constants/systemPrompt';
import { supabase } from '@/services/supabase';
import * as Notifications from 'expo-notifications';
import { requestNotificationPermission, scheduleDaily, scheduleMonthly, scheduleWeekly, topUpDailyReflections } from '@/services/notifications';
import { restorePurchases, verifyAndFinishPurchase, initIAP, fetchStoreSubscriptions, fetchStoreProducts, triggerSubscription, triggerPurchase, SUBSCRIPTION_PRODUCTS, IAP_PRODUCTS, type ProductPurchase, type SubscriptionProductId, type IAPProductId } from '@/services/iap';
import { clearAllConversations } from '@/services/conversations';
import { checkSubscription } from '@/services/supabaseTokens';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  AppState,
  Image,
  Keyboard,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
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

// ── AI Consent Row ────────────────────────────────────────────────────────────

function AIConsentRow({ colors }: { colors: any }) {
  const [status, setStatus] = React.useState<string | null>(null);

  React.useEffect(() => {
    AsyncStorage.getItem('symponia_ai_consent').then(setStatus);
  }, []);

  const isRevoked = status === 'revoked';

  const toggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isRevoked) {
      Alert.alert(
        'Re-enable AI processing?',
        "Symponia will send your messages to Anthropic's Claude to generate reflections.",
        [
          { text: 'cancel', style: 'cancel' },
          {
            text: 're-enable',
            onPress: async () => {
              await AsyncStorage.setItem('symponia_ai_consent', 'true');
              try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user) {
                  await supabase.from('profiles').update({ ai_consent: true }).eq('user_id', session.user.id);
                }
              } catch {}
              setStatus('true');
            },
          },
        ],
      );
    } else {
      Alert.alert(
        'Revoke AI processing consent?',
        "This will disable chat features. Your messages will no longer be sent to Anthropic's Claude. You can re-enable at any time.",
        [
          { text: 'cancel', style: 'cancel' },
          {
            text: 'revoke',
            style: 'destructive',
            onPress: async () => {
              await AsyncStorage.setItem('symponia_ai_consent', 'revoked');
              try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user) {
                  await supabase.from('profiles').update({ ai_consent: false }).eq('user_id', session.user.id);
                }
              } catch {}
              setStatus('revoked');
            },
          },
        ],
      );
    }
  };

  return (
    <TouchableOpacity style={styles.linkRow} onPress={toggle} activeOpacity={0.7}>
      <Text style={[styles.linkText, { color: isRevoked ? '#e07070' : colors.textSub }]}>
        {isRevoked ? 're-enable AI processing' : 'revoke AI processing consent'}
      </Text>
      <Text style={[styles.linkChevron, { color: colors.textDim }]}>›</Text>
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
  const [subscriptionExpiry, setSubscriptionExpiry] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);
  const [isPurchasingSub, setIsPurchasingSub] = useState(false);
  const [isPurchasingTokenId, setIsPurchasingTokenId] = useState<string | null>(null);
  const [subProducts, setSubProducts] = useState<{ productId: string; localizedPrice: string }[]>([]);
  const [storeProducts, setStoreProducts] = useState<{ productId: string; localizedPrice: string }[]>([]);
  const [pricesError, setPricesError] = useState(false);
  const [userAnimals, setUserAnimals] = useState<string[]>([]);

  const loadPrices = useCallback(() => {
    setPricesError(false);
    const timeoutId = setTimeout(() => setPricesError(true), 8000);
    initIAP()
      .then(() => Promise.all([fetchStoreSubscriptions(), fetchStoreProducts()]))
      .then(([subs, products]) => {
        clearTimeout(timeoutId);
        setSubProducts(subs);
        setStoreProducts(products);
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
    ]).then(([subscribed, expires]) => {
      setIsSubscribed(subscribed);
      if (expires) setSubscriptionExpiry(expires);
    });
  }, []));

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
          "A daily reflection, if you'd like one.",
          'Once a day, Symponia can send a short, centering thought shaped by your archetype. Nothing else.',
          [
            { text: 'Not now', style: 'cancel' },
            {
              text: 'Yes, please',
              onPress: async () => {
                const granted = await requestNotificationPermission();
                if (!granted) return;
                setter(true);
                AsyncStorage.setItem('symponia_notif_daily', 'true');
                scheduler(true);
              },
            },
          ],
        );
        return;
      }
      const granted = await requestNotificationPermission();
      if (!granted) return;
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
      Alert.alert("Tomorrow's reflection", body);
    } catch (err: any) {
      Alert.alert('Generation failed', err?.message ?? String(err));
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
        Alert.alert('Nothing to restore', 'No previous purchases found for this Apple ID.');
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(restored ? 'Restored' : 'Nothing to restore', restored ? 'Your purchases have been restored.' : 'No purchases could be verified.');
    } catch (e: any) {
      Alert.alert('Restore failed', e?.message ?? 'Something went wrong.');
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
      Alert.alert('Purchase failed', e?.message ?? 'Something went wrong.');
    } finally {
      setIsPurchasingSub(false);
    }
  };

  const handleTokenPurchase = async (productId: IAPProductId) => {
    if (isPurchasingTokenId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsPurchasingTokenId(productId);
    try {
      await initIAP();
      await triggerPurchase(productId);
    } catch (e: any) {
      Alert.alert('Purchase failed', e?.message ?? 'Something went wrong.');
    } finally {
      setIsPurchasingTokenId(null);
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
        <Section index={0}>
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
                    placeholder="your name..."
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

        {/* ── GENDER ── */}
        <Section index={1}>
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

        {/* ── YOUR ARCHETYPES ── */}
        {userAnimals.length > 0 && (
          <Section index={2}>
            <View style={cardStyle}>
              <View style={[styles.cardBg, { backgroundColor: cardBg }]} />
              <View style={[styles.cardBorderTop, { backgroundColor: colors.glassBorderStrong }]} />
              <View style={styles.cardPad}>
                <Text style={[styles.sectionLabel, { color: colors.textDim }]}>YOUR ARCHETYPES</Text>
                {userAnimals.map((animal, i) => {
                  const key = animal.toLowerCase().trim();
                  const arc = ANIMAL_ARCHETYPES[key];
                  const isShadow = i === 6;
                  const accentColor = isShadow ? colors.violet : colors.cyan;
                  const accentDim = isShadow ? colors.violetDim : colors.cyanDim;
                  return (
                    <View key={i} style={[styles.zooCard, { borderColor: isShadow ? colors.glassBorderStrong : colors.glassBorder, backgroundColor: accentDim }]}>
                      {/* Animal header */}
                      <View style={styles.zooCardHeader}>
                        <Text style={styles.zooCardEmoji}>{ANIMAL_EMOJI[animal] ?? ANIMAL_EMOJI[animal.charAt(0).toUpperCase() + animal.slice(1).toLowerCase()] ?? '🐾'}</Text>
                        <View style={styles.zooCardMeta}>
                          <Text style={[styles.zooCardName, { color: accentColor }]}>{animal.toUpperCase()}</Text>
                          <Text style={[styles.zooCardRank, { color: isShadow ? colors.violet : colors.textDim }]}>
                            {i + 1} · {ZOO_LABELS[i]?.toUpperCase()}
                          </Text>
                        </View>
                      </View>
                      {arc ? (
                        <View style={styles.zooCardBody}>
                          <View style={[styles.zooLayer, { borderLeftColor: accentColor }]}>
                            <Text style={[styles.zooLayerLabel, { color: colors.textDim }]}>GIFT</Text>
                            <Text style={[styles.zooLayerText, { color: colors.text }]}>{arc.gift}</Text>
                          </View>
                          <View style={[styles.zooLayer, { borderLeftColor: colors.red }]}>
                            <Text style={[styles.zooLayerLabel, { color: colors.textDim }]}>SHADOW</Text>
                            <Text style={[styles.zooLayerText, { color: colors.text }]}>{arc.shadow}</Text>
                          </View>
                          <View style={[styles.zooLayer, { borderLeftColor: colors.green }]}>
                            <Text style={[styles.zooLayerLabel, { color: colors.textDim }]}>PATH</Text>
                            <Text style={[styles.zooLayerText, { color: colors.text }]}>{arc.path}</Text>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
                <TouchableOpacity
                  onPress={() => router.navigate('/update-animals')}
                  activeOpacity={0.7}
                  style={[styles.zooUpdateBtn, { marginTop: 8 }]}
                >
                  <Text style={[styles.zooUpdateText, { color: colors.cyan }]}>update animals →</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Section>
        )}

        {/* ── RESONANCE FREQUENCY ── */}
        <Section index={3}>
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

        {/* ── APPEARANCE ── */}
        <Section index={3}>
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

        {/* ── SENSE TOKENS ── */}
        <Section index={4}>
          <View style={cardStyle}>
            <View style={[styles.cardBg, { backgroundColor: cardBg }]} />
            <View style={[styles.cardBorderTop, { backgroundColor: colors.glassBorderStrong }]} />
            <View style={styles.cardPad}>
              <Text style={[styles.sectionLabel, { color: colors.textDim }]}>SYMPONIA · REFLECTIONS</Text>
              {/* Token bar */}
              <View style={[styles.tokenTrack, { marginTop: 6, marginBottom: 4 }]}>
                <View style={[styles.tokenFill, { width: `${Math.min(tokens / 50, 1) * 100}%`, backgroundColor: tokens <= 3 ? '#e07070CC' : colors.cyan + 'CC' }]} />
              </View>
              <View style={{ marginBottom: 14 }}>
                <Text style={[styles.tokenBarLabel, { color: tokens <= 3 ? '#e07070AA' : colors.cyan + 'AA' }]}>
                  {tokens} REFLECTION{tokens !== 1 ? 'S' : ''} REMAINING
                </Text>
                <Text style={[styles.tokenBarLabel, { color: colors.textDim, marginTop: 3 }]}>
                  1 REFLECTION = 1 RESPONSE
                </Text>
              </View>
              {isSubscribed ? (
                <View style={{ marginTop: 4, gap: 4 }}>
                  <Text style={[styles.tokenPackNote, { color: colors.textSub }]}>
                    {'350 reflections per month'}
                  </Text>
                  <Text style={[styles.tokenPackNote, { color: colors.textDim }]}>
                    {'Archetype · My Day · Conversation'}
                  </Text>
                  <Text style={[styles.tokenPackNote, { color: colors.textDim }]}>
                    {'Renews monthly with your subscription'}
                  </Text>
                </View>
              ) : (
                <Text style={[styles.tokenPackNote, { color: colors.textDim, marginTop: 4 }]}>
                  Reflection Packs are available once you subscribe to Symponia Monthly.
                </Text>
              )}
            </View>
          </View>
        </Section>

        {/* ── SUBSCRIPTION ── */}
        <Section index={5}>
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
                  {'renews · '}{new Date(subscriptionExpiry).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </Text>
              ) : null}

              {/* Subscribe buttons — shown when not subscribed */}
              {!isSubscribed && SUBSCRIPTION_PRODUCTS.map((sub) => {
                const storeInfo = subProducts.find((p) => p.productId === sub.id);
                const loading = !pricesError && !storeInfo;
                const priceLabel = pricesError ? 'tap to retry' : (storeInfo?.localizedPrice || '…');
                const priceForLegalText = pricesError ? '—' : (storeInfo?.localizedPrice || '…');
                return (
                  <React.Fragment key={sub.id}>
                    <Text style={[styles.subDescription, { color: colors.textSub }]}>
                      {'Symponia Monthly'}
                    </Text>
                    <Text style={[styles.subFeatureList, { color: colors.textDim }]}>
                      {'350 reflection sessions every month, across Archetype, My Day, and Conversation.\nAuto-renews until cancelled.'}
                    </Text>
                    <TouchableOpacity
                      style={[styles.subBtn, { borderColor: isPurchasingSub ? colors.glassBorder : colors.cyan, backgroundColor: isPurchasingSub ? 'transparent' : colors.cyan + '22', marginBottom: 4 }]}
                      onPress={pricesError ? loadPrices : () => handleSubscribe(sub.id as SubscriptionProductId)}
                      disabled={isPurchasingSub || loading}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.subBtnText, { color: isPurchasingSub ? colors.textDim : colors.cyan }]}>
                        {isPurchasingSub ? 'processing…' : `subscribe — ${priceLabel}/month`}
                      </Text>
                    </TouchableOpacity>
                    <Text style={[styles.subRenewalNote, { color: colors.textDim }]}>
                      {'auto-renews monthly · cancel anytime in App Store Settings'}
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

        {/* ── REFLECTIONS (notification schedule) ── */}
        <Section index={6}>
          <View style={cardStyle}>
            <View style={[styles.cardBg, { backgroundColor: cardBg }]} />
            <View style={[styles.cardBorderTop, { backgroundColor: colors.glassBorderStrong }]} />
            <View style={styles.cardPad}>
              <Text style={[styles.sectionLabel, { color: colors.textDim }]}>REFLECTIONS</Text>
              {(
                [
                  { label: 'daily',   value: notifDaily,   setter: setNotifDaily,   scheduler: scheduleDaily },
                  { label: 'weekly',  value: notifWeekly,  setter: setNotifWeekly,  scheduler: scheduleWeekly },
                  { label: 'monthly', value: notifMonthly, setter: setNotifMonthly, scheduler: scheduleMonthly },
                ] as const
              ).map(({ label, value, setter, scheduler }) => (
                <View key={label} style={[styles.rowBetween, styles.notifRow]}>
                  <Text style={[styles.settingLabel, { color: colors.textSub }]}>{label}</Text>
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

        {/* ── ABOUT ── */}
        <Section index={7}>
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

        {/* ── DATA & ACCOUNT ── */}
        <Section index={8}>
          <View style={cardStyle}>
            <View style={[styles.cardBg, { backgroundColor: cardBg }]} />
            <View style={[styles.cardBorderTop, { backgroundColor: colors.glassBorderStrong }]} />
            <View style={styles.cardPad}>
              <Text style={[styles.sectionLabel, { color: colors.textDim }]}>ACCOUNT</Text>
              <Text style={[styles.sectionSub, { color: colors.textDim }]}>
                erase your saved conversations with Symponia
              </Text>
              <TouchableOpacity
                style={styles.linkRow}
                onPress={() => {
                  Alert.alert(
                    'Clear all conversations?',
                    'This removes all your saved chats from this device and your account. Your profile and animals are untouched.',
                    [
                      { text: 'cancel', style: 'cancel' },
                      {
                        text: 'clear all',
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
                    'Sign Out',
                    'You will need to sign in again to access your profile.',
                    [
                      { text: 'cancel', style: 'cancel' },
                      {
                        text: 'sign out',
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
                    'Delete Account',
                    'This will permanently delete your account and all data. This cannot be undone.',
                    [
                      { text: 'cancel', style: 'cancel' },
                      {
                        text: 'delete account',
                        style: 'destructive',
                        onPress: async () => {
                          try {
                            const { error } = await supabase.functions.invoke('delete-account', {
                              method: 'POST',
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
                            Alert.alert('Error', `${e?.message ?? 'unknown error'}`);
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

        {/* ── FOOTER ── */}
        <Animated.View entering={FadeIn.duration(300).delay(350)} style={styles.footerWrap}>
          <Image
            source={require('../../Assets/images/LOGO.jpg')}
            style={styles.footerLogo}
            resizeMode="contain"
          />
          <Text style={[styles.footerName, { color: colors.cyan }]}>SYMPONIA</Text>
          <Text style={[styles.footerVersion, { color: colors.textDim }]}>version 1.0.0</Text>
        </Animated.View>

      </ScrollView>
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
    fontWeight: '300',
  },

  // Card shell
  card: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 0.5,
  },
  cardBg: { ...StyleSheet.absoluteFillObject },
  cardBorderTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 0.5 },
  cardPad: { padding: 18 },

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
    fontWeight: '300',
    letterSpacing: 0.3,
    marginBottom: 12,
    marginTop: -4,
  },

  // Name
  nameDisplay: {
    fontSize: 18,
    fontFamily: FONT,
    fontWeight: '300',
    letterSpacing: 0.3,
  },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  inlineInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: FONT,
    fontWeight: '300',
    borderBottomWidth: 0.5,
    paddingVertical: 4,
  },

  // Gender
  genderValue: {
    fontSize: 14,
    fontFamily: FONT,
    fontWeight: '300',
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
    fontWeight: '300',
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
    fontWeight: '300',
    letterSpacing: 0.5,
  },

  // Links
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  linkText: {
    fontSize: 13,
    fontFamily: FONT,
    fontWeight: '300',
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
    fontWeight: '300',
    letterSpacing: 0.3,
    marginTop: -10,
  },
  tokenPackNote: {
    fontSize: 10,
    fontFamily: FONT,
    fontWeight: '300',
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
    fontWeight: '300',
    letterSpacing: 0.2,
    lineHeight: 16,
    marginBottom: 10,
  },
  subRenewalNote: {
    fontSize: 10,
    fontFamily: FONT,
    fontWeight: '300',
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
    fontWeight: '300',
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
    fontWeight: '300',
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
    fontWeight: '300',
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
    fontWeight: '300',
  },
  footerVersion: {
    fontSize: 10,
    fontFamily: FONT,
    fontWeight: '300',
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
