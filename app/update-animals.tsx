import { useTheme } from '@/constants/ThemeContext';
import { supabase } from '@/services/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const FONT = Platform.select({ ios: 'Helvetica Neue', android: 'Roboto', default: 'System' });

const { width: SCREEN_W } = Dimensions.get('window');
const COLS = 4;
const CELL_GAP = 8;
const H_PAD = 28;
const CELL_SIZE = (SCREEN_W - H_PAD * 2 - CELL_GAP * (COLS - 1)) / COLS;

const ANIMALS = [
  { emoji: '🦁', name: 'Lion' }, { emoji: '🐅', name: 'Tiger' }, { emoji: '🐆', name: 'Leopard' },
  { emoji: '🐈‍⬛', name: 'Panther' }, { emoji: '🐺', name: 'Wolf' }, { emoji: '🦊', name: 'Fox' },
  { emoji: '🐕', name: 'Dog' }, { emoji: '🐈', name: 'Cat' }, { emoji: '🐻', name: 'Bear' },
  { emoji: '🐼', name: 'Panda' }, { emoji: '🐨', name: 'Koala' }, { emoji: '🦍', name: 'Gorilla' },
  { emoji: '🐎', name: 'Horse' }, { emoji: '🦌', name: 'Deer' }, { emoji: '🦬', name: 'Bison' },
  { emoji: '🦒', name: 'Giraffe' }, { emoji: '🦓', name: 'Zebra' }, { emoji: '🐘', name: 'Elephant' },
  { emoji: '🦏', name: 'Rhino' }, { emoji: '🦛', name: 'Hippo' }, { emoji: '🐗', name: 'Boar' },
  { emoji: '🦘', name: 'Kangaroo' }, { emoji: '🦝', name: 'Raccoon' }, { emoji: '🦦', name: 'Otter' },
  { emoji: '🦡', name: 'Badger' }, { emoji: '🦔', name: 'Hedgehog' }, { emoji: '🐇', name: 'Rabbit' },
  { emoji: '🐿️', name: 'Squirrel' }, { emoji: '🦫', name: 'Beaver' }, { emoji: '🦇', name: 'Bat' },
  { emoji: '🦅', name: 'Eagle' }, { emoji: '🦉', name: 'Owl' }, { emoji: '🦚', name: 'Peacock' },
  { emoji: '🦜', name: 'Parrot' }, { emoji: '🐦‍⬛', name: 'Crow' }, { emoji: '🦩', name: 'Flamingo' },
  { emoji: '🦢', name: 'Swan' }, { emoji: '🕊️', name: 'Dove' }, { emoji: '🐧', name: 'Penguin' },
  { emoji: '🐋', name: 'Whale' }, { emoji: '🐬', name: 'Dolphin' }, { emoji: '🦈', name: 'Shark' },
  { emoji: '🐙', name: 'Octopus' }, { emoji: '🦭', name: 'Seal' }, { emoji: '🐍', name: 'Snake' },
  { emoji: '🐊', name: 'Crocodile' }, { emoji: '🐢', name: 'Turtle' }, { emoji: '🦎', name: 'Lizard' },
  { emoji: '🐸', name: 'Frog' }, { emoji: '🦋', name: 'Butterfly' }, { emoji: '🐝', name: 'Bee' },
  { emoji: '🕷️', name: 'Spider' }, { emoji: '🦂', name: 'Scorpion' },
];

const STAGES = [
  { question: 'which animal\nspeaks to you most?', hint: 'the one you feel most drawn to · your dominant soul', btnLabel: 'this is my animal', need: 1 },
  { question: 'now choose 5 more', hint: 'the ones that come to mind · in any order', btnLabel: 'continue', need: 5 },
  { question: 'and finally\nyour shadow', hint: 'the animal you feel least drawn to · the one that unsettles you', btnLabel: 'this is my shadow', need: 1 },
] as const;

export default function UpdateAnimalsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [stage, setStage] = useState(0);
  const [committed, setCommitted] = useState<string[]>([]);
  const [stagePicked, setStagePicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const config = STAGES[stage];
  const visible = ANIMALS.filter((a) => !committed.includes(a.name));
  const canAdvance = stagePicked.length === config.need;

  const toggle = (name: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (stagePicked.includes(name)) {
      setStagePicked(stagePicked.filter((a) => a !== name));
    } else if (stagePicked.length < config.need) {
      setStagePicked([...stagePicked, name]);
    }
  };

  const advance = async () => {
    if (!canAdvance) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = [...committed, ...stagePicked];

    if (stage < 2) {
      setCommitted(next);
      setStagePicked([]);
      setStage(stage + 1);
      return;
    }

    // Stage 3 complete — save only animals, nothing else
    setSaving(true);
    await AsyncStorage.setItem('symponia_animals', JSON.stringify(next));

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({ animals: next }).eq('user_id', user.id);
    }

    setSaving(false);
    router.back();
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={[styles.progressTrack, { backgroundColor: colors.glassBorder }]}>
        <View style={[styles.progressFill, { backgroundColor: colors.cyan, width: `${(stage / 2) * 100}%` }]} />
      </View>

      <TouchableOpacity style={styles.backBtn} onPress={() => { if (stage > 0) { setStage(stage - 1); setCommitted(committed.slice(0, stage === 2 ? 1 : 0)); setStagePicked([]); } else { router.back(); } }} activeOpacity={0.65}>
        <Text style={[styles.backText, { color: colors.textDim }]}>← back</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Animated.View key={stage} entering={FadeIn.duration(350)} style={styles.wrap}>
          <View style={styles.header}>
            <Text style={[styles.label, { color: colors.textDim }]}>update your animals</Text>
            <Text style={[styles.question, { color: colors.text }]}>{config.question}</Text>
            <Text style={[styles.hint, { color: colors.textDim }]}>{config.hint}</Text>
            <View style={styles.dots}>
              {Array.from({ length: 7 }).map((_, i) => {
                const filled = i < committed.length;
                const active = i >= committed.length && i < committed.length + stagePicked.length;
                return (
                  <View key={i} style={[styles.dot, filled && { backgroundColor: colors.cyan, opacity: 1 }, active && { backgroundColor: colors.cyan, opacity: 0.5 }, !filled && !active && { backgroundColor: colors.glassBorder, opacity: 1 }]} />
                );
              })}
            </View>
          </View>

          <View style={styles.grid}>
            {visible.map((a) => {
              const selected = stagePicked.includes(a.name);
              const rank = stagePicked.indexOf(a.name) + 1;
              return (
                <TouchableOpacity
                  key={a.name}
                  style={[styles.cell, { borderColor: selected ? colors.cyanBorder : colors.glassBorder }, selected && { backgroundColor: colors.cyanDim }]}
                  onPress={() => toggle(a.name)}
                  activeOpacity={0.7}
                >
                  {selected && (
                    <View style={[styles.badge, { backgroundColor: colors.cyan }]}>
                      <Text style={styles.badgeText}>{config.need === 1 ? '✓' : rank}</Text>
                    </View>
                  )}
                  <Text style={styles.emoji}>{a.emoji}</Text>
                  <Text style={[styles.name, { color: selected ? colors.text : colors.textDim }]}>{a.name.toLowerCase()}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {config.need > 1 && (
            <Text style={[styles.count, { color: stagePicked.length === config.need ? colors.cyan : colors.textDim }]}>
              {stagePicked.length} / {config.need}
            </Text>
          )}

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: canAdvance ? colors.cyanDim : 'transparent', borderColor: canAdvance ? colors.cyanBorder : colors.glassBorder }]}
            onPress={advance}
            activeOpacity={canAdvance ? 0.75 : 1}
            disabled={saving}
          >
            <Text style={[styles.btnText, { color: canAdvance ? colors.cyan : colors.textDim }]}>
              {saving ? 'saving…' : config.btnLabel}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  progressTrack: { height: 1 },
  progressFill: { height: 1 },
  backBtn: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 4 },
  backText: { fontFamily: FONT, fontSize: 12, letterSpacing: 0.3 },
  scroll: { flexGrow: 1, paddingHorizontal: H_PAD, paddingTop: 32, paddingBottom: 40 },
  wrap: { flex: 1, gap: 28 },
  header: { gap: 8 },
  label: { fontFamily: FONT, fontSize: 10, letterSpacing: 2, fontWeight: '400' },
  question: { fontSize: 28, fontFamily: FONT, fontWeight: '400', lineHeight: 36, letterSpacing: -0.3 },
  hint: { fontSize: 12, fontFamily: FONT, fontWeight: '400', lineHeight: 18 },
  dots: { flexDirection: 'row', gap: 6, marginTop: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: CELL_GAP },
  cell: { width: CELL_SIZE, height: CELL_SIZE, borderRadius: 14, borderWidth: 0.5, alignItems: 'center', justifyContent: 'center', gap: 4, position: 'relative' },
  emoji: { fontSize: 28, lineHeight: 34 },
  name: { fontSize: 9, fontFamily: FONT, fontWeight: '400', letterSpacing: 0.2 },
  badge: { position: 'absolute', top: 5, right: 5, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 9, fontFamily: FONT, fontWeight: '700', color: '#fff', lineHeight: 11 },
  count: { fontFamily: FONT, fontSize: 11, letterSpacing: 1, textAlign: 'center', fontWeight: '400' },
  btn: { borderRadius: 18, borderWidth: 0.5, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  btnText: { fontSize: 11, letterSpacing: 3, fontFamily: FONT, fontWeight: '500' },
});
