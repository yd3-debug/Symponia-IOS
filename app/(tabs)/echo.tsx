import { useTheme } from '@/constants/ThemeContext';
import { TRIAL_TOKENS } from '@/constants/config';
import { ANIMAL_ARCHETYPES, MODE_GREETINGS, buildAnimalGreeting, extractSemanticTags } from '@/constants/systemPrompt';
import { streamAnimalSynthesis, streamArchetype, streamChat, type Message } from '@/services/anthropic';
import { loadConversation, saveConversation, clearConversation } from '@/services/conversations';
import { checkSubscription, deductToken, syncTokens } from '@/services/supabaseTokens';
import {
  SUBSCRIPTION_PRODUCTS,
  setupPurchaseListeners,
} from '@/services/iap';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Keyboard,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ── Animal emoji palette (for animal mode) ────────────────────────────────────

const ANIMAL_PALETTE = [
  { e: '🦁', n: 'lion' },       { e: '🐅', n: 'tiger' },      { e: '🐆', n: 'leopard' },
  { e: '🐈‍⬛', n: 'panther' },  { e: '🐺', n: 'wolf' },       { e: '🦊', n: 'fox' },
  { e: '🐕', n: 'dog' },        { e: '🐈', n: 'cat' },         { e: '🐻', n: 'bear' },
  { e: '🐼', n: 'panda' },      { e: '🐨', n: 'koala' },       { e: '🦍', n: 'gorilla' },
  { e: '🐎', n: 'horse' },      { e: '🦌', n: 'deer' },        { e: '🦬', n: 'bison' },
  { e: '🦒', n: 'giraffe' },    { e: '🦓', n: 'zebra' },       { e: '🐘', n: 'elephant' },
  { e: '🦏', n: 'rhino' },      { e: '🦛', n: 'hippo' },       { e: '🐗', n: 'boar' },
  { e: '🦘', n: 'kangaroo' },   { e: '🦝', n: 'raccoon' },     { e: '🦦', n: 'otter' },
  { e: '🦡', n: 'badger' },     { e: '🦔', n: 'hedgehog' },    { e: '🐇', n: 'rabbit' },
  { e: '🐿️', n: 'squirrel' },  { e: '🦫', n: 'beaver' },      { e: '🦇', n: 'bat' },
  { e: '🦅', n: 'eagle' },      { e: '🦉', n: 'owl' },         { e: '🦚', n: 'peacock' },
  { e: '🦜', n: 'parrot' },     { e: '🐦‍⬛', n: 'crow' },     { e: '🦩', n: 'flamingo' },
  { e: '🦢', n: 'swan' },       { e: '🕊️', n: 'dove' },       { e: '🐧', n: 'penguin' },
  { e: '🐋', n: 'whale' },      { e: '🐬', n: 'dolphin' },     { e: '🦈', n: 'shark' },
  { e: '🐙', n: 'octopus' },    { e: '🦭', n: 'seal' },        { e: '🐍', n: 'snake' },
  { e: '🐊', n: 'crocodile' },  { e: '🐢', n: 'turtle' },      { e: '🦎', n: 'lizard' },
  { e: '🐸', n: 'frog' },       { e: '🦋', n: 'butterfly' },   { e: '🐝', n: 'bee' },
  { e: '🕷️', n: 'spider' },    { e: '🦂', n: 'scorpion' },
] as const;

// ── Full emoji map for all archetypes ─────────────────────────────────────────

const ANIMAL_EMOJI_MAP: Record<string, string> = {
  // Big cats & canines
  lion: '🦁', tiger: '🐅', leopard: '🐆', panther: '🐈‍⬛',
  wolf: '🐺', fox: '🦊', dog: '🐕', cat: '🐈',
  // Bears & primates
  bear: '🐻', panda: '🐼', koala: '🐨', gorilla: '🦍',
  // Hooved
  horse: '🐎', deer: '🦌', bison: '🦬', giraffe: '🦒',
  zebra: '🦓', elephant: '🐘', rhino: '🦏', hippo: '🦛',
  boar: '🐗', kangaroo: '🦘',
  // Small mammals
  raccoon: '🦝', otter: '🦦', badger: '🦡', hedgehog: '🦔',
  rabbit: '🐇', squirrel: '🐿️', beaver: '🦫', bat: '🦇',
  // Birds
  eagle: '🦅', owl: '🦉', peacock: '🦚', parrot: '🦜',
  crow: '🐦‍⬛', flamingo: '🦩', swan: '🦢', dove: '🕊️', penguin: '🐧',
  // Sea creatures
  whale: '🐋', dolphin: '🐬', shark: '🦈', octopus: '🐙', seal: '🦭',
  // Reptiles & amphibians
  snake: '🐍', crocodile: '🐊', turtle: '🐢', lizard: '🦎', frog: '🐸',
  // Insects & arachnids
  butterfly: '🦋', bee: '🐝', spider: '🕷️', scorpion: '🦂',
  // Legacy aliases (keep for existing stored user data)
  cheetah: '🐆', heron: '🦩',
};

const ARCHETYPE_POSITION_LABELS = [
  'PRIMARY ANIMAL', '2ND FORCE', '3RD FORCE',
  'BRIDGE', 'BRIDGE', 'THRESHOLD', 'THE SHADOW',
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

interface EchoNodeData {
  id: string;
  x: number;
  y: number;
  resonanceScore: number;
  semanticTags: string[];
  coreInsight: string;
  timestamp: number;
}

// ── Mode label map ────────────────────────────────────────────────────────────

const MODE_LABELS: Record<string, string> = {
  animal:    'SYMPONIA · ARCHETYPE',
  day:       'SYMPONIA · MY DAY',
  daily:     'SYMPONIA · TODAY',
  open:      'SYMPONIA · CHAT',
};

// ── Word (long-pressable) ─────────────────────────────────────────────────────

function Word({
  word,
  isUser,
  onLongPress,
  textColor,
  userTextColor,
}: {
  word: string;
  isUser: boolean;
  onLongPress: (w: string) => void;
  textColor: string;
  userTextColor: string;
}) {
  const clean = word.replace(/[^\w'-]/g, '');
  return (
    <Pressable
      onLongPress={() => { if (clean.length > 2) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onLongPress(clean); } }}
      delayLongPress={420}
    >
      <Text style={[styles.wordText, { color: isUser ? userTextColor : textColor }]}>{word} </Text>
    </Pressable>
  );
}

// ── Message Bubble ────────────────────────────────────────────────────────────

const MessageBubble = React.memo(function MessageBubble({ message, onWordLongPress }: { message: ChatMessage; onWordLongPress: (w: string) => void }) {
  const isUser = message.role === 'user';
  const words = message.text.split(/\s+/).filter(Boolean);
  const { colors } = useTheme();
  const userBg = colors.cyanDim;
  const aiBg   = colors.glass;

  return (
    <Animated.View
      entering={FadeInDown.duration(280).easing(Easing.out(Easing.cubic))}
      style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}
    >
      <View style={styles.bubbleOuter}>
        <View style={[styles.bubbleBg, { backgroundColor: isUser ? userBg : aiBg }]} />
        <View style={[styles.bubbleBorder, { borderColor: isUser ? colors.cyanBorder : colors.glassBorder }]} />
        <View style={styles.bubbleContent}>
          <View style={styles.wordFlow}>
            {words.map((word, i) => (
              <Word key={i} word={word} isUser={isUser} onLongPress={onWordLongPress} textColor={colors.text} userTextColor={colors.textUser} />
            ))}
          </View>
        </View>
      </View>
    </Animated.View>
  );
});

// ── Breathing Dots ────────────────────────────────────────────────────────────

function BreathingDot({ delay, dotColor }: { delay: number; dotColor: string }) {
  const scale = useSharedValue(0.5);
  const opacity = useSharedValue(0.3);
  React.useEffect(() => {
    const t = setTimeout(() => {
      scale.value = withRepeat(withTiming(1.4, { duration: 650, easing: Easing.inOut(Easing.sin) }), -1, true);
      opacity.value = withRepeat(withTiming(1, { duration: 650, easing: Easing.inOut(Easing.sin) }), -1, true);
    }, delay);
    return () => clearTimeout(t);
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));
  return <Animated.View style={[styles.dot, style, { backgroundColor: dotColor }]} />;
}

function BreathingDots({ dotColor }: { dotColor: string }) {
  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.dotsRow}>
      {[0, 1, 2].map((i) => <BreathingDot key={i} delay={i * 180} dotColor={dotColor} />)}
    </Animated.View>
  );
}

// ── Archetype Sheet (swipeable bottom sheet) ──────────────────────────────────

const SCREEN_H = Dimensions.get('window').height;
const SHEET_H  = Math.round(SCREEN_H * 0.82);
const SNAP_HALF = Math.round(SCREEN_H * 0.38);
const SNAP_FULL = 0;

function ArchetypeSheet({ word, text, isLoading, onClose }: { word: string; text: string; isLoading: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const translateY = useSharedValue(SHEET_H); // start off-screen
  const startY = useSharedValue(0);

  React.useEffect(() => {
    translateY.value = withSpring(SNAP_HALF, { damping: 24, stiffness: 200 });
  }, []);

  const animatedClose = React.useCallback(() => {
    translateY.value = withSpring(SHEET_H, { damping: 22 }, () => {
      runOnJS(onClose)();
    });
  }, [onClose, translateY]);

  const pan = Gesture.Pan()
    .onBegin(() => { startY.value = translateY.value; })
    .onUpdate((e) => {
      translateY.value = Math.max(SNAP_FULL, startY.value + e.translationY);
    })
    .onEnd((e) => {
      const dismiss = e.velocityY > 600 || translateY.value > SCREEN_H * 0.55;
      const expand  = e.velocityY < -600 || translateY.value < SCREEN_H * 0.2;
      if (dismiss) {
        translateY.value = withSpring(SHEET_H, { damping: 22 }, () => {
          runOnJS(onClose)();
        });
      } else if (expand) {
        translateY.value = withSpring(SNAP_FULL, { damping: 24, stiffness: 200 });
      } else {
        translateY.value = withSpring(SNAP_HALF, { damping: 24, stiffness: 200 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Dim backdrop */}
      <TouchableWithoutFeedback onPress={animatedClose}>
        <Animated.View
          entering={FadeIn.duration(200)}
          style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.22)' }]}
        />
      </TouchableWithoutFeedback>

      {/* Sheet panel */}
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.sheetPanel, { height: SHEET_H, paddingBottom: insets.bottom + 16 }, sheetStyle]}>
          <BlurView intensity={70} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          <View style={[styles.sheetBg, { backgroundColor: isDark ? 'rgba(8,6,28,0.62)' : colors.bgMid + '9E' }]} />
          <View style={[styles.sheetBorderTop, { backgroundColor: colors.glassBorderStrong }]} />
          <View style={[styles.sheetHandle, { backgroundColor: colors.glassBorderStrong }]} />
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetWord, { color: colors.cyan }]}>{word.toUpperCase()}</Text>
            <TouchableOpacity onPress={animatedClose} hitSlop={12}>
              <Text style={[styles.sheetCloseText, { color: colors.textDim }]}>close</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
            <Text style={[styles.sheetText, { color: colors.text }]}>
              {text}{isLoading && text.length > 0 ? '▋' : ''}
            </Text>
            {isLoading && text.length === 0 && <BreathingDots dotColor={colors.cyan} />}
          </ScrollView>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

// ── Animal Reading Card (structured view for pre-loaded animal readings) ──────

function AnimalReadingView({ animals, onAskMore, onWordLongPress }: { animals: string[]; onAskMore: (text: string) => void; onWordLongPress: (w: string) => void }) {
  const { colors } = useTheme();
  const [synthesis, setSynthesis] = useState('');
  const [synthLoading, setSynthLoading] = useState(true);

  useEffect(() => {
    const abort = streamAnimalSynthesis(
      animals,
      (token) => setSynthesis(token),
      () => setSynthLoading(false),
      (_err) => {
        setSynthLoading(false);
        Alert.alert(
          'AI consent required',
          'You have not granted permission for AI processing. Enable it in Profile → Data & Account.',
          [{ text: 'OK' }],
        );
      },
    );
    return abort;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View entering={FadeInDown.duration(400)} style={styles.animalReading}>
      {/* Overview emoji row */}
      <View style={styles.animalReadingHeader}>
        {animals.map((a, i) => (
          <Text key={i} style={[styles.animalReadingHeaderEmoji, i === 6 && { opacity: 0.45 }]}>
            {ANIMAL_EMOJI_MAP[a.toLowerCase().trim()] ?? '🐾'}
          </Text>
        ))}
      </View>
      {/* Individual animal cards */}
      {animals.map((animal, i) => {
        const key = animal.toLowerCase().trim();
        const arc = ANIMAL_ARCHETYPES[key];
        const isShadow = i === 6;
        const accent = isShadow ? colors.violet : colors.cyan;
        const accentDim = isShadow ? colors.violetDim : colors.cyanDim;
        return (
          <View key={i} style={[styles.animalCard, { borderColor: isShadow ? colors.glassBorderStrong : colors.glassBorder }]}>
            <View style={[styles.animalCardBg, { backgroundColor: accentDim }]} />
            {/* Position badge row */}
            <View style={styles.animalCardBadgeRow}>
              <View style={[styles.animalCardPill, { backgroundColor: accentDim, borderColor: accent + '55' }]}>
                <Text style={[styles.animalCardPillText, { color: accent }]}>
                  {ARCHETYPE_POSITION_LABELS[i]}
                </Text>
              </View>
              <Text style={[styles.animalCardNum, { color: accent }]}>{i + 1}</Text>
            </View>
            {/* Name + emoji */}
            <View style={styles.animalCardNameRow}>
              <Text style={styles.animalCardEmoji}>{ANIMAL_EMOJI_MAP[key] ?? '🐾'}</Text>
              <Text style={[styles.animalCardName, { color: accent }]}>
                {animal.charAt(0).toUpperCase() + animal.slice(1).toLowerCase()}
              </Text>
            </View>
            {/* Gift / Shadow / Path */}
            {arc && (
              <View style={styles.animalCardLayers}>
                {([
                  { label: '◆ GIFT',   text: arc.gift,   color: accent,        prompt: `Go deeper into my ${animal} gift — "${arc.gift.slice(0, 60)}..."` },
                  { label: '◆ SHADOW', text: arc.shadow, color: colors.red,    prompt: `I want to explore my ${animal} shadow more — "${arc.shadow.slice(0, 60)}..."` },
                  { label: '⚡ ACTION', text: arc.path,   color: colors.green,  prompt: `Help me work with the ${animal} path — "${arc.path.slice(0, 60)}..."` },
                ] as const).map(({ label, text, color, prompt }) => (
                  <View key={label} style={[styles.animalCardLayer, { borderLeftColor: color }]}>
                    <Text style={[styles.animalCardLayerLabel, { color: colors.textDim }]}>{label}</Text>
                    <View style={styles.wordFlow}>
                      {text.split(' ').map((w, wi) => (
                        <Word key={wi} word={w} isUser={false} onLongPress={onWordLongPress} textColor={colors.text} userTextColor={colors.text} />
                      ))}
                    </View>
                    <TouchableOpacity
                      onPress={() => onAskMore(prompt)}
                      activeOpacity={0.65}
                      style={styles.askMoreBtn}
                    >
                      <Text style={[styles.askMoreText, { color: color + 'AA' }]}>ask more →</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
      {/* Totem Profile synthesis */}
      <View style={[styles.synthesisCard, { borderColor: colors.glassBorderStrong }]}>
        <View style={[styles.synthesisBg, { backgroundColor: colors.cyanDim }]} />
        <Text style={[styles.synthesisLabel, { color: colors.cyan }]}>TOTEM PROFILE</Text>
        {synthLoading ? (
          <BreathingDots dotColor={colors.cyan} />
        ) : (
          <View style={styles.wordFlow}>
            {synthesis.split(' ').map((w, wi) => (
              <Word key={wi} word={w} isUser={false} onLongPress={onWordLongPress} textColor={colors.text} userTextColor={colors.text} />
            ))}
          </View>
        )}
      </View>

      {/* Footer prompt */}
      <Text style={[styles.animalReadingFooter, { color: colors.textDim }]}>
        which of these lands closest to the truth right now?
      </Text>
    </Animated.View>
  );
}

async function getTodaysReflectionFromNotifications(): Promise<string | null> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const drefls = scheduled.filter(n => n.identifier.startsWith('symponia-drefl-'));
  if (drefls.length === 0) return null;

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const todays = drefls.find(n => n.identifier === `symponia-drefl-${today}`);
  const tomorrows = drefls.find(n => n.identifier === `symponia-drefl-${tomorrow}`);

  const chosen = todays || tomorrows;
  return chosen?.content?.body as string | null;
}

// ── Dialogo Screen ────────────────────────────────────────────────────────────

export default function DialogoScreen() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const { colors, isDark } = useTheme();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [showControls, setShowControls] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [resonanceScore, setResonanceScore] = useState(0.5);
  const [currentMode, setCurrentMode] = useState('');
  const [isLoadingMode, setIsLoadingMode] = useState(false);

  const [selectedWord, setSelectedWord] = useState('');
  const [archetypeText, setArchetypeText] = useState('');
  const [archetypeLoading, setArchetypeLoading] = useState(false);
  const [showArchetype, setShowArchetype] = useState(false);

  const [tokens, setTokens] = useState(TRIAL_TOKENS);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriptionExpiry, setSubscriptionExpiry] = useState<string | null>(null);
  const [showSubscriberEmpty, setShowSubscriberEmpty] = useState(false);
  const [aiConsentRevoked, setAiConsentRevoked] = useState(false);
  const [userAnimals, setUserAnimals] = useState<string[]>([]);
  const [localAnimals, setLocalAnimals] = useState<string[]>([]);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const [kbHeight, setKbHeight] = useState(0);

  // Keep refs so stale-closure callbacks can read latest values
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const currentModeRef = useRef('');
  useEffect(() => { currentModeRef.current = currentMode; }, [currentMode]);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKbHeight(e.endCoordinates.height);
        setShowControls(true);
        controlsY.value = withSpring(0, { damping: 20, stiffness: 200 });
        controlsOpacity.value = withTiming(1, { duration: 200 });
      },
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => { setKbHeight(0); },
    );
    return () => { show.remove(); hide.remove(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abortRef = useRef<(() => void) | null>(null);
  const inputRef = useRef<TextInput>(null);
  const controlsY = useSharedValue(0);
  const controlsOpacity = useSharedValue(1);

  const controlsStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: controlsY.value }],
    opacity: controlsOpacity.value,
  }));

  // Sync tokens + subscription + consent status
  useEffect(() => {
    syncTokens().then(setTokens);
    checkSubscription().then(setIsSubscribed);
    AsyncStorage.getItem('symponia_ai_consent').then((v) => setAiConsentRevoked(v === 'revoked'));
    AsyncStorage.getItem('symponia_subscription_expires').then(setSubscriptionExpiry);
  }, []);

  // Re-sync on tab focus (e.g. returning from paywall)
  useFocusEffect(useCallback(() => {
    syncTokens().then(setTokens);
    checkSubscription().then(setIsSubscribed);
    AsyncStorage.getItem('symponia_ai_consent').then((v) => setAiConsentRevoked(v === 'revoked'));
    AsyncStorage.getItem('symponia_subscription_expires').then(setSubscriptionExpiry);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []));

  // ── In-App Purchase UI listener ────────────────────────────────────────────
  // Verification and finishTransaction are handled by the global listener in
  // _layout.tsx. This listener only updates React state for immediate UI feedback.
  useEffect(() => {
    const removePurchaseListeners = setupPurchaseListeners(
      async (purchase) => {
        if (!SUBSCRIPTION_PRODUCTS.some((p) => p.id === purchase.productId)) return;
        // Global listener is running verifyAndFinishPurchase concurrently.
        // Update subscription UI optimistically; syncTokens picks up the server
        // value written by the global listener.
        setIsSubscribed(true);
        try {
          const count = await syncTokens();
          setTokens(count);
        } catch {}
      },
      (err) => {
        if ((err as any).code !== 'E_USER_CANCELLED') {
          console.warn('[IAP] purchase error in echo:', err);
        }
      },
    );

    return () => {
      removePurchaseListeners();
      // Connection lifecycle managed by _layout.tsx global IAP handler.
    };
  }, []);


  // Input visibility is keyboard-driven; nothing to restore on tab focus.

  // Read pending mode when tab is focused — resume if same mode, switch if different
  useFocusEffect(
    useCallback(() => {
      AsyncStorage.multiGet([
        'symponia_pending_mode',
        'symponia_active_mode',
        'symponia_animals',
      ]).then(([[, pendingMode], [, activeMode], [, animalsRaw]]) => {

        // Loads a mode: sets state, persists active_mode, fetches history or greeting
        const loadMode = async (mode: string) => {
          setCurrentMode(mode);
          setLocalAnimals([]);
          AsyncStorage.setItem('symponia_active_mode', mode);

          if (animalsRaw) setUserAnimals(JSON.parse(animalsRaw));

          setIsLoadingMode(true);
          setMessages([]);
          const saved = await loadConversation(mode);
          if (saved.length > 0) {
            setMessages(saved);
            setIsLoadingMode(false);
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 80);
            return;
          }
          // No history — show opening greeting
          let greeting = '';
          if (mode === 'daily') {
            const reflection = await getTodaysReflectionFromNotifications();
            if (reflection) greeting = reflection;
          } else if (mode === 'animal' && animalsRaw) {
            const animals: string[] = JSON.parse(animalsRaw);
            greeting = animals.length > 0 ? buildAnimalGreeting(animals) : (MODE_GREETINGS[mode] ?? '');
          } else {
            greeting = MODE_GREETINGS[mode] ?? '';
          }
          setMessages(greeting ? [{ id: 'oracle-0', role: 'assistant', text: greeting }] : []);
          setIsLoadingMode(false);
        };

        // Case 1: User tapped a tile — pendingMode is set
        if (pendingMode) {
          AsyncStorage.removeItem('symponia_pending_mode');

          if (pendingMode === activeMode) {
            // Same mode re-tapped — resume current conversation without reloading
            return;
          }

          // Different mode — save outgoing conversation, then switch
          if (activeMode && messagesRef.current.length > 0) {
            saveConversation(activeMode, messagesRef.current);
          }
          loadMode(pendingMode);
          return;
        }

        // Case 2: Tab-bar navigation with no pending mode — restore last active mode on cold mount
        if (activeMode && !currentModeRef.current) {
          loadMode(activeMode);
          return;
        }

        // Case 3: No mode anywhere — empty state, "i have been waiting for you" shows naturally
      });
    }, [])
  );

  const toggleControls = () => {
    inputRef.current?.focus();
  };

  const sendMessage = useCallback(async () => {
    const trimmed = inputText.trim();
    if (!trimmed || isStreaming) return;

    const consent = await AsyncStorage.getItem('symponia_ai_consent');
    if (consent !== 'true') {
      Alert.alert(
        'AI consent required',
        'You have not granted permission for AI processing. Enable it in Profile → Data & Account.',
        [{ text: 'OK' }],
      );
      return;
    }

    if (tokens <= 0) {
      if (isSubscribed) {
        setShowSubscriberEmpty(true);
      } else {
        router.push('/paywall' as any);
      }
      return;
    }

    const [frequency, userName, userGender, animalsRaw] = await Promise.all([
      AsyncStorage.getItem('symponia_frequency').then((v) => v ?? 'Intellectual'),
      AsyncStorage.getItem('symponia_name').then((v) => v ?? undefined),
      AsyncStorage.getItem('symponia_gender').then((v) => v ?? undefined),
      AsyncStorage.getItem('symponia_animals'),
    ]);
    const userAnimals: string[] | undefined = animalsRaw ? JSON.parse(animalsRaw) : undefined;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    Keyboard.dismiss();
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    setIsStreaming(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const history: Message[] = messages.map((m) => ({ role: m.role, content: m.text }));

    const botId = (Date.now() + 1).toString();
    setMessages((prev) => [...prev, { id: botId, role: 'assistant', text: '' }]);

    let fullResponse = '';
    const depth = Math.min(trimmed.length / 300, 0.15);
    setResonanceScore((r) => Math.min(r + depth, 1.0));

    // Haptic heartbeat — rhythmic pulse while oracle is speaking
    const heartbeat = setInterval(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, 1800);

    const abort = streamChat(
      trimmed, history, frequency, currentMode,

      (token) => {
        fullResponse += token;
        setMessages((prev) => prev.map((m) => (m.id === botId ? { ...m, text: fullResponse } : m)));
        scrollRef.current?.scrollToEnd({ animated: false });
      },
      async (full) => {
        clearInterval(heartbeat);
        setIsStreaming(false);
        if (!full) return;

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Deduct one token for every response
        setTokens((t) => {
          const next = Math.max(0, t - 1);
          deductToken(next);
          return next;
        });

        // Persist with the final complete text — messagesRef may still have the
        // empty placeholder, so build the correct final list explicitly.
        const finalMessages = messagesRef.current.map((m) =>
          m.id === botId ? { ...m, text: full } : m
        );
        saveConversation(currentMode, finalMessages);

        const allText = trimmed + ' ' + full;
        const tags = extractSemanticTags(allText);
        const firstSentence = full.split(/[.?!]/)[0]?.trim() ?? full;
        const node: EchoNodeData = {
          id: Date.now().toString(),
          x: Math.random() * 80 + 10,
          y: Math.random() * 80 + 10,
          resonanceScore: Math.min(resonanceScore + depth, 1.0),
          semanticTags: tags.length ? tags : ['void'],
          coreInsight: firstSentence.slice(0, 120),
          timestamp: Date.now(),
        };
        const existing = await AsyncStorage.getItem('symponia_echo_nodes');
        const parsed: EchoNodeData[] = existing ? JSON.parse(existing) : [];
        await AsyncStorage.setItem('symponia_echo_nodes', JSON.stringify([...parsed, node]));
      },
      (err) => {
        if (err.message === 'AI_CONSENT_REQUIRED') {
          setMessages((prev) => prev.filter((m) => m.id !== botId));
          Alert.alert(
            'AI consent required',
            'You have not granted permission for AI processing. Enable it in Profile → Data & Account.',
            [{ text: 'OK' }],
          );
        }
      },
    );

    abortRef.current = () => { clearInterval(heartbeat); abort(); };
  }, [inputText, isStreaming, messages, resonanceScore, currentMode]);

  const openArchetype = useCallback(async (word: string) => {
    const [frequency, userName, userGender] = await Promise.all([
      AsyncStorage.getItem('symponia_frequency').then((v) => v ?? 'Intellectual'),
      AsyncStorage.getItem('symponia_name').then((v) => v ?? undefined),
      AsyncStorage.getItem('symponia_gender').then((v) => v ?? undefined),
    ]);
    setSelectedWord(word);
    setArchetypeText('');
    setArchetypeLoading(true);
    setShowArchetype(true);
    let accumulated = '';
    streamArchetype(word, frequency, currentMode,
      (token) => { accumulated += token; setArchetypeText(accumulated); },
      () => setArchetypeLoading(false),
      (_err) => {
        setShowArchetype(false);
        setArchetypeLoading(false);
        Alert.alert(
          'AI consent required',
          'You have not granted permission for AI processing. Enable it in Profile → Data & Account.',
          [{ text: 'OK' }],
        );
      },
    );
  }, [currentMode]);

  const [showHelp, setShowHelp] = useState(false);

  const inputBg = isDark ? 'rgba(14,11,26,0.55)' : colors.bgMid + '8C';
  const modeLabel = currentMode ? (MODE_LABELS[currentMode] ?? 'SYMPONIA') : 'SYMPONIA · CHAT';

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: colors.bg }]}>
      <TouchableWithoutFeedback onPress={toggleControls}>
        <View style={StyleSheet.absoluteFill} />
      </TouchableWithoutFeedback>

      {/* Header area — badge + token bar + help overlay all relative to this container */}
      <View style={styles.headerArea}>
        {/* Mode badge */}
        <View style={[styles.modeBadge, { borderColor: colors.glassBorder, backgroundColor: isDark ? 'rgba(8,6,28,0.70)' : colors.bgMid + 'B3' }]}>
          <TouchableOpacity
            style={styles.helpBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowHelp((v) => !v); }}
            hitSlop={10}
            activeOpacity={0.7}
          >
            <Text style={[styles.helpBtnText, { color: showHelp ? colors.cyan : colors.textDim }]}>?</Text>
          </TouchableOpacity>
          <Text style={[styles.modeBadgeText, { color: colors.textDim }]}>{modeLabel}</Text>
          <View style={styles.badgeRight}>
            {!isSubscribed && (
              <Text style={[styles.tokenCount, { color: tokens <= 3 ? '#e07070' : colors.textDim }]}>
                {tokens}
              </Text>
            )}
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (currentMode) clearConversation(currentMode);
                setMessages([]);
              }}
              hitSlop={12}
              activeOpacity={0.6}
            >
              <Text style={[styles.clearBtnText, { color: colors.textSub }]}>↺</Text>
            </TouchableOpacity>
          </View>
        </View>
        {!isSubscribed && (
          <View style={[styles.tokenBarWrap, { borderBottomColor: colors.glassBorder }]}>
            <View style={styles.tokenBarRow}>
              <View style={styles.tokenBarTrack}>
                <View style={[styles.tokenBarFill, { width: `${Math.min(tokens / 50, 1) * 100}%`, backgroundColor: tokens <= 3 ? '#e07070CC' : colors.cyan + 'CC' }]} />
              </View>
            </View>
            <View style={styles.tokenBarLabels}>
              <Text style={[styles.tokenBarLabel, { color: tokens <= 3 ? '#e07070AA' : colors.cyan + 'AA' }]}>
                {tokens} REFLECTION{tokens !== 1 ? 'S' : ''} REMAINING
              </Text>
              <Text style={[styles.tokenBarLabel, { color: colors.textDim }]}>1 REFLECTION = 1 RESPONSE</Text>
            </View>
          </View>
        )}

        {/* Help bubble — absolute, drops below the header, overlays scroll content */}
        {showHelp && (
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(150)}
            style={[styles.helpBubble, { backgroundColor: isDark ? 'rgba(14,11,30,0.97)' : colors.bgMid + 'F8', borderColor: colors.glassBorderStrong }]}
          >
            <TouchableOpacity onPress={() => setShowHelp(false)} style={styles.helpBubbleClose} activeOpacity={0.7}>
              <Text style={[styles.helpBubbleCloseText, { color: colors.textDim }]}>close ×</Text>
            </TouchableOpacity>
            {([
              { icon: '⟳', label: 'hold any word to hear its archetype', desc: "long-press any word in Symponia's response to hear its archetype" },
              { icon: '◎', label: 'history saved on this device', desc: 'conversations are stored locally and survive restarts, but not reinstalls or new devices' },
              { icon: '↺', label: 'clear button resets a session', desc: 'tap ↺ in the mode badge to wipe the current chat and begin fresh' },
              { icon: '→', label: 'ask more in archetype sessions', desc: "each gift, shadow and action layer has an \"ask more →\" link — tap to go deeper with Symponia" },
            ] as const).map(({ icon, label, desc }) => (
              <View key={label} style={[styles.helpRow, { borderBottomColor: colors.glassBorder }]}>
                <Text style={[styles.helpRowIcon, { color: colors.cyan }]}>{icon}</Text>
                <View style={styles.helpRowBody}>
                  <Text style={[styles.helpRowLabel, { color: colors.text }]}>{label}</Text>
                  <Text style={[styles.helpRowDesc, { color: colors.textDim }]}>{desc}</Text>
                </View>
              </View>
            ))}
          </Animated.View>
        )}
      </View>

      {/* Messages — fills remaining space below the badge */}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, {
          paddingBottom: currentMode === 'animal' && userAnimals.length === 0 && localAnimals.length < 7
            ? insets.bottom + 230
            : insets.bottom + 160,
        }]}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={() => Keyboard.dismiss()}
        onScroll={(e) => {
          const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
          const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
          setShowScrollBtn(distanceFromBottom > 120);
        }}
        scrollEventThrottle={100}
      >
        {messages.length === 0 && (
          <Animated.View entering={FadeIn.duration(600)} style={styles.emptyHint}>
            {isLoadingMode ? (
              <>
                <BreathingDots dotColor={colors.cyan} />
                <Text style={[styles.emptyHintLang, { color: colors.textDim, marginTop: 12 }]}>
                  loading your conversation
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.emptyHintText, { color: colors.textDim }]}>
                  i have been waiting for you
                </Text>
                <Text style={[styles.emptyHintLang, { color: colors.textDim }]}>
                  speak in any tongue · I will answer in yours
                </Text>
                <Text style={[styles.emptyHintCue, { color: colors.cyan }]}>
                  hold any word in a reply to hear its archetype
                </Text>
              </>
            )}
          </Animated.View>
        )}
        {messages.map((msg, idx) => {
          // Animal mode structured reading — either pre-loaded (oracle-0) or just-picked (oracle-reading)
          if (
            currentMode === 'animal' &&
            userAnimals.length > 0 &&
            (msg.id === 'oracle-reading' || (idx === 0 && msg.id === 'oracle-0'))
          ) {
            return <AnimalReadingView key={msg.id} animals={userAnimals} onAskMore={(text) => { setInputText(text); inputRef.current?.focus(); }} onWordLongPress={openArchetype} />;
          }
          return <MessageBubble key={msg.id} message={msg} onWordLongPress={openArchetype} />;
        })}
        {isStreaming && messages[messages.length - 1]?.text === '' && (
          <BreathingDots dotColor={colors.cyan} />
        )}
      </ScrollView>

      {/* Animal emoji picker — only show while collecting, hide once 7 picked or pre-loaded */}
      {currentMode === 'animal' && userAnimals.length === 0 && localAnimals.length < 7 && (
        <Animated.View
          entering={FadeIn.duration(200)}
          style={[styles.emojiBar, { bottom: kbHeight > 0 ? kbHeight + 70 : insets.bottom + 70 + 62, borderColor: colors.glassBorder }]}
        >
          <BlurView intensity={60} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(14,11,26,0.72)' : colors.bgMid + 'D0', borderRadius: 16 }]} />
          {/* Selected animal chips + counter */}
          {localAnimals.length > 0 && (
            <View style={styles.animalChipsRow}>
              {localAnimals.map((name, i) => (
                <Text key={i} style={styles.animalChipEmoji}>
                  {ANIMAL_EMOJI_MAP[name] ?? '🐾'}
                </Text>
              ))}
              <Text style={[styles.animalChipCount, { color: colors.cyan }]}>
                {localAnimals.length} / 7
              </Text>
            </View>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.emojiScroll} keyboardShouldPersistTaps="always">
            {ANIMAL_PALETTE.map((a, i) => {
              const picked = localAnimals.includes(a.n);
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.emojiBtn, picked && styles.emojiBtnPicked]}
                  onPress={() => {
                    const name = a.n;
                    if (localAnimals.includes(name) || localAnimals.length >= 7) return;
                    const next = [...localAnimals, name];
                    setLocalAnimals(next);
                    if (next.length === 7) {
                      // Store only in component state — never overwrite the user's saved profile animals
                      setUserAnimals(next);
                      setMessages((msgs) => [...msgs, { id: 'oracle-reading', role: 'assistant', text: '' }]);
                      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
                    }
                  }}
                  activeOpacity={0.6}
                >
                  <Text style={[styles.emojiText, picked && { opacity: 0.3 }]}>{a.e}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Animated.View>
      )}

      {/* Scroll-to-bottom button */}
      {showScrollBtn && (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(150)}
          style={[styles.scrollDownBtn, { bottom: kbHeight > 0 ? kbHeight + 78 : insets.bottom + 148, borderColor: colors.glassBorder, backgroundColor: isDark ? 'rgba(14,11,26,0.88)' : colors.bgMid + 'EE' }]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            onPress={() => {
              scrollRef.current?.scrollToEnd({ animated: true });
              setShowScrollBtn(false);
            }}
            activeOpacity={0.7}
            hitSlop={8}
          >
            <Text style={[styles.scrollDownIcon, { color: colors.cyan }]}>↓</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Input bar */}
      <Animated.View style={[styles.inputWrapper, controlsStyle, { bottom: kbHeight > 0 ? kbHeight + 8 : insets.bottom + 70 }]}>
        <Text style={[styles.languageHint, { color: colors.textDim }]}>
          speak in any tongue · Sense meets you there
        </Text>
        <View style={[styles.inputContainer, { borderColor: colors.glassBorder }]}>
          <BlurView intensity={50} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          <View style={[styles.inputBg, { backgroundColor: inputBg }]} />
          <View style={[styles.inputBorderTop, { backgroundColor: colors.glassBorderStrong }]} />
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              style={[styles.textInput, { color: colors.text }]}
              value={inputText}
              onChangeText={setInputText}
              placeholder={currentMode === 'animal' && userAnimals.length === 0 && localAnimals.length === 0 ? 'tap animals above...' : 'speak...'}
              placeholderTextColor={colors.textDim}
              multiline
              returnKeyType="default"
              submitBehavior="newline"
            />
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: colors.cyanDim, borderColor: colors.cyanBorder }, isStreaming && styles.sendBtnDisabled]}
              onPress={sendMessage}
              disabled={isStreaming}
            >
              <Text style={[styles.sendIcon, { color: colors.cyan }]}>{isStreaming ? '···' : '↑'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      {/* Archetype sheet */}
      {showArchetype && (
        <ArchetypeSheet
          word={selectedWord}
          text={archetypeText}
          isLoading={archetypeLoading}
          onClose={() => setShowArchetype(false)}
        />
      )}

      {/* Subscriber reflections depleted overlay */}
      {showSubscriberEmpty && (
        <Animated.View
          entering={FadeIn.duration(250)}
          style={[StyleSheet.absoluteFill, styles.tokenOverlay, { backgroundColor: isDark ? 'rgba(6,4,20,0.92)' : colors.bg + 'E8' }]}
        >
          <TouchableWithoutFeedback onPress={() => setShowSubscriberEmpty(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View style={[styles.tokenSheet, { borderColor: colors.cyanBorder }]}>
            <BlurView intensity={60} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
            <View style={[styles.tokenSheetBg, { backgroundColor: isDark ? 'rgba(8,6,28,0.6)' : colors.bgMid + '99' }]} />
            <Text style={[styles.tokenTitle, { color: colors.cyan }]}>REFLECTIONS RENEWED SOON</Text>
            <Text style={[styles.tokenBody, { color: colors.textSub }]}>
              {"You've used all 350 reflections for this month."}
            </Text>
            {subscriptionExpiry && (
              <Text style={[styles.tokenBody, { color: colors.textDim, fontSize: 13 }]}>
                {`Your reflections renew on ${new Date(subscriptionExpiry).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}.`}
              </Text>
            )}
            <TouchableOpacity
              style={[styles.tokenBtn, { backgroundColor: colors.cyanDim, borderColor: colors.cyanBorder, marginTop: 8 }]}
              onPress={() => Linking.openURL('itms-apps://apps.apple.com/account/subscriptions')}
              activeOpacity={0.75}
            >
              <Text style={[styles.tokenBtnText, { color: colors.cyan }]}>manage subscription</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowSubscriberEmpty(false)} style={styles.tokenDismiss}>
              <Text style={[styles.tokenDismissText, { color: colors.textDim }]}>not now</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* AI consent revoked gate */}
      {aiConsentRevoked && (
        <Animated.View
          entering={FadeIn.duration(250)}
          style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(6,4,20,0.96)' : colors.bg + 'F4', alignItems: 'center', justifyContent: 'center', padding: 32 }]}
        >
          <Text style={[styles.tokenTitle, { color: colors.text, textAlign: 'center', marginBottom: 12 }]}>
            AI processing is disabled
          </Text>
          <Text style={[styles.tokenBody, { color: colors.textSub, textAlign: 'center', marginBottom: 24 }]}>
            {"You've revoked consent for AI processing. To chat with Symponia, re-enable it in your profile."}
          </Text>
          <TouchableOpacity
            style={[styles.tokenBtn, { backgroundColor: colors.cyanDim, borderColor: colors.cyanBorder }]}
            onPress={() => router.navigate('/(tabs)/pulse')}
            activeOpacity={0.75}
          >
            <Text style={[styles.tokenBtnText, { color: colors.cyan }]}>Go to Profile</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const FONT = Platform.select({ ios: 'Helvetica Neue', android: 'Roboto', default: 'System' });

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16 },

  emptyHint: { flex: 1, alignItems: 'center', paddingTop: 100, gap: 10 },
  emptyHintText: {
    fontSize: 13,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.3,
  },
  emptyHintLang: {
    fontSize: 12,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.8,
    opacity: 0.7,
  },
  emptyHintCue: {
    fontSize: 11,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.3,
    opacity: 0.85,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 32,
  },

  // Header area (badge + token bar + help overlay container)
  headerArea: { zIndex: 100 },

  // Mode badge
  modeBadge: {
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    overflow: 'hidden',
  },
  modeBadgeText: {
    fontSize: 9,
    letterSpacing: 2.5,
    fontFamily: FONT,
    fontWeight: '400',
  },
  tokenCount: {
    fontSize: 9,
    letterSpacing: 1,
    fontFamily: FONT,
    fontWeight: '400',
  },
  tokenBarWrap: {
    paddingHorizontal: 16,
    paddingTop: 7,
    paddingBottom: 6,
    borderBottomWidth: 0.5,
  },
  tokenBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tokenBarTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  tokenBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  tokenBarLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  tokenBarLabel: {
    fontSize: 8,
    letterSpacing: 1.2,
    fontFamily: FONT,
    fontWeight: '400',
  },

  // Token CTA overlay
  tokenOverlay: { justifyContent: 'center', alignItems: 'center' },
  tokenSheet: {
    marginHorizontal: 28,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 0.5,
    padding: 32,
    alignItems: 'center',
    gap: 16,
  },
  tokenSheetBg: { ...StyleSheet.absoluteFillObject },
  tokenTitle: {
    fontSize: 10,
    letterSpacing: 4,
    fontFamily: FONT,
    fontWeight: '500',
  },
  tokenBody: {
    fontSize: 15,
    fontFamily: FONT,
    fontWeight: '400',
    lineHeight: 24,
    textAlign: 'center',
  },
  tokenBtn: {
    borderRadius: 22,
    borderWidth: 0.5,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
    marginTop: 4,
  },
  tokenBtnText: {
    fontSize: 13,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.3,
  },
  tokenDismiss: { paddingVertical: 8, paddingHorizontal: 20 },
  tokenDismissText: {
    fontSize: 11,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 1,
  },

  // Message bubble
  bubbleRow: { flexDirection: 'row', marginRight: 52 },
  bubbleRowUser: { flexDirection: 'row-reverse', marginRight: 0, marginLeft: 52 },
  bubbleOuter: {
    borderRadius: 20, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 12, elevation: 8,
  },
  bubbleBg: { ...StyleSheet.absoluteFillObject },
  bubbleBorder: { ...StyleSheet.absoluteFillObject, borderRadius: 20, borderWidth: 0.5 },
  bubbleContent: { padding: 14 },
  wordFlow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'flex-start' },
  wordText: {
    fontSize: 15,
    fontFamily: FONT,
    fontWeight: '400',
    lineHeight: 22,
    textAlign: 'left',
    writingDirection: 'ltr',
  },

  // Dots
  dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingTop: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },

  // Emoji bar
  animalChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 4,
  },
  animalChipEmoji: { fontSize: 20 },
  animalChipCount: { fontSize: 9, fontFamily: FONT, fontWeight: '500', letterSpacing: 1.5, marginLeft: 6 },
  emojiBtnPicked: { opacity: 0.35 },
  emojiBar: { position: 'absolute', left: 16, right: 16, borderRadius: 16, borderWidth: 0.5, overflow: 'hidden' },
  emojiScroll: { paddingHorizontal: 8, paddingVertical: 6, gap: 2 },
  emojiBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  emojiText: { fontSize: 26 },

  // Input
  inputWrapper: { position: 'absolute', left: 16, right: 16 },
  languageHint: {
    fontSize: 11,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 1.2,
    textAlign: 'center',
    marginBottom: 6,
    opacity: 0.75,
  },
  inputContainer: { borderRadius: 22, overflow: 'hidden', borderWidth: 0.5, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 18, elevation: 12 },
  inputBg: { ...StyleSheet.absoluteFillObject },
  inputBorderTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 0.5 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: 10, gap: 10 },
  textInput: { flex: 1, fontSize: 15, fontFamily: FONT, fontWeight: '400', maxHeight: 100, paddingVertical: 6, paddingHorizontal: 4 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 0.5, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.05)' },
  sendIcon: { fontSize: 18, fontWeight: '400' },

  // Animal reading view
  animalReading: { gap: 10 },
  animalReadingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  animalReadingHeaderEmoji: { fontSize: 22 },
  animalCard: {
    borderRadius: 18,
    borderWidth: 0.5,
    overflow: 'hidden',
  },
  animalCardBg: { ...StyleSheet.absoluteFillObject },
  animalCardBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  animalCardPill: {
    borderRadius: 8,
    borderWidth: 0.5,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  animalCardPillText: {
    fontSize: 8,
    fontFamily: FONT,
    fontWeight: '500',
    letterSpacing: 1.8,
  },
  animalCardNum: {
    fontSize: 28,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: -1,
    opacity: 0.35,
  },
  animalCardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  animalCardEmoji: { fontSize: 36 },
  animalCardName: {
    fontSize: 22,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.3,
  },
  animalCardLayers: {
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  animalCardLayer: {
    borderLeftWidth: 2,
    paddingLeft: 10,
    gap: 2,
  },
  animalCardLayerLabel: {
    fontSize: 8,
    fontFamily: FONT,
    fontWeight: '500',
    letterSpacing: 2,
  },
  askMoreBtn: { marginTop: 4, alignSelf: 'flex-start' },
  askMoreText: { fontSize: 10, fontFamily: FONT, fontWeight: '400', letterSpacing: 0.5 },

  // Help button
  helpBtn: { position: 'absolute', left: 14 },
  badgeRight: { position: 'absolute', right: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  clearBtn: {},
  helpBtnText: { fontSize: 11, fontFamily: FONT, fontWeight: '500', letterSpacing: 0.3 },
  clearBtnText: { fontSize: 16, fontFamily: FONT, fontWeight: '400' },

  // Scroll-to-bottom button
  scrollDownBtn: {
    position: 'absolute',
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 0.5,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  scrollDownIcon: { fontSize: 18, fontFamily: FONT, fontWeight: '400', lineHeight: 22 },

  // Help bubble
  helpBubble: {
    position: 'absolute',
    top: '100%',
    left: 12,
    right: 12,
    borderRadius: 18,
    borderWidth: 0.5,
    overflow: 'hidden',
    zIndex: 200,
    elevation: 20,
  },
  helpBubbleClose: { alignSelf: 'flex-end', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  helpBubbleCloseText: { fontSize: 10, fontFamily: FONT, fontWeight: '400', letterSpacing: 0.5 },
  helpRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  helpRowIcon: { fontSize: 14, width: 18, textAlign: 'center', marginTop: 1 },
  helpRowBody: { flex: 1, gap: 3 },
  helpRowLabel: { fontSize: 12, fontFamily: FONT, fontWeight: '400', letterSpacing: 0.2 },
  helpRowDesc: { fontSize: 11, fontFamily: FONT, fontWeight: '400', lineHeight: 16, letterSpacing: 0.1 },

  animalCardLayerText: {
    fontSize: 12,
    fontFamily: FONT,
    fontWeight: '400',
    lineHeight: 18,
  },
  synthesisCard: {
    borderRadius: 18,
    borderWidth: 0.5,
    overflow: 'hidden',
    padding: 18,
    gap: 10,
    minHeight: 80,
  },
  synthesisBg: { ...StyleSheet.absoluteFillObject },
  synthesisLabel: {
    fontSize: 8,
    fontFamily: FONT,
    fontWeight: '600',
    letterSpacing: 2.5,
  },
  synthesisText: {
    fontSize: 14,
    fontFamily: FONT,
    fontWeight: '400',
    lineHeight: 22,
    letterSpacing: 0.1,
  },

  animalReadingFooter: {
    fontSize: 11,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.3,
    textAlign: 'center',
    paddingVertical: 8,
    fontStyle: 'italic',
  },

  // Archetype sheet
  sheetPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  sheetBg: { ...StyleSheet.absoluteFillObject },
  sheetBorderTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 0.5 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18, opacity: 0.45 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sheetWord: { fontSize: 10, letterSpacing: 4, fontFamily: FONT, fontWeight: '500', opacity: 0.75 },
  sheetScroll: { flex: 1 },
  sheetText: { fontSize: 15, fontFamily: FONT, fontWeight: '400', lineHeight: 24 },
  sheetCloseText: { fontSize: 11, letterSpacing: 2, fontFamily: FONT, fontWeight: '400' },
});
