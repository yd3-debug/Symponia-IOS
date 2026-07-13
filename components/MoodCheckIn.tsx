// The mood check-in.
//
// One question. Five faces. Tap one, get something back, gone in two seconds.
//
// ── TWO RULES, LEARNED THE HARD WAY ──────────────────────────────────────────
//
// 1. IT MUST BE FELT, NOT READ. An earlier version used abstract glyphs (◌ ○ ◍)
//    and asked "How are you arriving?" — nobody thinks like that, and there was
//    nothing to connect to. Faces are instant and pre-verbal. That is the point:
//    someone at a 1 should not have to compose a sentence.
//
// 2. THE RESPONSE MUST MATCH THE FEELING. The celebration SCALES with the score.
//    Bursting hearts at someone who just pressed the saddest face is the app
//    telling them it wasn't listening. At the bottom you get something quiet and
//    steady; at the top you get the full burst. Never the wrong one.

import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/Text';
import { t } from '@/constants/i18n';
import { useTheme } from '@/constants/ThemeContext';
import type { Phase } from '@/services/mood';

const FONT = Platform.select({ ios: 'Helvetica Neue', android: 'Roboto', default: 'System' });

/**
 * 1..5. Real faces, because a feeling should be recognised, not decoded.
 * Deliberately five and not ten — a ten-point scale makes people agonise over a
 * number, which is the opposite of arriving.
 */
const FACES = ['😔', '😕', '😐', '🙂', '😄'];

/**
 * What comes back, per score. This table IS the ethic of the whole component.
 *
 * The response is not a reward — it is an answer. It must say the same thing the
 * person just said, back to them, in the app's own voice.
 *
 *   5 😄 — hearts and stars, full burst. They feel good. Celebrate properly.
 *   4 🙂 — stars. Light, warm, unfussy.
 *   3 😐 — a few soft sparks. Acknowledged, not celebrated.
 *   2 😕 — soft white hearts, drifting slowly. Not applause. Company.
 *   1 😔 — 🫂. A HUG, not confetti.
 *
 * The 1 is the one that matters. Someone who taps the saddest face and gets a
 * party has just been told the app wasn't listening — and they will never trust
 * it again. So they get held instead: a slow, warm, quiet response that says
 * *I felt that*. Fewer particles, drifting barely upward, taking their time.
 */
// EVERY EMOJI HERE IS PRE-2017 AND UNIVERSALLY SUPPORTED.
// A draft used 🫂 (Emoji 13, 2020) and 🤍 (Emoji 12, 2019). Both rendered as
// NOTHING — the hug for the saddest face was an empty screen. On an older device
// they'd be tofu boxes. The one moment that must never fail is the one where
// someone has just told you they feel awful.
const BURSTS: Record<number, { glyphs: string[]; count: number; rise: number; speed: number; opacity: number }> = {
  1: { glyphs: ['🤗', '💗'],              count: 5,  rise: -12, speed: 1900, opacity: 0.95 },
  2: { glyphs: ['💗', '·'],               count: 8,  rise: -22, speed: 1500, opacity: 0.85 },
  3: { glyphs: ['✦', '·', '∘'],           count: 10, rise: -34, speed: 1100, opacity: 0.7 },
  4: { glyphs: ['✨', '⭐️', '✦'],          count: 14, rise: -46, speed: 950,  opacity: 0.95 },
  5: { glyphs: ['💛', '✨', '⭐️', '💫'],   count: 18, rise: -58, speed: 900,  opacity: 1 },
};

function Particle({ index, score, burst }: { index: number; score: number; burst: number }) {
  const { colors } = useTheme();
  const cfg = BURSTS[score];
  const p = useSharedValue(0);

  const angle = (index / cfg.count) * Math.PI * 2 + (index % 3);
  const dist = 42 + (index % 5) * 20;
  const dx = Math.cos(angle) * dist;
  const dy = Math.sin(angle) * dist + cfg.rise; // bias upward — things float, they don't fall
  const glyph = cfg.glyphs[index % cfg.glyphs.length];
  // Emoji carry their own colour; the plain glyphs take the theme.
  const isEmoji = /\p{Extended_Pictographic}/u.test(glyph);
  const size = (isEmoji ? 13 : 10) + (index % 4) * 3;

  useEffect(() => {
    if (!burst) return;
    p.value = 0;
    p.value = withDelay(
      (index % 6) * 28,
      withTiming(1, { duration: cfg.speed + (index % 4) * 150, easing: Easing.out(Easing.quad) }),
    );
  }, [burst, index, p, cfg.speed]);

  const style = useAnimatedStyle(() => ({
    opacity: p.value === 0 ? 0 : (1 - p.value) * cfg.opacity,
    transform: [
      { translateX: p.value * dx },
      { translateY: p.value * dy },
      { scale: 0.4 + p.value * 1.05 },
      { rotate: `${p.value * (index % 2 ? 70 : -70)}deg` },
    ],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.particle, style]}>
      <Text raw style={{ fontSize: size, color: isEmoji ? undefined : colors.cyan }}>{glyph}</Text>
    </Animated.View>
  );
}

export function MoodCheckIn({
  phase,
  onDone,
}: {
  phase: Phase;
  /** null = dismissed without answering. That must always stay allowed. */
  onDone: (score: number | null) => void;
}) {
  const { colors, isDark } = useTheme();
  const [picked, setPicked] = useState<number | null>(null);
  const [burst, setBurst] = useState(0);

  const cardScale = useSharedValue(1);
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: cardScale.value }] }));

  const choose = (score: number) => {
    if (picked !== null) return;
    setPicked(score);
    setBurst((b) => b + 1);
    // Even the haptic scales. A success buzz on "I feel awful" is a small insult.
    Haptics.notificationAsync(
      score >= 4
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning,
    );
    cardScale.value = withSequence(
      withSpring(score >= 4 ? 1.05 : 1.02, { damping: 12, stiffness: 260 }),
      withSpring(1, { damping: 14, stiffness: 220 }),
    );
    cardScale.value = withDelay(1250, withTiming(1, { duration: 1 }, (done) => {
      if (done) runOnJS(onDone)(score);
    }));
  };

  // Warm, and TRUE. Never "great job!" to someone who just said they feel awful —
  // that is the app telling them it wasn't listening.
  const closing = picked === null
    ? ''
    : phase === 'before'
      ? picked <= 2
        ? t('Thank you for coming anyway.')
        : picked === 3
          ? t('Okay. Let’s see what’s here.')
          : t('Good. Let’s begin.')
      : picked <= 2
        ? t('Some things take longer than one sitting. You showed up.')
        : picked === 3
          ? t('Not everything shifts today. That’s allowed.')
          : t('Something moved. Carry it gently.');

  return (
    <Animated.View
      entering={FadeIn.duration(260)}
      exiting={FadeOut.duration(220)}
      style={[StyleSheet.absoluteFill, styles.overlay, {
        backgroundColor: isDark ? 'rgba(6,4,20,0.86)' : colors.bg + 'E6',
      }]}
    >
      <Animated.View style={[styles.card, cardStyle, {
        borderColor: colors.cyanBorder,
        backgroundColor: isDark ? 'rgba(16,12,32,0.96)' : '#ffffffF2',
      }]}>
        <Text style={[styles.q, { color: colors.text }]}>
          {phase === 'before' ? t('How are you feeling?') : t('And now?')}
        </Text>

        <View style={styles.row}>
          {FACES.map((f, i) => {
            const score = i + 1;
            const on = picked === score;
            const dimmed = picked !== null && !on;
            return (
              <Pressable
                key={score}
                onPress={() => choose(score)}
                hitSlop={6}
                style={[styles.dot, {
                  borderColor: on ? colors.cyan : 'transparent',
                  backgroundColor: on ? colors.cyanDim : 'transparent',
                  opacity: dimmed ? 0.25 : 1,
                }]}
              >
                <Text raw style={{ fontSize: 30 }}>{f}</Text>
                {on && Array.from({ length: BURSTS[score].count }).map((_, k) => (
                  <Particle key={k} index={k} score={score} burst={burst} />
                ))}
              </Pressable>
            );
          })}
        </View>

        {picked === null ? (
          <Pressable onPress={() => onDone(null)} hitSlop={10}>
            <Text style={[styles.skip, { color: colors.textDim }]}>{t('not now')}</Text>
          </Pressable>
        ) : (
          <Animated.View entering={FadeIn.duration(340).delay(260)}>
            <Text style={[styles.closing, { color: colors.cyan }]}>{closing}</Text>
          </Animated.View>
        )}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  card: {
    width: '86%',
    borderRadius: 24,
    borderWidth: 0.5,
    paddingVertical: 30,
    paddingHorizontal: 18,
    alignItems: 'center',
    gap: 24,
  },
  q: { fontSize: 19, fontFamily: FONT, fontWeight: '500', textAlign: 'center' },
  row: { flexDirection: 'row', gap: 6 },
  dot: {
    width: 54, height: 54, borderRadius: 27, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  particle: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  skip: { fontSize: 13, fontFamily: FONT },
  closing: { fontSize: 14.5, fontFamily: FONT, textAlign: 'center', lineHeight: 21 },
});
