import { useTheme } from '@/constants/ThemeContext';
import * as Notifications from 'expo-notifications';
import { topUpDailyReflections } from '@/services/notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ── Mode definitions ──────────────────────────────────────────────────────────

const MODES = [
  {
    id: 'animal',
    glyph: '◈',
    title: 'ARCHETYPE',
    subtitle: 'Seven animals that reveal\nwho you are.',
  },
  {
    id: 'day',
    glyph: '◎',
    title: 'MY DAY',
    subtitle: 'A guided reflection on today — shaped by your archetypes and how you\'re feeling right now.',
  },
  {
    id: 'open',
    glyph: '···',
    title: 'CONVERSATION',
    subtitle: 'Open chat. Bring anything — a question, a thought, a feeling. No structure, no prompt.',
  },
] as const;

// ── Tooltip walkthrough ───────────────────────────────────────────────────────

const WALK_BODIES = [
  'welcome. this is your reflection space.',
  'your daily insight refreshes each morning — personal to you.',
  'choose a mode — archetype, your day, or conversation.',
  '◎ home  ·  ··· speak with Symponia  ·  ◯ profile',
] as const;

type Measurements = {
  header: { y: number; height: number } | null;
  daily: { y: number; height: number } | null;
  modes: { y: number; height: number } | null;
};

function TooltipBubble({
  body,
  onNext,
  onSkip,
  isLast,
  top,
  bottom,
  arrow,
}: {
  body: string;
  onNext: () => void;
  onSkip: () => void;
  isLast: boolean;
  top?: number;
  bottom?: number;
  arrow: 'up' | 'down' | 'none';
}) {
  const { colors, isDark } = useTheme();
  const bubbleBg = isDark ? 'rgba(16,12,32,0.97)' : '#f0f5f4f8';

  return (
    <View
      style={[
        tStyles.bubble,
        top !== undefined ? { top } : { bottom },
        { borderColor: colors.cyanBorder, backgroundColor: bubbleBg },
      ]}
    >
      {arrow === 'up' && (
        <View style={[tStyles.arrowUp, { borderBottomColor: bubbleBg }]} />
      )}
      <Text style={[tStyles.body, { color: isDark ? colors.text : '#1a2a28' }]}>{body}</Text>
      <View style={tStyles.btnRow}>
        <TouchableOpacity onPress={onSkip} hitSlop={8}>
          <Text style={[tStyles.skip, { color: colors.textDim }]}>skip</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[tStyles.nextBtn, { backgroundColor: colors.cyanDim, borderColor: colors.cyanBorder }]}
          onPress={onNext}
          activeOpacity={0.75}
        >
          <Text style={[tStyles.nextText, { color: colors.cyan }]}>{isLast ? 'done' : 'next →'}</Text>
        </TouchableOpacity>
      </View>
      {arrow === 'down' && (
        <View style={[tStyles.arrowDown, { borderTopColor: bubbleBg }]} />
      )}
    </View>
  );
}

function WalkthroughOverlay({
  onDone,
  measurements,
}: {
  onDone: () => void;
  measurements: Measurements;
}) {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const SCREEN_H = Dimensions.get('window').height;
  const BUBBLE_APPROX_H = 130; // approximate height to position "above" elements
  const GAP = 12;

  const [step, setStep] = useState(0);
  const isLast = step === WALK_BODIES.length - 1;

  const next = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isLast) { onDone(); return; }
    setStep((s) => s + 1);
  }, [isLast, onDone]);

  // Compute position for each step based on measured layouts
  const getPosition = (i: number): { top?: number; bottom?: number; arrow: 'up' | 'down' | 'none' } => {
    const { header, daily, modes } = measurements;

    if (i === 0) {
      // Welcome — below the SYMPONIA header, arrow up toward it
      const top = header ? header.y + header.height + GAP : insets.top + 56;
      return { top, arrow: 'up' };
    }
    if (i === 1) {
      // Daily card — bubble below the card, arrow up toward it
      const top = daily ? daily.y + daily.height + GAP : insets.top + 180;
      return { top, arrow: 'up' };
    }
    if (i === 2) {
      // Mode cards — bubble above the cards, arrow down toward them
      const top = modes
        ? modes.y - BUBBLE_APPROX_H - GAP
        : insets.top + 290;
      return { top, arrow: 'down' };
    }
    // Step 3: tab bar — fixed, bubble above it, arrow down
    return { bottom: insets.bottom + 72, arrow: 'down' };
  };

  const pos = getPosition(step);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        entering={FadeIn.duration(250)}
        style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.35)' }]}
        pointerEvents="none"
      />

      {/* Progress dots */}
      <View style={tStyles.progressRow} pointerEvents="none">
        {WALK_BODIES.map((_, i) => (
          <View
            key={i}
            style={[tStyles.progressDot, {
              backgroundColor: i === step ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.25)',
              width: i === step ? 18 : 6,
            }]}
          />
        ))}
      </View>

      {/* Bubble */}
      <Animated.View
        key={step}
        entering={FadeIn.duration(220)}
        exiting={FadeOut.duration(150)}
        style={StyleSheet.absoluteFill}
        pointerEvents="box-none"
      >
        <TooltipBubble
          body={WALK_BODIES[step]}
          isLast={isLast}
          onNext={next}
          onSkip={onDone}
          top={pos.top}
          bottom={pos.bottom}
          arrow={pos.arrow}
        />
      </Animated.View>
    </View>
  );
}

// ── Mode Card ─────────────────────────────────────────────────────────────────

const ModeCard = React.memo(function ModeCard({
  mode,
  index,
  onPress,
}: {
  mode: typeof MODES[number];
  index: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const soon = 'comingSoon' in mode && mode.comingSoon;

  return (
    <Animated.View entering={FadeInDown.duration(260).delay(index * 35)} style={soon && { opacity: 0.45 }}>
      <TouchableOpacity onPress={onPress} activeOpacity={soon ? 1 : 0.72} disabled={soon}>
        <View style={[styles.card, { borderColor: colors.glassBorder }]}>
          <View style={[styles.cardBg, { backgroundColor: colors.glass }]} />
          <View style={[styles.cardBorderTop, { backgroundColor: colors.glassBorderStrong }]} />
          <View style={styles.cardRow}>
            <Text style={[styles.cardGlyph, { color: colors.cyan }]}>{mode.glyph}</Text>
            <View style={styles.cardBody}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{mode.title}</Text>
              <Text style={[styles.cardSubtitle, { color: soon ? colors.textDim : colors.textSub }]}>
                {mode.subtitle}
              </Text>
            </View>
            {!soon && <Text style={[styles.cardChevron, { color: colors.textDim }]}>›</Text>}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

async function getTodayReflection(): Promise<string | null> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const drefl = scheduled.filter((n) => n.identifier.startsWith('symponia-drefl-'));
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })();
  return (
    drefl.find((n) => n.identifier === `symponia-drefl-${today}`)?.content.body ??
    drefl.find((n) => n.identifier === `symponia-drefl-${tomorrow}`)?.content.body ??
    null
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function OracoloScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [dailyTeaser, setDailyTeaser] = useState<string | null>(null);
  const [dailyFailed, setDailyFailed] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [measurements, setMeasurements] = useState<Measurements>({ header: null, daily: null, modes: null });

  // Refs for elements we need to position tooltips near
  const headerRef = useRef<View>(null);
  const dailyCardRef = useRef<View>(null);
  const modeCardsRef = useRef<View>(null);

  const measureAll = useCallback(() => {
    // Small delay to ensure layout is complete
    setTimeout(() => {
      headerRef.current?.measureInWindow((x, y, w, height) => {
        setMeasurements(prev => ({ ...prev, header: { y, height } }));
      });
      dailyCardRef.current?.measureInWindow((x, y, w, height) => {
        setMeasurements(prev => ({ ...prev, daily: { y, height } }));
      });
      modeCardsRef.current?.measureInWindow((x, y, w, height) => {
        setMeasurements(prev => ({ ...prev, modes: { y, height } }));
      });
    }, 80);
  }, []);

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem('symponia_walkthrough_done').then((done) => {
      if (!done) {
        setShowWalkthrough(true);
        measureAll();
      }
    });
  }, [measureAll]));

  useFocusEffect(useCallback(() => {
    getTodayReflection().then((body) => {
      if (body) {
        setDailyTeaser(body);
        setDailyFailed(false);
      } else {
        setDailyTeaser(null);
        setDailyFailed(false);
      }
    });
  }, []));

  const handleDailyRetry = useCallback(async () => {
    setDailyFailed(false);
    try {
      const [animalsRaw, name, frequency] = await Promise.all([
        AsyncStorage.getItem('symponia_animals'),
        AsyncStorage.getItem('symponia_name'),
        AsyncStorage.getItem('symponia_frequency'),
      ]);
      const animals: string[] = animalsRaw ? JSON.parse(animalsRaw) : [];
      await topUpDailyReflections({ name: name ?? undefined, animals, frequency: frequency ?? undefined });
      const body = await getTodayReflection();
      if (body) {
        setDailyTeaser(body);
      } else {
        setDailyFailed(true);
      }
    } catch {
      setDailyFailed(true);
    }
  }, []);

  const dismissWalkthrough = useCallback(() => {
    AsyncStorage.setItem('symponia_walkthrough_done', 'true');
    setShowWalkthrough(false);
  }, []);

  const startMode = useCallback(async (modeId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await AsyncStorage.setItem('symponia_pending_mode', modeId);
    router.navigate('/(tabs)/echo');
  }, []);

  const dailyBg = colors.cyanDim;

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 130 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(280)} style={styles.header}>
          <View ref={headerRef} collapsable={false}>
            <Text style={[styles.appName, { color: colors.cyan }]}>SYMPONIA</Text>
          </View>
        </Animated.View>

        {/* Divider */}
        <Animated.View
          entering={FadeIn.duration(250).delay(80)}
          style={[styles.divider, { backgroundColor: colors.glassBorder }]}
        />

        {/* Daily reading from Sense */}
        <Animated.View entering={FadeInDown.duration(300).delay(100)}>
          <TouchableOpacity ref={dailyCardRef} onPress={() => dailyFailed ? handleDailyRetry() : startMode('daily')} activeOpacity={0.72}>
            <View style={[styles.dailyCard, { borderColor: colors.cyanBorder }]}>
              <View style={[styles.cardBg, { backgroundColor: dailyBg }]} />
              <View style={[styles.cardBorderTop, { backgroundColor: colors.cyanBorder }]} />
              <View style={styles.dailyCardInner}>
                <View style={styles.dailyTop}>
                  <Text style={[styles.dailyLabel, { color: colors.cyan }]}>REFLECTION · TODAY</Text>
                  <Text style={[styles.cardChevron, { color: colors.cyan }]}>›</Text>
                </View>
                <Text style={[styles.dailyTeaser, { color: dailyTeaser ? colors.text : colors.textDim }]} numberOfLines={2}>
                  {dailyTeaser
                    ? dailyTeaser
                    : dailyFailed
                      ? 'Tap to refresh.'
                      : 'your daily reflection is being prepared…'}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* Prompt */}
        <Animated.Text
          entering={FadeIn.duration(250).delay(130)}
          style={[styles.prompt, { color: colors.textDim }]}
        >
          what do you want to reflect on?
        </Animated.Text>

        {/* Mode cards */}
        <View ref={modeCardsRef} style={styles.cards} collapsable={false}>
          {MODES.map((mode, i) => (
            <ModeCard
              key={mode.id}
              mode={mode}
              index={i}
              onPress={() => startMode(mode.id)}
            />
          ))}
        </View>

      </ScrollView>

      {/* Archetype hint — pinned above tab bar */}
      <Animated.View
        entering={FadeIn.duration(250).delay(200)}
        style={[styles.footerBar, { paddingBottom: insets.bottom + 62 }]}
        pointerEvents="none"
      >
        <Text style={[styles.footer, { color: colors.textDim }]}>
          long-press any word to hear its archetype
        </Text>
      </Animated.View>

      {/* First-time tooltip walkthrough */}
      {showWalkthrough && <WalkthroughOverlay onDone={dismissWalkthrough} measurements={measurements} />}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const FONT = Platform.select({ ios: 'Helvetica Neue', android: 'Roboto', default: 'System' });

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20 },

  header: { alignItems: 'center', marginBottom: 24 },
  appName: { fontSize: 14, letterSpacing: 8, fontFamily: FONT, fontWeight: '300' },

  divider: { height: 0.5, marginBottom: 18 },

  dailyCard: { borderRadius: 20, overflow: 'hidden', borderWidth: 0.5, marginBottom: 20 },
  dailyCardInner: { paddingHorizontal: 20, paddingVertical: 18, gap: 8 },
  dailyTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dailyLabel: { fontSize: 9, letterSpacing: 3, fontFamily: FONT, fontWeight: '500' },
  dailyTeaser: { fontSize: 14, fontFamily: FONT, fontWeight: '300', lineHeight: 21, letterSpacing: 0.2 },

  prompt: { fontSize: 11, fontFamily: FONT, fontWeight: '300', letterSpacing: 1, textAlign: 'center', marginBottom: 20 },

  cards: { gap: 12, marginBottom: 32 },
  card: { borderRadius: 20, overflow: 'hidden', borderWidth: 0.5 },
  cardBg: { ...StyleSheet.absoluteFillObject },
  cardBorderTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 0.5 },
  cardRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 20, gap: 16 },
  cardGlyph: { fontSize: 28, width: 38, textAlign: 'center', lineHeight: 34 },
  cardBody: { flex: 1, gap: 5 },
  cardTitle: { fontSize: 10, letterSpacing: 2.5, fontFamily: FONT, fontWeight: '500' },
  cardSubtitle: { fontSize: 13, fontFamily: FONT, fontWeight: '300', lineHeight: 19 },
  cardChevron: { fontSize: 22 },

  footerBar: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', paddingTop: 10 },
  footer: { textAlign: 'center', fontSize: 12, fontFamily: FONT, fontWeight: '300', letterSpacing: 0.5 },
});

// ── Tooltip styles ────────────────────────────────────────────────────────────

const tStyles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    left: 20,
    right: 20,
    borderRadius: 18,
    borderWidth: 0.5,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 14,
    zIndex: 20,
  },
  // Arrow at TOP of bubble (points upward → card is above the bubble)
  arrowUp: {
    alignSelf: 'center',
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -30,
    marginBottom: 0,
  },
  // Arrow at BOTTOM of bubble (points downward → card is below the bubble)
  arrowDown: {
    alignSelf: 'center',
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginBottom: -28,
    marginTop: 0,
  },
  body: {
    fontSize: 14,
    fontFamily: FONT,
    fontWeight: '300',
    lineHeight: 21,
    letterSpacing: 0.2,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skip: {
    fontSize: 11,
    fontFamily: FONT,
    fontWeight: '300',
    letterSpacing: 0.8,
  },
  nextBtn: {
    borderRadius: 14,
    borderWidth: 0.5,
    paddingVertical: 9,
    paddingHorizontal: 18,
  },
  nextText: {
    fontSize: 12,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.5,
  },
  progressRow: {
    position: 'absolute',
    top: 48,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
    zIndex: 21,
  },
  progressDot: {
    height: 3,
    borderRadius: 1.5,
    opacity: 0.85,
  },
});
