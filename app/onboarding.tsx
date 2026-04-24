import { useTheme } from '@/constants/ThemeContext';
import { TRIAL_TOKENS } from '@/constants/config';
import { supabase } from '@/services/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  BackHandler,
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
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_W } = Dimensions.get('window');
const COLS = 4;
const CELL_GAP = 8;
const H_PAD = 28;
const CELL_SIZE = (SCREEN_W - H_PAD * 2 - CELL_GAP * (COLS - 1)) / COLS;

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 'welcome' | 'name' | 'gender' | 'animals' | 'depth' | 'legal';
type Frequency = 'Quiet' | 'Intellectual' | 'Deeply Emotional';

// ── Data ──────────────────────────────────────────────────────────────────────

const GENDERS = [
  { id: 'he/him',            label: 'he / him' },
  { id: 'she/her',           label: 'she / her' },
  { id: 'they/them',         label: 'they / them' },
  { id: 'prefer not to say', label: 'prefer not to say' },
] as const;

const DEPTHS: { id: Frequency; label: string; desc: string }[] = [
  { id: 'Deeply Emotional', label: 'felt',    desc: 'presence · imagery · the snake sheds its skin' },
  { id: 'Intellectual',     label: 'precise', desc: 'structure · depth · the eagle holds the long view' },
  { id: 'Quiet',            label: 'still',   desc: 'silence · few words · the heron simply waits' },
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
        <Text style={[styles.primaryBtnText, { color: colors.cyan }]}>begin</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.replace('/signin'); }}
        activeOpacity={0.65}
        style={styles.signInLink}
      >
        <Text style={[styles.signInLinkText, { color: colors.textDim }]}>
          {'already have an account?  '}
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
        placeholder="your name..."
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
        <Text style={[styles.primaryBtnText, { color: colors.cyan }]}>continue</Text>
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
        <Text style={[styles.primaryBtnText, { color: colors.cyan }]}>continue</Text>
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

function AnimalsStep({ colors, animals, setAnimals, onNext }: {
  colors: any; animals: string[]; setAnimals: (v: string[]) => void; onNext: () => void;
}) {
  // stage 0 = dominant, stage 1 = middle 5, stage 2 = shadow
  const [stage, setStage] = React.useState(0);
  const [stagePicked, setStagePicked] = React.useState<string[]>([]);

  const config = ANIMAL_STAGES[stage];

  // Animals already committed in previous stages — hide them from the grid
  const committed = animals; // parent array grows as stages complete
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

  const advance = () => {
    if (!canAdvance) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = [...animals, ...stagePicked];
    setAnimals(next);
    setStagePicked([]);
    if (stage < 2) {
      setStage(stage + 1);
    } else {
      onNext();
    }
  };

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
        {/* 7 dots showing total progress across all stages */}
        <View style={styles.animalDots}>
          {Array.from({ length: 7 }).map((_, i) => {
            const committed = animals.length;
            const inProgress = committed + stagePicked.length;
            const filled = i < committed;
            const active = i >= committed && i < inProgress;
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
      </View>

      <View style={styles.animalGrid}>
        {visible.map((a) => {
          const selected = stagePicked.includes(a.name);
          const rank = stagePicked.indexOf(a.name) + 1;
          return (
            <TouchableOpacity
              key={a.name}
              style={[
                styles.animalCell,
                { borderColor: selected ? colors.cyanBorder : colors.glassBorder },
                selected && { backgroundColor: colors.cyanDim },
              ]}
              onPress={() => toggle(a.name)}
              activeOpacity={0.7}
            >
              {selected && config.need > 1 && (
                <View style={[styles.rankBadge, { backgroundColor: colors.cyan }]}>
                  <Text style={styles.rankText}>{rank}</Text>
                </View>
              )}
              {selected && config.need === 1 && (
                <View style={[styles.rankBadge, { backgroundColor: colors.cyan }]}>
                  <Text style={styles.rankText}>✓</Text>
                </View>
              )}
              <Text style={styles.animalEmoji}>{a.emoji}</Text>
              <Text style={[styles.animalName, { color: selected ? colors.text : colors.textDim }]}>
                {a.name.toLowerCase()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {config.need > 1 && (
        <Text style={[styles.animalCount, { color: stagePicked.length === config.need ? colors.cyan : colors.textDim }]}>
          {stagePicked.length} / {config.need}
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
        <Text style={[styles.primaryBtnText, { color: canAdvance ? colors.cyan : colors.textDim }]}>
          {config.btnLabel}
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
        <Text style={[styles.stepLabel, { color: colors.textDim }]}>04 / 06</Text>
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
      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: colors.cyanDim, borderColor: colors.cyanBorder }]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onNext(); }}
        activeOpacity={0.75}
      >
        <Text style={[styles.primaryBtnText, { color: colors.cyan }]}>continue</Text>
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

function LegalStep({ colors, isDark, email, setEmail, password, setPassword, agreedTerms, setAgreedTerms, agreedMarketing, setAgreedMarketing, onComplete, authError }: {
  colors: any; isDark: boolean;
  email: string; setEmail: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  agreedTerms: boolean; setAgreedTerms: (v: boolean) => void;
  agreedMarketing: boolean; setAgreedMarketing: (v: boolean) => void;
  onComplete: () => void;
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
        placeholder="your@email.com"
        placeholderTextColor={colors.textDim}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
      />

      {/* Password with show/hide */}
      <View style={[styles.pwRow, { borderColor: colors.glassBorder, backgroundColor: inputBg }]}>
        <TextInput
          style={[styles.pwInput, { color: colors.text }]}
          value={password}
          onChangeText={setPassword}
          placeholder="create a password (8+ chars)"
          placeholderTextColor={colors.textDim}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
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
          placeholder="confirm password"
          placeholderTextColor={colors.textDim}
          secureTextEntry={!showConfirm}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
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
          {'I agree to the '}
          <Text style={{ color: colors.cyan, textDecorationLine: 'underline' }} onPress={() => Linking.openURL('https://symponia.io/terms')}>
            Terms of Service
          </Text>
          {' and '}
          <Text style={{ color: colors.cyan, textDecorationLine: 'underline' }} onPress={() => Linking.openURL('https://symponia.io/privacy')}>
            Privacy Policy
          </Text>
          {' (required)'}
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
        {"Your messages are processed by Anthropic's Claude to\ngenerate responses. We never sell your data.\nSee Privacy Policy for full details."}
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
        <Text style={[styles.primaryBtnText, { color: canContinue ? colors.cyan : colors.textDim }]}>
          enter symponia
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Onboarding ────────────────────────────────────────────────────────────────

const STEPS: Step[] = ['welcome', 'name', 'gender', 'animals', 'depth', 'legal'];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState('');
  const [gender, setGender] = useState('');
  const [animals, setAnimals] = useState<string[]>([]);
  const [depth, setDepth] = useState<Frequency>('Intellectual');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedMarketing, setAgreedMarketing] = useState(false);
  const [showAIConsent, setShowAIConsent] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const goNext = () => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
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
      await supabase.from('profiles').upsert({
        user_id: authData.user.id,
        name: name.trim(),
        gender,
        animals: animals,
        frequency: depth,
        tokens: TRIAL_TOKENS,
      }, { onConflict: 'user_id' });
    }

    await AsyncStorage.multiSet([
      ['symponia_onboarded', 'true'],
      ['symponia_name', name.trim()],
      ['symponia_gender', gender],
      ['symponia_animals', JSON.stringify(animals)],
      ['symponia_frequency', depth],
      ['symponia_marketing', String(agreedMarketing)],
      ['symponia_tokens', String(TRIAL_TOKENS)],
    ]);

    setIsSubmitting(false);
    setShowAIConsent(true);
  };

  const finalizeOnboarding = async () => {
    await AsyncStorage.setItem('symponia_ai_consent', 'true');
    // Best-effort server-side consent flag — ignored if column doesn't exist yet
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await supabase.from('profiles').update({ ai_consent: true }).eq('user_id', session.user.id);
      }
    } catch {}
    router.replace('/(tabs)');
  };

  const stepIndex = STEPS.indexOf(step);
  const showBack = stepIndex > 0;

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={[styles.progressTrack, { backgroundColor: colors.glassBorder }]}>
        <Animated.View
          style={[
            styles.progressFill,
            { backgroundColor: colors.cyan, width: `${(stepIndex / (STEPS.length - 1)) * 100}%` },
          ]}
        />
      </View>

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

      {showAIConsent ? (
        <AIConsentStep colors={colors} isDark={isDark} onComplete={finalizeOnboarding} />
      ) : (
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step === 'welcome' && <WelcomeStep key="welcome" colors={colors} onNext={goNext} />}
        {step === 'name'    && <NameStep key="name" colors={colors} name={name} setName={setName} onNext={goNext} />}
        {step === 'gender'  && <GenderStep key="gender" colors={colors} gender={gender} setGender={setGender} onNext={goNext} />}
        {step === 'animals' && <AnimalsStep key="animals" colors={colors} animals={animals} setAnimals={setAnimals} onNext={goNext} />}
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
            onComplete={complete}
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
      'Symponia needs AI processing to work',
      "Every conversation in Symponia is generated by Anthropic's Claude AI. Without your consent to process messages through Anthropic, Symponia cannot function. You can close the app now, or return to the consent screen and reconsider.",
      [
        { text: 'Return to consent', style: 'cancel' },
        {
          text: 'Close app',
          style: 'destructive',
          onPress: () => {
            // Android only — Apple does not permit programmatic app exit on iOS.
            // On iOS the alert dismisses and the user remains on this screen.
            if (Platform.OS === 'android') BackHandler.exitApp();
          },
        },
      ],
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
            {"Symponia thinks with you using Anthropic's Claude, a third-party AI service.\n\nWhen you write to Symponia, your messages, your chosen name, and your archetype are sent to Anthropic so a reflection can come back to you.\n\nNothing else is shared. Your email, password, and payment details never leave our systems. We do not sell your data. Anthropic processes your messages to generate responses and does not use them to train their models."}
          </Text>
        </View>

        <Text style={[styles.aiConsentLinks, { color: colors.textDim }]}>
          {'Read our '}
          <Text style={{ color: colors.cyan, textDecorationLine: 'underline' }} onPress={() => Linking.openURL('https://www.symponia.io/privacy')}>
            Privacy Policy
          </Text>
          {' and '}
          <Text style={{ color: colors.cyan, textDecorationLine: 'underline' }} onPress={() => Linking.openURL('https://www.symponia.io/terms')}>
            Terms of Service
          </Text>
          {' before continuing.'}
        </Text>

        <Pressable
          style={styles.checkRow}
          onPress={() => { setAgreed(!agreed); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <View style={[styles.checkbox, { borderColor: agreed ? colors.cyan : colors.glassBorder }, agreed && { backgroundColor: colors.cyanDim }]}>
            {agreed && <Text style={[styles.checkMark, { color: colors.cyan }]}>✓</Text>}
          </View>
          <Text style={[styles.checkText, { color: colors.textSub }]}>
            I understand and agree to this processing.
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
          <Text style={[styles.primaryBtnText, { color: agreed ? colors.cyan : colors.textDim }]}>
            I understand — enter Symponia
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryBtn, { borderColor: colors.glassBorder }]}
          onPress={handleDecline}
          activeOpacity={0.7}
        >
          <Text style={[styles.secondaryBtnText, { color: colors.textDim }]}>
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

  progressTrack: { height: 1 },
  progressFill:  { height: 1 },

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
  glyph: {
    fontSize: 44,
    lineHeight: 52,
    marginBottom: 8,
  },
  appName: {
    fontSize: 13,
    letterSpacing: 8,
    fontFamily: FONT,
    fontWeight: '300',
  },
  tagline: {
    fontSize: 15,
    fontFamily: FONT,
    fontWeight: '300',
    letterSpacing: 0.3,
  },
  taglineSub: {
    fontSize: 12,
    fontFamily: FONT,
    fontWeight: '300',
    letterSpacing: 0.5,
    marginBottom: 4,
    opacity: 0.7,
  },
  welcomeBody: {
    fontSize: 14,
    fontFamily: FONT,
    fontWeight: '300',
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
    fontWeight: '300',
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
    fontWeight: '300',
    lineHeight: 36,
    letterSpacing: -0.3,
  },
  stepHint: {
    fontSize: 12,
    fontFamily: FONT,
    fontWeight: '300',
    lineHeight: 18,
  },

  // Name input
  nameInput: {
    fontSize: 22,
    fontFamily: FONT,
    fontWeight: '300',
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
    fontWeight: '300',
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
    width: CELL_SIZE,
    height: CELL_SIZE,
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
  animalName: {
    fontSize: 9,
    fontFamily: FONT,
    fontWeight: '400',
    letterSpacing: 0.2,
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
    fontWeight: '300',
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
    fontWeight: '300',
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
    letterSpacing: 3,
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
    fontWeight: '300',
    lineHeight: 22,
    letterSpacing: 0.1,
  },
  aiConsentLinks: {
    fontSize: 12,
    fontFamily: FONT,
    fontWeight: '300',
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
    letterSpacing: 3,
    fontFamily: FONT,
    fontWeight: '300',
  },
});
