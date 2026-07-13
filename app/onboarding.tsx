import { useTheme } from '@/constants/ThemeContext';
import { TRIAL_TOKENS } from '@/constants/config';
import { supabase } from '@/services/supabase';
import { setMemoryEnabled } from '@/services/memory';
import { LANGUAGES, getLanguage, t, type Lang } from '@/constants/i18n';
import { saveLanguage } from '@/services/language';
import { requestNotificationPermission, scheduleDaily } from '@/services/notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Dimensions,
  Keyboard,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '@/components/Text';
import { SocialAuthButtons } from '@/components/SocialAuthButtons';
import Animated, { FadeIn, FadeOut, useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_W } = Dimensions.get('window');
const COLS = 4;
const CELL_GAP = 8;
const H_PAD = 28;
const CELL_SIZE = (SCREEN_W - H_PAD * 2 - CELL_GAP * (COLS - 1)) / COLS;

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 'language' | 'welcome' | 'depth' | 'attune' | 'name' | 'gender' | 'animals' | 'archetype' | 'memory' | 'notifications' | 'tokens' | 'legal';
type Frequency = 'Quiet' | 'Intellectual' | 'Deeply Emotional';

// ── Data ──────────────────────────────────────────────────────────────────────

const GENDERS = [
  { id: 'he/him',            label: 'he / him' },
  { id: 'she/her',           label: 'she / her' },
  { id: 'they/them',         label: 'they / them' },
  { id: 'prefer not to say', label: 'prefer not to say' },
] as const;

const DEPTHS: { id: Frequency; label: string; desc: string }[] = [
  { id: 'Deeply Emotional', label: 'warm & plain',       desc: 'everyday words, gentle, like a friend who gets you' },
  { id: 'Intellectual',     label: 'deep & philosophical', desc: 'goes deep, names the pattern, and pinpoints what hurts' },
  { id: 'Quiet',            label: 'direct & practical', desc: 'short and grounded, one thing to notice' },
];

const ANIMALS = [
  // Big cats & canines
  { emoji: '🦁', name: 'Lion' },
  { emoji: '🐅', name: 'Tiger' },
  { emoji: '🐆', name: 'Leopard' },
  { emoji: '🐈‍⬛', name: 'Panther' },
  { emoji: '🐺', name: 'Wolf' },
  { emoji: '🦊', name: 'Fox' },
  { emoji: '🐕', name: 'Dog' },
  { emoji: '🐈', name: 'Cat' },
  // Bears & primates
  { emoji: '🐻', name: 'Bear' },
  { emoji: '🐼', name: 'Panda' },
  { emoji: '🐨', name: 'Koala' },
  { emoji: '🦍', name: 'Gorilla' },
  // Hooved
  { emoji: '🐎', name: 'Horse' },
  { emoji: '🦌', name: 'Deer' },
  { emoji: '🦬', name: 'Bison' },
  { emoji: '🦒', name: 'Giraffe' },
  { emoji: '🦓', name: 'Zebra' },
  { emoji: '🐘', name: 'Elephant' },
  { emoji: '🦏', name: 'Rhino' },
  { emoji: '🦛', name: 'Hippo' },
  { emoji: '🐗', name: 'Boar' },
  { emoji: '🦘', name: 'Kangaroo' },
  // Small mammals
  { emoji: '🦝', name: 'Raccoon' },
  { emoji: '🦦', name: 'Otter' },
  { emoji: '🦡', name: 'Badger' },
  { emoji: '🦔', name: 'Hedgehog' },
  { emoji: '🐇', name: 'Rabbit' },
  { emoji: '🐿️', name: 'Squirrel' },
  { emoji: '🦫', name: 'Beaver' },
  { emoji: '🦇', name: 'Bat' },
  // Birds
  { emoji: '🦅', name: 'Eagle' },
  { emoji: '🦉', name: 'Owl' },
  { emoji: '🦚', name: 'Peacock' },
  { emoji: '🦜', name: 'Parrot' },
  { emoji: '🐦‍⬛', name: 'Crow' },
  { emoji: '🦩', name: 'Flamingo' },
  { emoji: '🦢', name: 'Swan' },
  { emoji: '🕊️', name: 'Dove' },
  { emoji: '🐧', name: 'Penguin' },
  // Sea creatures
  { emoji: '🐋', name: 'Whale' },
  { emoji: '🐬', name: 'Dolphin' },
  { emoji: '🦈', name: 'Shark' },
  { emoji: '🐙', name: 'Octopus' },
  { emoji: '🦭', name: 'Seal' },
  // Reptiles & amphibians
  { emoji: '🐍', name: 'Snake' },
  { emoji: '🐊', name: 'Crocodile' },
  { emoji: '🐢', name: 'Turtle' },
  { emoji: '🦎', name: 'Lizard' },
  { emoji: '🐸', name: 'Frog' },
  // Insects & arachnids
  { emoji: '🦋', name: 'Butterfly' },
  { emoji: '🐝', name: 'Bee' },
  { emoji: '🕷️', name: 'Spider' },
  { emoji: '🦂', name: 'Scorpion' },
];

// ── Step: Welcome ─────────────────────────────────────────────────────────────

function LanguageStep({ colors, selected, onSelect }: {
  colors: any; selected: Lang; onSelect: (l: Lang) => void;
}) {
  return (
    <Animated.View entering={FadeIn.duration(500)} style={styles.stepWrap}>
      <View style={styles.stepHeader}>
        <Text style={[styles.glyph, { color: colors.violet, textAlign: 'center' }]}>◈</Text>
        <Text style={[styles.stepQuestion, { color: colors.text, textAlign: 'center' }]}>
          {'choose your\nlanguage'}
        </Text>
        <Text style={[styles.stepHint, { color: colors.textDim, textAlign: 'center' }]}>
          Symponia will speak with you in this language
        </Text>
      </View>

      <View style={styles.langGrid}>
        {LANGUAGES.map((l) => {
          const active = selected === l.code;
          return (
            <TouchableOpacity
              key={l.code}
              style={styles.langItem}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSelect(l.code); }}
              activeOpacity={0.75}
            >
              <View
                style={[
                  styles.langCircle,
                  { borderColor: active ? colors.cyan : colors.glassBorder },
                  active && { backgroundColor: colors.cyanDim, borderWidth: 2 },
                ]}
              >
                <Text raw style={styles.langFlag}>{l.flag}</Text>
              </View>
              <Text
                style={[styles.langLabel, { color: active ? colors.cyan : colors.textDim }]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {l.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </Animated.View>
  );
}

function WelcomeStep({ colors, onNext }: { colors: any; onNext: () => void }) {
  return (
    <Animated.View entering={FadeIn.duration(600)} style={styles.stepWrap}>
      <View style={styles.welcomeCenter}>
        <Text style={[styles.glyph, { color: colors.violet }]}>◈</Text>
        <Text style={[styles.appName, { color: colors.cyan }]}>SYMPONIA</Text>
        <Text style={[styles.tagline, { color: colors.textSub }]}>a resonant presence</Text>
        <Text style={[styles.taglineSub, { color: colors.textDim }]}>an AI companion for reflection</Text>
        <Text style={[styles.welcomeBody, { color: colors.textDim }]}>
          {'Before we begin, let us know\na little about who you are.'}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: colors.cyanDim, borderColor: colors.cyanBorder }]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onNext(); }}
        activeOpacity={0.75}
      >
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.primaryBtnText, { color: colors.cyan }]}>begin</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.replace('/signin'); }}
        activeOpacity={0.65}
        style={styles.signInLink}
      >
        <Text style={[styles.signInLinkText, { color: colors.textDim }]}>
          {t('already have an account?')}{'  '}
          <Text style={{ color: colors.cyan }}>sign in</Text>
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Step: Name ────────────────────────────────────────────────────────────────

function NameStep({ colors, name, setName, onNext }: {
  colors: any; name: string; setName: (v: string) => void; onNext: () => void;
}) {
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.stepWrap}>
      <View style={styles.stepHeader}>
        <Text style={[styles.stepLabel, { color: colors.textDim }]}>01 / 06</Text>
        <Text style={[styles.stepQuestion, { color: colors.text }]}>
          {'what shall\nI call you?'}
        </Text>
        <Text style={[styles.stepHint, { color: colors.textDim }]}>
          or leave blank to remain unnamed
        </Text>
      </View>
      <TextInput
        style={[styles.nameInput, { color: colors.text, borderColor: colors.glassBorder }]}
        value={name}
        onChangeText={setName}
        placeholder={t("your name...")}
        placeholderTextColor={colors.textDim}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => { Keyboard.dismiss(); onNext(); }}
        autoCapitalize="words"
        autoCorrect={false}
      />
      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: colors.cyanDim, borderColor: colors.cyanBorder }]}
        onPress={() => { Keyboard.dismiss(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onNext(); }}
        activeOpacity={0.75}
      >
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.primaryBtnText, { color: colors.cyan }]}>continue</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Step: Gender ──────────────────────────────────────────────────────────────

function GenderStep({ colors, gender, setGender, onNext }: {
  colors: any; gender: string; setGender: (v: string) => void; onNext: () => void;
}) {
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.stepWrap}>
      <View style={styles.stepHeader}>
        <Text style={[styles.stepLabel, { color: colors.textDim }]}>02 / 06</Text>
        <Text style={[styles.stepQuestion, { color: colors.text }]}>
          {'how do you move\nthrough the world?'}
        </Text>
      </View>
      <View style={styles.optionList}>
        {GENDERS.map((g) => {
          const active = gender === g.id;
          return (
            <TouchableOpacity
              key={g.id}
              style={[
                styles.optionRow,
                { borderColor: active ? colors.cyanBorder : colors.glassBorder },
                active && { backgroundColor: colors.cyanDim },
              ]}
              onPress={() => { setGender(g.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              activeOpacity={0.7}
            >
              <View style={[styles.radioOuter, { borderColor: active ? colors.cyan : colors.textDim }]}>
                {active && <View style={[styles.radioInner, { backgroundColor: colors.cyan }]} />}
              </View>
              <Text style={[styles.optionLabel, { color: active ? colors.text : colors.textSub }]}>
                {g.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: colors.cyanDim, borderColor: colors.cyanBorder }]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onNext(); }}
        activeOpacity={0.75}
      >
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.primaryBtnText, { color: colors.cyan }]}>continue</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Step: Animals ─────────────────────────────────────────────────────────────
// Three stages:
//   1 → pick your dominant animal (1 choice)
//   2 → pick 5 more that come to mind
//   3 → pick your shadow animal (the one you like least)

const ANIMAL_STAGES = [
  {
    question: 'which animal\nspeaks to you most?',
    hint: 'the one you feel most drawn to · your dominant archetype',
    btnLabel: 'this is my animal',
    need: 1,
  },
  {
    question: 'now choose 5 more',
    hint: 'the ones that come to mind · in any order',
    btnLabel: 'continue',
    need: 5,
  },
  {
    question: 'and finally\nyour shadow',
    hint: 'the animal you feel least drawn to · the one that unsettles you',
    btnLabel: 'this is my shadow',
    need: 1,
  },
] as const;

function AnimalsStep({ colors, animals, setAnimals, cols, setCols, onNext, onBack }: {
  colors: any; animals: string[]; setAnimals: (v: string[]) => void;
  cols: number; setCols: (v: number) => void;
  onNext: () => void; onBack: () => void;
}) {
  // stage 0 = dominant, stage 1 = middle 5, stage 2 = shadow.
  // Progress is reconstructed from the committed flat array so going back —
  // within stages OR returning to this step later — restores prior picks, editable.
  const [stage, setStage] = React.useState(() =>
    animals.length >= 6 ? 2 : animals.length >= 1 ? 1 : 0,
  );
  const [picks, setPicks] = React.useState<string[][]>(() => [
    animals.slice(0, 1),
    animals.slice(1, 6),
    animals.slice(6, 7),
  ]);

  const config = ANIMAL_STAGES[stage];
  const need = config.need;
  const current = picks[stage];

  // Hide animals chosen in OTHER stages; current-stage picks stay shown + selected.
  const otherChosen = picks.flatMap((p, i) => (i === stage ? [] : p));
  const visible = ANIMALS.filter((a) => !otherChosen.includes(a.name));

  const canAdvance = current.length === need;

  // Dynamic cell size drives the 4-col ⇄ 2-col toggle.
  const large = cols === 2;
  const cellSize = (SCREEN_W - H_PAD * 2 - CELL_GAP * (cols - 1)) / cols;

  const setCurrent = (next: string[]) =>
    setPicks((prev) => prev.map((p, i) => (i === stage ? next : p)));

  const commit = (p: string[][]) => setAnimals([...p[0], ...p[1], ...p[2]]);

  const toggle = (name: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (current.includes(name)) setCurrent(current.filter((a) => a !== name));
    else if (current.length < need) setCurrent([...current, name]);
  };

  const advance = () => {
    if (!canAdvance) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    commit(picks);
    if (stage < 2) setStage(stage + 1);
    else onNext();
  };

  const goBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    commit(picks);
    if (stage > 0) setStage(stage - 1);
    else onBack();
  };

  const toggleGrid = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCols(large ? 4 : 2);
  };

  const filledBefore = picks.slice(0, stage).reduce((n, p) => n + p.length, 0);
  const activeNow = current.length;

  return (
    <Animated.View key={stage} entering={FadeIn.duration(350)} style={styles.stepWrap}>
      <View style={styles.stepHeader}>
        <Text style={[styles.stepLabel, { color: colors.textDim }]}>03 / 06</Text>
        <Text style={[styles.stepQuestion, { color: colors.text }]}>
          {config.question}
        </Text>
        <Text style={[styles.stepHint, { color: colors.textDim }]}>
          {config.hint}
        </Text>

        {/* progress dots + grid-size toggle */}
        <View style={styles.animalTopRow}>
          <View style={styles.animalDots}>
            {Array.from({ length: 7 }).map((_, i) => {
              const filled = i < filledBefore;
              const active = i >= filledBefore && i < filledBefore + activeNow;
              return (
                <View
                  key={i}
                  style={[
                    styles.animalDot,
                    filled && { backgroundColor: colors.cyan, opacity: 1 },
                    active && { backgroundColor: colors.cyan, opacity: 0.5 },
                    !filled && !active && { backgroundColor: colors.glassBorder, opacity: 1 },
                  ]}
                />
              );
            })}
          </View>
          <TouchableOpacity
            onPress={toggleGrid}
            hitSlop={8}
            activeOpacity={0.7}
            style={[styles.gridToggle, { borderColor: colors.glassBorder }]}
          >
            <Text style={[styles.gridToggleText, { color: colors.textSub }]}>
              {large ? '▦  smaller' : '▣  larger'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.animalGrid}>
        {visible.map((a) => {
          const selected = current.includes(a.name);
          const rank = current.indexOf(a.name) + 1;
          return (
            <TouchableOpacity
              key={a.name}
              style={[
                styles.animalCell,
                { width: cellSize, height: cellSize, borderColor: selected ? colors.cyanBorder : colors.glassBorder },
                selected && { backgroundColor: colors.cyanDim },
              ]}
              onPress={() => toggle(a.name)}
              activeOpacity={0.7}
            >
              {selected && need > 1 && (
                <View style={[styles.rankBadge, { backgroundColor: colors.cyan }]}>
                  <Text style={styles.rankText}>{rank}</Text>
                </View>
              )}
              {selected && need === 1 && (
                <View style={[styles.rankBadge, { backgroundColor: colors.cyan }]}>
                  <Text style={styles.rankText}>✓</Text>
                </View>
              )}
              <Text style={[styles.animalEmoji, large && styles.animalEmojiLarge]}>{a.emoji}</Text>
              <Text style={[styles.animalName, large && styles.animalNameLarge, { color: selected ? colors.text : colors.textSub }]}>
                {a.name.toLowerCase()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {need > 1 && (
        <Text style={[styles.animalCount, { color: current.length === need ? colors.cyan : colors.textDim }]}>
          {current.length} / {need}
        </Text>
      )}

      {stage === 2 && (
        <Text style={[styles.animalsNote, { color: colors.textDim }]}>
          you can reshape these anytime in Settings → Your Archetypes. Symponia keeps your animals in mind in every reflection.
        </Text>
      )}

      <TouchableOpacity
        style={[
          styles.primaryBtn,
          {
            backgroundColor: canAdvance ? colors.cyanDim : 'transparent',
            borderColor: canAdvance ? colors.cyanBorder : colors.glassBorder,
          },
        ]}
        onPress={advance}
        activeOpacity={canAdvance ? 0.75 : 1}
      >
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.primaryBtnText, { color: canAdvance ? colors.cyan : colors.textDim }]}>
          {config.btnLabel}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={goBack} activeOpacity={0.65} style={styles.animalBackBtn}>
        <Text style={[styles.animalBackText, { color: colors.textDim }]}>
          {stage > 0 ? '← back' : '← previous step'}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Step: Depth ───────────────────────────────────────────────────────────────

function DepthStep({ colors, depth, setDepth, onNext }: {
  colors: any; depth: Frequency; setDepth: (v: Frequency) => void; onNext: () => void;
}) {
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.stepWrap}>
      <View style={styles.stepHeader}>
        <Text style={[styles.stepLabel, { color: colors.textDim }]}>to begin</Text>
        <Text style={[styles.stepQuestion, { color: colors.text }]}>
          {'how shall I\nspeak to you?'}
        </Text>
        <Text style={[styles.stepHint, { color: colors.textDim }]}>
          you can change this anytime in your profile
        </Text>
      </View>
      <View style={styles.optionList}>
        {DEPTHS.map((d) => {
          const active = depth === d.id;
          return (
            <TouchableOpacity
              key={d.id}
              style={[
                styles.depthRow,
                { borderColor: active ? colors.cyanBorder : colors.glassBorder },
                active && { backgroundColor: colors.cyanDim },
              ]}
              onPress={() => { setDepth(d.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              activeOpacity={0.7}
            >
              <View style={styles.depthMeta}>
                <View style={[styles.radioOuter, { borderColor: active ? colors.cyan : colors.textDim }]}>
                  {active && <View style={[styles.radioInner, { backgroundColor: colors.cyan }]} />}
                </View>
                <Text style={[styles.depthLabel, { color: active ? colors.text : colors.textSub }]}>
                  {d.label}
                </Text>
              </View>
              <Text style={[styles.depthDesc, { color: colors.textDim }]}>{d.desc}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={[styles.animalsNote, { color: colors.textDim }]}>
        and in any language — write however feels natural, and Symponia answers in kind.
      </Text>
      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: colors.cyanDim, borderColor: colors.cyanBorder }]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onNext(); }}
        activeOpacity={0.75}
      >
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.primaryBtnText, { color: colors.cyan }]}>continue</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Password strength helper ──────────────────────────────────────────────────

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  if (pw.length === 0) return { score: 0, label: '', color: '' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const s = Math.min(score, 4);
  const labels = ['', 'weak', 'fair', 'good', 'strong'];
  const clrs = ['', '#e07070', '#e0a040', '#70b870', '#40c8a0'];
  return { score: s, label: labels[s], color: clrs[s] };
}

// ── Step: Legal ───────────────────────────────────────────────────────────────

function LegalStep({ colors, isDark, email, setEmail, password, setPassword, agreedTerms, setAgreedTerms, agreedMarketing, setAgreedMarketing, agreedMemory, setAgreedMemory, onComplete, onSocial, onSocialError, authError }: {
  colors: any; isDark: boolean;
  email: string; setEmail: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  agreedTerms: boolean; setAgreedTerms: (v: boolean) => void;
  agreedMarketing: boolean; setAgreedMarketing: (v: boolean) => void;
  agreedMemory: boolean; setAgreedMemory: (v: boolean) => void;
  onComplete: () => void;
  onSocial: (r: { isNewUser: boolean; fullName: string | null }) => void;
  onSocialError: (m: string) => void;
  authError: string;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');

  const strength = passwordStrength(password);
  const passwordsMatch = password === confirmPassword;
  const canContinue = agreedTerms && email.includes('@') && password.length >= 8 && passwordsMatch && confirmPassword.length > 0;

  const inputBg = isDark ? 'rgba(120,90,220,0.06)' : 'rgba(70,50,160,0.06)';

  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.stepWrap}>
      <View style={styles.stepHeader}>
        <Text style={[styles.stepLabel, { color: colors.textDim }]}>05 / 06</Text>
        <Text style={[styles.stepQuestion, { color: colors.text }]}>
          {'to stay\nin resonance'}
        </Text>
        <Text style={[styles.stepHint, { color: colors.textDim }]}>
          your email lets us reach you when something important stirs
        </Text>
      </View>

      {/* Email */}
      <TextInput
        style={[
          styles.emailInput,
          { color: colors.text, borderColor: colors.glassBorder, backgroundColor: inputBg },
        ]}
        value={email}
        onChangeText={setEmail}
        placeholder={t("your@email.com")}
        placeholderTextColor={colors.textDim}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
        textContentType="username"
        autoComplete="email"
      />

      {/* Password with show/hide */}
      <View style={[styles.pwRow, { borderColor: colors.glassBorder, backgroundColor: inputBg }]}>
        <TextInput
          style={[styles.pwInput, { color: colors.text }]}
          value={password}
          onChangeText={setPassword}
          placeholder={t("create a password (8+ chars)")}
          placeholderTextColor={colors.textDim}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          textContentType="newPassword"
          autoComplete="new-password"
          passwordRules="minlength: 8;"
        />
        <TouchableOpacity onPress={() => setShowPassword(v => !v)} hitSlop={8} activeOpacity={0.6} style={styles.eyeBtn}>
          <Text style={[styles.eyeText, { color: colors.textDim }]}>{showPassword ? 'hide' : 'show'}</Text>
        </TouchableOpacity>
      </View>

      {/* Strength bar */}
      {password.length > 0 && (
        <Animated.View entering={FadeIn.duration(200)} style={styles.strengthWrap}>
          <View style={[styles.strengthTrack, { backgroundColor: colors.glassBorder }]}>
            <Animated.View
              style={[
                styles.strengthFill,
                { width: `${(strength.score / 4) * 100}%`, backgroundColor: strength.color },
              ]}
            />
          </View>
          <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
        </Animated.View>
      )}

      {/* Confirm password */}
      <View style={[styles.pwRow, { borderColor: confirmPassword.length > 0 && !passwordsMatch ? '#e07070' : colors.glassBorder, backgroundColor: inputBg }]}>
        <TextInput
          style={[styles.pwInput, { color: colors.text }]}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder={t("confirm password")}
          placeholderTextColor={colors.textDim}
          secureTextEntry={!showConfirm}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
          textContentType="password"
          autoComplete="new-password"
        />
        <TouchableOpacity onPress={() => setShowConfirm(v => !v)} hitSlop={8} activeOpacity={0.6} style={styles.eyeBtn}>
          <Text style={[styles.eyeText, { color: colors.textDim }]}>{showConfirm ? 'hide' : 'show'}</Text>
        </TouchableOpacity>
      </View>
      {confirmPassword.length > 0 && !passwordsMatch && (
        <Text style={[styles.authError, { color: '#e07070' }]}>passwords don't match</Text>
      )}

      {authError ? (
        <Text style={[styles.authError, { color: '#e07070' }]}>{authError}</Text>
      ) : null}

      <Pressable
        style={styles.checkRow}
        onPress={() => { setAgreedTerms(!agreedTerms); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <View style={[styles.checkbox, { borderColor: agreedTerms ? colors.cyan : colors.glassBorder }, agreedTerms && { backgroundColor: colors.cyanDim }]}>
          {agreedTerms && <Text style={[styles.checkMark, { color: colors.cyan }]}>✓</Text>}
        </View>
        <Text style={[styles.checkText, { color: colors.textSub }]}>
          {t('I agree to the ')}
          <Text style={{ color: colors.cyan, textDecorationLine: 'underline' }} onPress={() => Linking.openURL('https://symponia.io/terms')}>
            Terms of Service
          </Text>
          {t(' and ')}
          <Text style={{ color: colors.cyan, textDecorationLine: 'underline' }} onPress={() => Linking.openURL('https://symponia.io/privacy')}>
            Privacy Policy
          </Text>
          {t(' (required)')}
        </Text>
      </Pressable>

      <Pressable
        style={styles.checkRow}
        onPress={() => { setAgreedMarketing(!agreedMarketing); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <View style={[styles.checkbox, { borderColor: agreedMarketing ? colors.cyan : colors.glassBorder }, agreedMarketing && { backgroundColor: colors.cyanDim }]}>
          {agreedMarketing && <Text style={[styles.checkMark, { color: colors.cyan }]}>✓</Text>}
        </View>
        <Text style={[styles.checkText, { color: colors.textSub }]}>
          Send me occasional updates and reflections from Symponia (optional)
        </Text>
      </Pressable>

      <Text style={[styles.gdprNote, { color: colors.textDim }]}>
        {"Your messages are processed by Anthropic's Claude under Zero\nData Retention. If memory is off, nothing is stored on our\nservers. We never sell your data. See Privacy Policy for details."}
      </Text>

      <TouchableOpacity
        style={[
          styles.primaryBtn,
          {
            backgroundColor: canContinue ? colors.cyanDim : 'transparent',
            borderColor: canContinue ? colors.cyanBorder : colors.glassBorder,
          },
        ]}
        onPress={() => {
          if (!canContinue) return;
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onComplete();
        }}
        activeOpacity={canContinue ? 0.75 : 1}
        disabled={!canContinue}
      >
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.primaryBtnText, { color: canContinue ? colors.cyan : colors.textDim }]}>
          enter symponia
        </Text>
      </TouchableOpacity>

      {/* Apple + Google. Terms must still be accepted — signing in with Apple is
          not agreement to our terms, and gating on `agreedTerms` keeps the two
          paths legally identical. */}
      {agreedTerms && (
        <SocialAuthButtons onSuccess={onSocial} onError={onSocialError} />
      )}
    </Animated.View>
  );
}

// ── Step: Attune (Jungian intake) ─────────────────────────────────────────────
// Ten short, multiple-choice questions in a reflective/archetypal voice. Answers
// are kept on-device only (no backend) and used to make onboarding feel personal.
// Grounded in shadow-work research: projection as the doorway, "heavier before
// lighter is normal", war → compassion. Deliberately NOT a clinical/crisis screen.

type AttuneQ = { q: string; options: string[] };

// Tone-adaptive intake. The question set is chosen by the voice the user picked in
// the first step, so a "direct & practical" person never meets philosophical framing.
// Every question is multi-select ("choose all that feel true").
const ATTUNE_SETS: Record<Frequency, AttuneQ[]> = {
  // deep & philosophical
  Intellectual: [
    { q: 'what brings you here, right now?', options: [
      "something's quietly off, and I want to understand it",
      "I'm curious about the parts of me I don't look at",
      'I keep circling the same feeling and want a way through',
      'I want a space that is mine to think',
    ] },
    { q: 'when a feeling rises that you can’t name, you tend to—', options: [
      'sit with it and turn inward',
      'reason through it until it settles',
      'stay busy and let it pass',
      'reach for someone to talk to',
    ] },
    { q: 'the trait that irritates you most in others is usually—', options: [
      'one I quietly carry too',
      "one I've worked hard to bury",
      'one I secretly wish I had',
      "one I've made peace with",
    ] },
    { q: 'when something painful surfaces, you—', options: [
      'pull inward and go quiet',
      'explain it away',
      'push through and stay busy',
      'let it move through me',
    ] },
    { q: "the parts of yourself you don't like, you tend to—", options: [
      'hide them, even from myself',
      'fight to fix or overcome them',
      'pretend they are not there',
      'let them sit with me',
    ] },
    { q: 'the version of you that you keep hidden is—', options: [
      'more vulnerable than I show',
      'more powerful than I admit',
      "more selfish than I'd like",
      'more free than I allow',
    ] },
    { q: 'what do you most want from a space like this?', options: [
      'to be understood without explaining',
      'honesty, even when it stings',
      'presence — something simply there',
      'to be seen as more than I feel right now',
    ] },
    { q: 'when you are alone for a long while, you—', options: [
      'feel most like yourself',
      'grow restless',
      'start to hear what you avoid',
      'feel the weight of it',
    ] },
    { q: 'change, for you, usually arrives—', options: [
      'slowly, then all at once',
      'only when something breaks',
      'when I finally stop resisting',
      'quietly, before I notice',
    ] },
  ],
  // warm & plain
  'Deeply Emotional': [
    { q: 'what made you open this today?', options: [
      "I've been feeling a bit off lately",
      "I want someone to talk to who won't judge",
      "something's on my mind I can't shake",
      'I just want a calm space for myself',
    ] },
    { q: 'how have you been feeling, mostly?', options: [
      'tired or worn down',
      'anxious or on edge',
      'low or a little sad',
      "okay, but something's missing",
    ] },
    { q: "when something's bothering you, what helps?", options: [
      'talking it out',
      'some quiet on my own',
      'being distracted for a while',
      'someone just being there',
    ] },
    { q: "when you're upset, you usually—", options: [
      'keep it to yourself',
      'want to talk right away',
      'need time before you can say anything',
      "aren't always sure what you feel",
    ] },
    { q: 'what do you wish people understood about you?', options: [
      'I care more than I show',
      "I'm doing my best",
      'I need more support than I ask for',
      "I'm stronger than I look",
    ] },
    { q: 'what is hardest to say out loud?', options: [
      "that I'm struggling",
      'that I need help',
      "that I'm hurt",
      "that I'm not okay",
    ] },
    { q: 'what would feel good to have here?', options: [
      'someone kind to talk to',
      'a place to sort out my thoughts',
      'gentle encouragement',
      'to feel less alone',
    ] },
    { q: 'what has been the hardest part of your days lately?', options: [
      'getting started in the morning',
      'being around people',
      'the quiet moments alone',
      'winding down at night',
    ] },
    { q: 'what would a good day feel like right now?', options: [
      'calm and unhurried',
      'connected to someone',
      'a little lighter',
      'proud of something small',
    ] },
  ],
  // direct & practical
  Quiet: [
    { q: 'why are you here today?', options: [
      'to understand myself better',
      'to work through something specific',
      'to build a habit of reflecting',
      'just looking around',
    ] },
    { q: "what's on your mind most right now?", options: [
      'work or money',
      'a relationship',
      'my mood or health',
      'the future',
    ] },
    { q: 'what do you want out of this?', options: [
      'clarity',
      'a plan',
      'to feel better',
      'honest feedback',
    ] },
    { q: 'how do you like answers?', options: [
      'short and clear',
      'straight to the point',
      'with one thing to try',
      'no sugar-coating',
    ] },
    { q: "when you're stuck, what helps?", options: [
      'a clear next step',
      'naming the real problem',
      'time to think',
      'talking to someone',
    ] },
    { q: 'what gets in your way most?', options: [
      'overthinking',
      'putting things off',
      'stress',
      'not enough time',
    ] },
    { q: 'what would progress look like?', options: [
      'a decision made',
      'a habit that sticks',
      'less stress',
      'understanding why',
    ] },
    { q: 'how often do you want to check in?', options: [
      'every day',
      'a few times a week',
      'now and then',
      'not sure yet',
    ] },
    { q: 'what should Symponia know about you?', options: [
      'I like things practical',
      "I don't have much time",
      'I want honesty',
      "I'm just getting started",
    ] },
  ],
};

function AttuneInterstitial({ colors, onContinue }: { colors: any; onContinue: () => void }) {
  return (
    <Animated.View entering={FadeIn.duration(450)} style={styles.stepWrap}>
      <View style={styles.welcomeCenter}>
        <Text style={[styles.glyph, { color: colors.violet }]}>❖</Text>
        <Text style={[styles.stepQuestion, { color: colors.text, textAlign: 'center' }]}>
          {'you are\nhalfway'}
        </Text>
        <Text style={[styles.welcomeBody, { color: colors.textDim, textAlign: 'center' }]}>
          {'most people find these questions stir up more\nthan they expected. that is the point. there are\nno wrong answers — only what is true for you.'}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: colors.cyanDim, borderColor: colors.cyanBorder }]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onContinue(); }}
        activeOpacity={0.75}
      >
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.primaryBtnText, { color: colors.cyan }]}>keep going</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function AttuneStep({ colors, tone, answers, setAnswers, onNext, onBack, onProgress }: {
  colors: any; tone: Frequency; answers: number[][]; setAnswers: (v: number[][]) => void;
  onNext: () => void; onBack: () => void; onProgress: (f: number) => void;
}) {
  const QUESTIONS = ATTUNE_SETS[tone] ?? ATTUNE_SETS.Intellectual;
  const [idx, setIdx] = React.useState(0);
  const [showInterstitial, setShowInterstitial] = React.useState(false);
  const [interstitialShown, setInterstitialShown] = React.useState(false);
  const total = QUESTIONS.length;
  const mid = Math.floor(total / 2);

  React.useEffect(() => {
    onProgress(total > 1 ? idx / (total - 1) : 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, total]);

  const q = QUESTIONS[idx];
  const selected = answers[idx] ?? [];
  const hasAny = selected.length > 0;

  const toggle = (i: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = answers.map((a) => (a ? a.slice() : []));
    while (next.length < total) next.push([]);
    const cur = next[idx];
    const at = cur.indexOf(i);
    if (at >= 0) cur.splice(at, 1); else cur.push(i);
    setAnswers(next);
  };

  const advance = () => {
    if (!hasAny) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (idx + 1 === mid && !interstitialShown) { setShowInterstitial(true); return; }
    if (idx < total - 1) setIdx(idx + 1);
    else onNext();
  };

  const back = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (idx > 0) setIdx(idx - 1);
    else onBack();
  };

  if (showInterstitial) {
    return (
      <AttuneInterstitial
        colors={colors}
        onContinue={() => { setShowInterstitial(false); setInterstitialShown(true); setIdx(mid); }}
      />
    );
  }

  return (
    <Animated.View key={idx} entering={FadeIn.duration(350)} style={styles.stepWrap}>
      <View style={styles.stepHeader}>
        <Text style={[styles.stepLabel, { color: colors.textDim }]}>
          {`attuning · ${String(idx + 1).padStart(2, '0')} / ${total}`}
        </Text>
        <Text style={[styles.stepQuestion, { color: colors.text }]}>{q.q}</Text>
        <Text style={[styles.stepHint, { color: colors.textDim }]}>
          choose all that feel true
        </Text>
      </View>

      <View style={styles.optionList}>
        {q.options.map((opt, i) => {
          const active = selected.includes(i);
          return (
            <TouchableOpacity
              key={i}
              style={[
                styles.optionRow,
                { borderColor: active ? colors.cyanBorder : colors.glassBorder },
                active && { backgroundColor: colors.cyanDim },
              ]}
              onPress={() => toggle(i)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, { borderColor: active ? colors.cyan : colors.textDim }, active && { backgroundColor: colors.cyanDim }]}>
                {active && <Text style={[styles.checkMark, { color: colors.cyan }]}>✓</Text>}
              </View>
              <Text style={[styles.optionLabel, { color: active ? colors.text : colors.textSub, flex: 1 }]}>
                {opt}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[
          styles.primaryBtn,
          {
            backgroundColor: hasAny ? colors.cyanDim : 'transparent',
            borderColor: hasAny ? colors.cyanBorder : colors.glassBorder,
          },
        ]}
        onPress={advance}
        activeOpacity={hasAny ? 0.75 : 1}
      >
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.primaryBtnText, { color: hasAny ? colors.cyan : colors.textDim }]}>
          {idx < total - 1 ? 'continue' : 'begin'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={back} activeOpacity={0.65} style={styles.animalBackBtn}>
        <Text style={[styles.animalBackText, { color: colors.textDim }]}>← back</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function MemoryStep({ colors, agreed, setAgreed, onNext }: {
  colors: any; agreed: boolean; setAgreed: (v: boolean) => void; onNext: () => void;
}) {
  const choose = (v: boolean) => {
    setAgreed(v);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onNext();
  };
  return (
    <Animated.View entering={FadeIn.duration(450)} style={styles.stepWrap}>
      <View style={styles.welcomeCenter}>
        <Text style={[styles.glyph, { color: colors.violet }]}>❖</Text>
        <Text style={[styles.stepQuestion, { color: colors.text, textAlign: 'center' }]}>
          {'should I\nremember you?'}
        </Text>
        <Text style={[styles.welcomeBody, { color: colors.textDim, textAlign: 'center' }]}>
          {'I can hold the thread of your reflections over time,\nso this space deepens as it comes to know you.'}
        </Text>
        <Text style={[styles.stepHint, { color: colors.textSub, textAlign: 'center', marginTop: 14, lineHeight: 20 }]}>
          {'only you can ever see them · private and encrypted\nnever sold, never used to train AI'}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: colors.cyanDim, borderColor: colors.cyanBorder }]}
        onPress={() => choose(true)}
        activeOpacity={0.75}
      >
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.primaryBtnText, { color: colors.cyan }]}>yes, remember me</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.secondaryBtn, { borderColor: colors.glassBorder }]} onPress={() => choose(false)} activeOpacity={0.7}>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.secondaryBtnText, { color: colors.textDim }]}>not now</Text>
      </TouchableOpacity>
      <Text style={[styles.stepHint, { color: colors.textDim, textAlign: 'center', marginTop: 10 }]}>
        you can change this anytime, and erase everything
      </Text>
    </Animated.View>
  );
}

function NotificationsStep({ colors, onEnable, onSkip }: {
  colors: any; onEnable: () => void; onSkip: () => void;
}) {
  return (
    <Animated.View entering={FadeIn.duration(450)} style={styles.stepWrap}>
      <View style={styles.welcomeCenter}>
        <Text style={[styles.glyph, { color: colors.violet }]}>❖</Text>
        <Text style={[styles.stepQuestion, { color: colors.text, textAlign: 'center' }]}>
          {'one quiet\nmoment a day'}
        </Text>
        <Text style={[styles.welcomeBody, { color: colors.textDim, textAlign: 'center' }]}>
          {'A short daily reflection can arrive on your lock screen —\na small, private prompt to pause and return to yourself.\nNo noise. Just one gentle nudge inward.'}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: colors.cyanDim, borderColor: colors.cyanBorder }]}
        onPress={onEnable}
        activeOpacity={0.75}
      >
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.primaryBtnText, { color: colors.cyan }]}>enable reminders</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.secondaryBtn, { borderColor: colors.glassBorder }]} onPress={onSkip} activeOpacity={0.7}>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.secondaryBtnText, { color: colors.textDim }]}>maybe later</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function TokensStep({ colors, onNext }: { colors: any; onNext: () => void }) {
  const pulse = useSharedValue(1);
  React.useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.07, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  return (
    <Animated.View entering={FadeIn.duration(450)} style={styles.stepWrap}>
      <View style={styles.welcomeCenter}>
        <Animated.View style={[styles.tokenOrb, { backgroundColor: colors.cyanDim, borderColor: colors.cyanBorder }, pulseStyle]}>
          <Text style={[styles.tokenNumber, { color: colors.cyan }]}>{TRIAL_TOKENS}</Text>
        </Animated.View>
        <Text style={[styles.stepQuestion, { color: colors.text, textAlign: 'center', marginTop: 26 }]}>
          {'reflections,\nto begin with'}
        </Text>
        <Text style={[styles.welcomeBody, { color: colors.textDim, textAlign: 'center' }]}>
          {t('you start with {n} free reflections. take your time with\nthem — nothing is charged now, and nothing renews on its own.', { n: TRIAL_TOKENS })}
        </Text>
        <Text style={[styles.stepHint, { color: colors.textSub, textAlign: 'center', marginTop: 14, lineHeight: 20 }]}>
          {'if they run out and you want to keep going,\nyou choose to add more — never automatically.'}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: colors.cyanDim, borderColor: colors.cyanBorder }]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onNext(); }}
        activeOpacity={0.75}
      >
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.primaryBtnText, { color: colors.cyan }]}>begin</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Weaving profile (perceived personalization) ───────────────────────────────
// A held, unhurried moment after consent. Purely cosmetic timing — it gives the
// felt sense that Symponia is shaping itself around the user before they enter.

function WeavingProfile({ colors, name, onDone }: { colors: any; name: string; onDone: () => void }) {
  const messages = [
    'gathering your reflections',
    'reading your archetypes',
    'attuning Symponia’s voice to you',
    'weaving your private profile',
    'almost ready',
  ];
  const [mi, setMi] = React.useState(0);

  useEffect(() => {
    const stepMs = 1100;
    const timers = messages.map((_, i) => setTimeout(() => setMi(i), i * stepMs));
    const done = setTimeout(onDone, messages.length * stepMs + 500);
    return () => { timers.forEach(clearTimeout); clearTimeout(done); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pct = ((mi + 1) / messages.length) * 100;
  // Built with t() + a placeholder so it can be translated; rendered `raw` so the
  // user's own name is never passed through the translator.
  const who = name?.trim()
    ? t('creating {name}’s space', { name: name.trim().toLowerCase() })
    : t('creating your private space');

  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.weaveWrap}>
      <Text style={[styles.glyph, { color: colors.violet }]}>◈</Text>
      <Text raw style={[styles.weaveTitle, { color: colors.cyan }]}>{who}</Text>
      <Text raw style={[styles.weaveMsg, { color: colors.textSub }]}>{`${t(messages[mi])}…`}</Text>
      <View style={[styles.weaveTrack, { backgroundColor: colors.glassBorder }]}>
        <View style={[styles.weaveFill, { backgroundColor: colors.cyan, width: `${pct}%` }]} />
      </View>
      <Text style={[styles.weaveFoot, { color: colors.textDim }]}>
        this stays yours — held in confidence, shaped only for you
      </Text>
    </Animated.View>
  );
}

// ── Step: Archetype info (after animals) ──────────────────────────────────────
// Explains what the chosen animals mean, that Symponia (the AI) learns from them
// plus the intake answers, where to find/change them, and a gentle update cadence.

function ArchetypeInfoStep({ colors, isDark, onNext, onBack }: {
  colors: any; isDark: boolean; onNext: () => void; onBack: () => void;
}) {
  const inputBg = isDark ? 'rgba(120,90,220,0.06)' : 'rgba(70,50,160,0.06)';
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.stepWrap}>
      <View style={styles.stepHeader}>
        <Text style={[styles.stepLabel, { color: colors.textDim }]}>your archetype</Text>
        <Text style={[styles.stepQuestion, { color: colors.text }]}>{'a living\narchetype'}</Text>
      </View>

      <View style={[styles.aiConsentCard, { borderColor: colors.glassBorder, backgroundColor: inputBg }]}>
        <Text style={[styles.aiConsentBody, { color: colors.textSub }]}>
          {"Your seven animals — your dominant, your five, and your shadow — together form your archetype. Symponia reads them, alongside how you answered just now, to learn your nature and shape how it reflects with you.\n\nYou can see what each animal carries — its gift, its shadow, its path — anytime in Settings → Your Archetypes, and reshape them there whenever you like.\n\nThey're meant to grow with you, not to be fixed. We suggest revisiting them about once a month — or whenever you feel something in you has shifted."}
        </Text>
      </View>

      <View style={[styles.archInfoRow, { borderColor: colors.glassBorder }]}>
        <Text style={[styles.archInfoLabel, { color: colors.textDim }]}>find them in</Text>
        <Text style={[styles.archInfoValue, { color: colors.cyan }]}>Settings › Your Archetypes</Text>
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: colors.cyanDim, borderColor: colors.cyanBorder }]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onNext(); }}
        activeOpacity={0.75}
      >
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.primaryBtnText, { color: colors.cyan }]}>continue</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onBack} activeOpacity={0.65} style={styles.animalBackBtn}>
        <Text style={[styles.animalBackText, { color: colors.textDim }]}>← back</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Onboarding ────────────────────────────────────────────────────────────────

const STEPS: Step[] = ['language', 'welcome', 'depth', 'attune', 'name', 'gender', 'animals', 'archetype', 'memory', 'notifications', 'tokens', 'legal'];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState('');
  const [gender, setGender] = useState('');
  const [animals, setAnimals] = useState<string[]>([]);
  const [animalCols, setAnimalCols] = useState(4);
  const [depth, setDepth] = useState<Frequency>('Intellectual');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedMarketing, setAgreedMarketing] = useState(false);
  const [lang, setLang] = useState<Lang>(getLanguage());
  const [agreedMemory, setAgreedMemory] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [showAIConsent, setShowAIConsent] = useState(false);
  const [showWeaving, setShowWeaving] = useState(false);
  const [attune, setAttune] = useState<number[][]>([]);
  const [attuneProgress, setAttuneProgress] = useState(0);
  const [authError, setAuthError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const goNext = () => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  };

  /**
   * Persist everything the intake gathered, then run the weaving animation.
   *
   * Shared by BOTH paths — email/password signup and Apple/Google — so the two
   * can never drift. A social user who skipped the email form still gets their
   * animals, voice, gender and language written exactly the same way; that bug
   * (social users arriving in the app with an empty profile) is the classic one
   * here, and it only exists when the two paths are written twice.
   */

  /**
   * Turn the intake into something the AI can actually use.
   *
   * `attune` holds ANSWER INDICES per question. Indices are meaningless to a
   * model, so resolve them here into the English source text of the question and
   * the option(s) chosen. English (not the translated string) because that is the
   * source of truth the system prompt is written in — and because the dictionaries
   * are keyed on it, so this survives the user switching language later.
   */
  const buildAttunePayload = () => {
    const set = ATTUNE_SETS[depth as Frequency] ?? [];
    return attune
      .map((picks, i) => {
        const q = set[i];
        if (!q || !picks || picks.length === 0) return null;
        return { q: q.q, a: picks.map((p) => q.options[p]).filter(Boolean) };
      })
      .filter(Boolean) as { q: string; a: string[] }[];
  };

  /** Everything the intake gathered, written on-device. Path-independent. */
  const persistLocal = async () => {
    await AsyncStorage.multiSet([
      ['symponia_onboarded', 'true'],
      ['symponia_name', name.trim()],
      ['symponia_gender', gender],
      ['symponia_animals', JSON.stringify(animals)],
      ['symponia_frequency', depth],
      ['symponia_marketing', String(agreedMarketing)],
      ['symponia_tokens', String(TRIAL_TOKENS)],
      ['symponia_attune', JSON.stringify(attune)],
      // THE NOTIFICATION ANSWER MUST BE PERSISTED HERE.
      //
      // Onboarding already asked, already requested iOS permission, and already
      // scheduled the daily reflection — but it never wrote this key. Settings
      // reads exactly this key, found nothing, and showed the toggle OFF. So the
      // user was being asked a second time for something already switched on, and
      // the switch they saw was lying about the real state.
      ['symponia_notif_daily', String(notifEnabled)],
    ]);
    // Memory choice locally (always) + mirrored to profiles.memory_enabled.
    // Default is off.
    await setMemoryEnabled(agreedMemory);
    try { await scheduleDaily(notifEnabled); } catch {}
  };

  const persistAndFinish = async (userId: string, userEmail: string) => {
    const { error: profileError } = await supabase.from('profiles').upsert({
      email: userEmail.toLowerCase(),
      user_id: userId,
      name: name.trim(),
      gender,
      animals: animals,
      frequency: depth,
      topup_tokens: TRIAL_TOKENS,
      language: lang,
      // The intake, finally going somewhere.
      attune: buildAttunePayload(),
    }, { onConflict: 'email' });
    if (profileError) {
      console.warn('[Onboarding] Profile upsert failed (trigger row exists):', profileError.message);
    }
    await persistLocal();
  };

  /** Apple / Google. The account already exists by the time this runs. */
  const completeWithSocial = async (r: { isNewUser: boolean; fullName: string | null }) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setAuthError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No session after social sign-in.');

      // A RETURNING user must not be dragged back through intake — they already
      // have a profile, animals, a voice. Straight into the app.
      if (!r.isNewUser) {
        await AsyncStorage.setItem('symponia_onboarded', 'true');
        router.replace('/(tabs)');
        return;
      }

      // Apple hands over the real name exactly once, on first authorisation.
      // If the user left the name step blank, take it — otherwise theirs wins.
      if (!name.trim() && r.fullName) setName(r.fullName.split(' ')[0]);

      await persistAndFinish(user.id, user.email ?? '');
      // Social users go through the SAME AI-consent gate. Skipping it because
      // they signed in with Apple would be a 5.1.2(i) violation — consent to
      // third-party AI processing is not implied by having an Apple ID.
      setShowAIConsent(true);
    } catch (e: any) {
      setAuthError(e?.message ?? 'Sign-in failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const complete = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setAuthError('');

    const { data: authData, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      setAuthError(error.message);
      setIsSubmitting(false);
      return;
    }

    if (authData.user) {
      await persistAndFinish(authData.user.id, email.trim());
    }

    setIsSubmitting(false);
    setShowAIConsent(true);
  };

  const finalizeOnboarding = async () => {
    await AsyncStorage.setItem('symponia_ai_consent', 'true');

    let consentWritten = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { error: consentErr } = await supabase
            .from('profiles')
            .update({ ai_consent: true })
            .eq('user_id', session.user.id);
          if (consentErr) {
            console.error(`[Onboarding] ai_consent update failed (attempt ${attempt}):`, consentErr.message);
          } else {
            consentWritten = true;
            break;
          }
        }
      } catch (e: unknown) {
        console.error(`[Onboarding] ai_consent update threw (attempt ${attempt}):`, e instanceof Error ? e.message : String(e));
      }
    }

    if (!consentWritten) {
      await AsyncStorage.removeItem('symponia_ai_consent');
      setShowWeaving(false);
      Alert.alert(
        t('Setup incomplete'),
        t('We could not record your consent on our servers. Please check your connection and try again.'),
        [{ text: t('OK') }],
      );
      return;
    }

    // The account exists, consent is recorded — now offer the trial, before they
    // reach the app. This is the only moment they will ever be this warm: they
    // have just spent five minutes telling us who they are, and the profile has
    // just been woven for them. Asking later, after they've hit a wall
    // mid-conversation, converts far worse and feels like a bait.
    //
    // It is NOT a hard wall. The paywall can be dismissed, and they fall through
    // to the free reflections. Locking someone out of a reflective companion
    // seconds after they finished an intimate intake would be ugly.
    router.replace('/paywall?intro=1');
  };

  const stepIndex = STEPS.indexOf(step);
  const showBack = stepIndex > 0;

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {stepIndex > 0 && (
        <View style={[styles.progressTrack, { backgroundColor: colors.glassBorder }]}>
          <Animated.View
            style={[
              styles.progressFill,
              { backgroundColor: colors.cyan, width: `${Math.min(1, (stepIndex + (step === 'attune' ? attuneProgress : 0)) / (STEPS.length - 1)) * 100}%` },
            ]}
          />
        </View>
      )}

      {showBack && (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.navRow}>
          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setStep(STEPS[stepIndex - 1]); }}
            activeOpacity={0.65}
          >
            <Text style={[styles.backText, { color: colors.textDim }]}>← back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.replace('/signin'); }}
            activeOpacity={0.65}
          >
            <Text style={[styles.backText, { color: colors.cyan }]}>sign in instead</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {showWeaving ? (
        <WeavingProfile colors={colors} name={name} onDone={finalizeOnboarding} />
      ) : showAIConsent ? (
        <AIConsentStep colors={colors} isDark={isDark} onComplete={() => setShowWeaving(true)} />
      ) : (
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step === 'language' && <LanguageStep key="language" colors={colors} selected={lang} onSelect={(l) => { setLang(l); saveLanguage(l); goNext(); }} />}
        {step === 'welcome' && <WelcomeStep key="welcome" colors={colors} onNext={goNext} />}
        {step === 'attune'  && <AttuneStep key="attune" colors={colors} tone={depth} answers={attune} setAnswers={setAttune} onNext={goNext} onBack={() => setStep('depth')} onProgress={setAttuneProgress} />}
        {step === 'name'    && <NameStep key="name" colors={colors} name={name} setName={setName} onNext={goNext} />}
        {step === 'gender'  && <GenderStep key="gender" colors={colors} gender={gender} setGender={setGender} onNext={goNext} />}
        {step === 'animals' && <AnimalsStep key="animals" colors={colors} animals={animals} setAnimals={setAnimals} cols={animalCols} setCols={setAnimalCols} onNext={goNext} onBack={() => setStep('gender')} />}
        {step === 'archetype' && <ArchetypeInfoStep key="archetype" colors={colors} isDark={isDark} onNext={goNext} onBack={() => setStep('animals')} />}
        {step === 'memory' && <MemoryStep key="memory" colors={colors} agreed={agreedMemory} setAgreed={setAgreedMemory} onNext={goNext} />}
        {step === 'notifications' && <NotificationsStep key="notifications" colors={colors} onEnable={async () => { const g = await requestNotificationPermission(); setNotifEnabled(g); goNext(); }} onSkip={() => { setNotifEnabled(false); goNext(); }} />}
        {step === 'tokens' && <TokensStep key="tokens" colors={colors} onNext={goNext} />}
        {step === 'depth'   && <DepthStep key="depth" colors={colors} depth={depth} setDepth={setDepth} onNext={goNext} />}
        {step === 'legal'   && (
          <LegalStep
            key="legal"
            colors={colors}
            isDark={isDark}
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
            agreedTerms={agreedTerms}
            setAgreedTerms={setAgreedTerms}
            agreedMarketing={agreedMarketing}
            setAgreedMarketing={setAgreedMarketing}
            agreedMemory={agreedMemory}
            setAgreedMemory={setAgreedMemory}
            onComplete={complete}
            onSocial={completeWithSocial}
            onSocialError={setAuthError}
            authError={authError}
          />
        )}
      </ScrollView>
      )}
    </View>
  );
}

// ── AI Consent Step (06 / 06) — shown after account creation ──────────────────

function AIConsentStep({ colors, isDark, onComplete }: { colors: any; isDark: boolean; onComplete: () => void }) {
  const [agreed, setAgreed] = useState(false);
  const inputBg = isDark ? 'rgba(120,90,220,0.06)' : 'rgba(70,50,160,0.06)';

  const handleDecline = () => {
    Alert.alert(
      t('AI processing required'),
      t("Symponia requires AI processing to function. Without consent to send messages to Anthropic, the app's reflection features cannot be used. You can revisit the consent screen, or close Symponia from your home screen at any time."),
      [{ text: t('Return to consent'), style: 'cancel' }],
    );
  };

  return (
    <ScrollView
      contentContainerStyle={styles.aiConsentWrap}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Animated.View entering={FadeIn.duration(500)} style={{ gap: 24 }}>
        <View style={styles.stepHeader}>
          <Text style={[styles.stepLabel, { color: colors.textDim }]}>06 / 06</Text>
          <Text style={[styles.stepQuestion, { color: colors.text }]}>
            {'a moment of\ntransparency'}
          </Text>
        </View>

        <View style={[styles.aiConsentCard, { borderColor: colors.glassBorder, backgroundColor: inputBg }]}>
          <Text style={[styles.aiConsentBody, { color: colors.textSub }]}>
            {"Symponia thinks with you using Anthropic's Claude, a third-party AI service.\n\nWhen you write to Symponia, the following data is sent to Anthropic so a reflection can come back to you:\n\n· Your messages\n· Your first name (as provided during onboarding)\n· Your gender (if provided)\n· Your seven animal archetypes\n· Your resonance frequency preference\n\nNothing else is shared. Your email, password, and payment details never leave our systems. We do not sell your data. Anthropic processes your messages to generate responses and does not use them to train their models.\n\nBy tapping 'I understand', you grant Symponia permission to send the data listed above to Anthropic to generate your reflections. Anthropic operates under Zero Data Retention terms with Symponia, meaning Anthropic does not store your messages after responses are generated."}
          </Text>
        </View>

        <Text style={[styles.aiConsentLinks, { color: colors.textDim }]}>
          {t('Read our ')}
          <Text style={{ color: colors.cyan, textDecorationLine: 'underline' }} onPress={() => Linking.openURL('https://symponia.io/privacy')}>
            Privacy Policy
          </Text>
          {t(' and ')}
          <Text style={{ color: colors.cyan, textDecorationLine: 'underline' }} onPress={() => Linking.openURL('https://www.symponia.io/terms')}>
            Terms of Service
          </Text>
          {t(' before continuing.')}
        </Text>

        <Pressable
          style={styles.checkRow}
          onPress={() => { setAgreed(!agreed); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <View style={[styles.checkbox, { borderColor: agreed ? colors.cyan : colors.glassBorder }, agreed && { backgroundColor: colors.cyanDim }]}>
            {agreed && <Text style={[styles.checkMark, { color: colors.cyan }]}>✓</Text>}
          </View>
          <Text style={[styles.checkText, { color: colors.textSub }]}>
            I have read the above and grant permission for my data to be processed by Anthropic.
          </Text>
        </Pressable>

        <TouchableOpacity
          style={[
            styles.primaryBtn,
            {
              backgroundColor: agreed ? colors.cyanDim : 'transparent',
              borderColor: agreed ? colors.cyanBorder : colors.glassBorder,
            },
          ]}
          onPress={() => {
            if (!agreed) return;
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onComplete();
          }}
          activeOpacity={agreed ? 0.75 : 1}
          disabled={!agreed}
        >
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.primaryBtnText, { color: agreed ? colors.cyan : colors.textDim }]}>
            I understand — enter Symponia
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryBtn, { borderColor: colors.glassBorder }]}
          onPress={handleDecline}
          activeOpacity={0.7}
        >
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.secondaryBtnText, { color: colors.textDim }]}>
            I do not consent
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const FONT = Platform.select({ ios: 'Helvetica Neue', android: 'Roboto', default: 'System' });

const styles = StyleSheet.create({
  screen: { flex: 1 },

  progressTrack: { height: 3 },
  progressFill:  { height: 3 },

  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 4,
  },

  backBtn: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 4,
  },
  backText: {
    fontFamily: FONT,
    fontSize: 12,
    letterSpacing: 0.3,
  },

  scroll: {
    flexGrow: 1,
    paddingHorizontal: H_PAD,
    paddingTop: 48,
    paddingBottom: 40,
  },

  stepWrap: {
    flex: 1,
    gap: 28,
  },

  // Welcome
  welcomeCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingTop: 60,
    paddingBottom: 40,
  },
  langGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    rowGap: 22,
    columnGap: 14,
    marginTop: 26,
  },
  langItem: {
    width: 100,
    alignItems: 'center',
  },
  langCircle: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langFlag: {
    fontSize: 34,
    lineHeight: 42,
  },
  langLabel: {
    marginTop: 8,
    fontSize: 12.5,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  tokenOrb: {
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenNumber: {
    fontSize: 58,
    fontWeight: '300',
    letterSpacing: -1,
  },
  glyph: {
    fontSize: 44,
    lineHeight: 52,
    marginBottom: 8,
  },
  appName: {
    fontSize: 13,
    letterSpacing: 8,
    fontFamily: FONT,
    fontWeight: '400',
  },
  tagline: {
    fontSize: 15,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.3,
  },
  taglineSub: {
    fontSize: 12,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.5,
    marginBottom: 4,
    opacity: 0.7,
  },
  welcomeBody: {
    fontSize: 14,
    fontFamily: FONT,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 8,
  },
  signInLink: {
    alignItems: 'center',
    marginTop: -8,
  },
  signInLinkText: {
    fontSize: 13,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.2,
  },

  // Step header
  stepHeader: { gap: 8 },
  stepLabel: {
    fontFamily: FONT,
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '400',
  },
  stepQuestion: {
    fontSize: 28,
    fontFamily: FONT,
    fontWeight: '400',
    lineHeight: 36,
    letterSpacing: -0.3,
  },
  stepHint: {
    fontSize: 12,
    fontFamily: FONT,
    fontWeight: '400',
    lineHeight: 18,
  },

  // Name input
  nameInput: {
    fontSize: 22,
    fontFamily: FONT,
    fontWeight: '400',
    borderBottomWidth: 0.5,
    paddingVertical: 8,
    paddingHorizontal: 2,
  },

  // Options
  optionList: { gap: 10 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 16,
    borderWidth: 0.5,
    paddingVertical: 14,
    paddingHorizontal: 18,
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
  optionLabel: {
    fontSize: 14,
    fontFamily: FONT,
    fontWeight: '400',
  },

  // Depth
  depthRow: {
    borderRadius: 16,
    borderWidth: 0.5,
    paddingVertical: 14,
    paddingHorizontal: 18,
    gap: 6,
  },
  depthMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  depthLabel: {
    fontSize: 15,
    fontFamily: FONT,
    fontWeight: '400',
  },
  depthDesc: {
    fontSize: 11,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.3,
    paddingLeft: 32,
  },

  // Animals grid
  animalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CELL_GAP,
  },
  animalCell: {
    borderRadius: 14,
    borderWidth: 0.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    position: 'relative',
  },
  animalEmoji: {
    fontSize: 28,
    lineHeight: 34,
  },
  animalEmojiLarge: {
    fontSize: 56,
    lineHeight: 66,
  },
  animalName: {
    fontSize: 9,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.2,
  },
  animalNameLarge: {
    fontSize: 14,
    letterSpacing: 0.4,
  },
  rankBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 9,
    fontFamily: FONT,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 11,
  },
  animalCount: {
    fontFamily: FONT,
    fontSize: 11,
    letterSpacing: 1,
    textAlign: 'center',
    fontWeight: '400',
  },
  animalDots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  animalDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  animalTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  gridToggle: {
    borderWidth: 0.5,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  gridToggleText: {
    fontSize: 11,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.4,
  },
  animalBackBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: -2,
  },
  animalBackText: {
    fontSize: 12,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.3,
  },
  animalsNote: {
    fontSize: 11,
    fontFamily: FONT,
    fontWeight: '400',
    lineHeight: 16,
    letterSpacing: 0.2,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  archInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 0.5,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  archInfoLabel: {
    fontSize: 11,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.5,
  },
  archInfoValue: {
    fontSize: 13,
    fontFamily: FONT,
    fontWeight: '500',
    letterSpacing: 0.2,
  },

  // Weaving / private-profile moment
  weaveWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: H_PAD,
    gap: 18,
  },
  weaveTitle: {
    fontSize: 13,
    fontFamily: FONT,
    fontWeight: '500',
    letterSpacing: 3,
    textTransform: 'lowercase',
    textAlign: 'center',
  },
  weaveMsg: {
    fontSize: 15,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  weaveTrack: {
    width: '70%',
    height: 2,
    borderRadius: 1,
    overflow: 'hidden',
    marginTop: 4,
  },
  weaveFill: {
    height: '100%',
    borderRadius: 1,
  },
  weaveFoot: {
    fontSize: 11,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.3,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
    lineHeight: 16,
  },

  authError: {
    fontSize: 12,
    fontFamily: FONT,
    fontWeight: '400',
    lineHeight: 18,
    textAlign: 'center',
    marginTop: -8,
  },

  // Email
  emailInput: {
    fontSize: 15,
    fontFamily: FONT,
    fontWeight: '400',
    borderWidth: 0.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  // Password row with show/hide
  pwRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 0.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  pwInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: FONT,
    fontWeight: '400',
    paddingVertical: 9,
  },
  eyeBtn: {
    paddingLeft: 10,
    paddingVertical: 6,
  },
  eyeText: {
    fontSize: 11,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.5,
  },

  // Password strength bar
  strengthWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: -4,
  },
  strengthTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  strengthFill: {
    height: '100%',
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: 10,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.8,
    width: 40,
  },

  // Checkboxes
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkMark: {
    fontSize: 13,
    lineHeight: 16,
  },
  checkText: {
    flex: 1,
    fontSize: 13,
    fontFamily: FONT,
    fontWeight: '400',
    lineHeight: 20,
  },

  gdprNote: {
    fontSize: 10,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.3,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: -8,
  },

  // Button
  primaryBtn: {
    borderRadius: 18,
    borderWidth: 0.5,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: {
    fontSize: 11,
    letterSpacing: 1.6,
    fontFamily: FONT,
    fontWeight: '500',
  },

  // AI Consent step
  aiConsentWrap: {
    flexGrow: 1,
    paddingHorizontal: H_PAD,
    paddingTop: 48,
    paddingBottom: 40,
  },
  aiConsentCard: {
    borderRadius: 18,
    borderWidth: 0.5,
    padding: 20,
  },
  aiConsentBody: {
    fontSize: 14,
    fontFamily: FONT,
    fontWeight: '400',
    lineHeight: 22,
    letterSpacing: 0.1,
  },
  aiConsentLinks: {
    fontSize: 12,
    fontFamily: FONT,
    fontWeight: '400',
    lineHeight: 18,
    letterSpacing: 0.2,
  },
  secondaryBtn: {
    borderRadius: 18,
    borderWidth: 0.5,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: -8,
  },
  secondaryBtnText: {
    fontSize: 11,
    letterSpacing: 1.6,
    fontFamily: FONT,
    fontWeight: '400',
  },
});
