import { useTheme } from '@/constants/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useState } from 'react';
import { Dimensions, Platform, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/Text';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const FONT = Platform.select({ ios: 'Helvetica Neue', android: 'Roboto', default: 'System' });
const TIP_PREFIX = 'symponia_tip_';

export type TipStep = {
  title?: string;
  body: string;
  target?: React.RefObject<any>;
  place?: 'above' | 'below';
};

// First-run gate: shows the tip once per screen, on focus, if not seen before.
export function useFirstTip(tipKey: string) {
  const [visible, setVisible] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      AsyncStorage.getItem(TIP_PREFIX + tipKey).then((done) => {
        if (active && !done) setVisible(true);
      });
      return () => { active = false; };
    }, [tipKey]),
  );
  return { visible, dismiss: useCallback(() => setVisible(false), []) };
}

// Clears the seen-flags so the tips (and the home walkthrough) play again.
export async function resetAllTips() {
  await AsyncStorage.multiRemove([
    'symponia_walkthrough_done',
    TIP_PREFIX + 'chat',
    TIP_PREFIX + 'settings',
  ]);
}

export function CoachTips({ tipKey, steps, onClose }: {
  tipKey: string; steps: TipStep[]; onClose?: () => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const SCREEN_H = Dimensions.get('window').height;
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const isLast = step === steps.length - 1;
  const s = steps[step];

  useEffect(() => {
    const t = s?.target?.current;
    if (!t || typeof t.measureInWindow !== 'function') { setRect(null); return; }
    const id = setTimeout(() => {
      t.measureInWindow((x: number, y: number, w: number, h: number) => {
        // Only anchor to targets that are actually visible. A target below the
        // fold (the archetype card sits deep in the settings scroll) used to
        // push the bubble — and its skip/"got it" buttons — off-screen, leaving
        // just the scrim: a grey, untappable page. Off-screen ⇒ fall back to a
        // centred bubble instead.
        const onScreen = y < SCREEN_H && y + h > 0;
        if ((w > 0 || h > 0) && onScreen) setRect({ x, y, w, h });
        else setRect(null);
      });
    }, 60);
    return () => clearTimeout(id);
  }, [step, s]);

  const finish = useCallback(() => {
    AsyncStorage.setItem(TIP_PREFIX + tipKey, 'true');
    onClose?.();
  }, [tipKey, onClose]);

  const next = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isLast) finish();
    else setStep((v) => v + 1);
  }, [isLast, finish]);

  const GAP = 12;
  const BUB_H = 150;
  let bubbleTop: number;
  if (rect) {
    const below = (s.place ?? (rect.y < SCREEN_H / 2 ? 'below' : 'above')) === 'below';
    bubbleTop = below ? rect.y + rect.h + GAP : Math.max(insets.top + 12, rect.y - GAP - BUB_H);
  } else {
    bubbleTop = SCREEN_H / 2 - 90;
  }
  // Belt and braces: whatever the anchor said, the bubble must stay on screen —
  // it carries the only controls that can dismiss the scrim.
  bubbleTop = Math.min(
    Math.max(bubbleTop, insets.top + 12),
    SCREEN_H - BUB_H - Math.max(insets.bottom, 16),
  );

  const bubbleBg = isDark ? '#171326' : '#FFFFFF';
  const bodyColor = isDark ? colors.textSub : '#33403E';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        entering={FadeIn.duration(220)}
        style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.40)' }]}
        pointerEvents="auto"
      >
        {/* Tapping the scrim dismisses the tip (and marks it seen). This is the
            escape hatch that guarantees no tip can ever trap the user, even if
            a future layout change moves a target somewhere unexpected. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={finish}
          accessibilityRole="button"
          accessibilityLabel="dismiss tip"
        />
      </Animated.View>

      {rect && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: rect.x - 6, top: rect.y - 6, width: rect.w + 12, height: rect.h + 12,
            borderRadius: 16, borderWidth: 1.5, borderColor: colors.cyan,
          }}
        />
      )}

      <Animated.View key={step} entering={FadeIn.duration(200)} style={{ position: 'absolute', left: 20, right: 20, top: bubbleTop }}>
        <View style={{ backgroundColor: bubbleBg, borderRadius: 16, borderWidth: 0.5, borderColor: colors.glassBorder, padding: 16 }}>
          {s.title ? (
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500', marginBottom: 5, fontFamily: FONT }}>{s.title}</Text>
          ) : null}
          <Text style={{ color: bodyColor, fontSize: 13.5, lineHeight: 20, fontFamily: FONT }}>{s.body}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
            <TouchableOpacity onPress={finish} hitSlop={8}>
              <Text style={{ color: colors.textDim, fontSize: 12, fontFamily: FONT }}>skip</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 5 }}>
              {steps.length > 1 && steps.map((_, i) => (
                <View key={i} style={{ width: i === step ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: i === step ? colors.cyan : colors.glassBorder }} />
              ))}
            </View>
            <TouchableOpacity
              onPress={next}
              activeOpacity={0.75}
              style={{ backgroundColor: colors.cyanDim, borderColor: colors.cyanBorder, borderWidth: 0.5, borderRadius: 12, paddingVertical: 7, paddingHorizontal: 14 }}
            >
              <Text style={{ color: colors.cyan, fontSize: 12, fontWeight: '500', fontFamily: FONT }}>{isLast ? 'got it' : 'next →'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}
