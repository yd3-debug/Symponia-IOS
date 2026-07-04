import { useTheme } from '@/constants/ThemeContext';
import { ANIMAL_ARCHETYPES, emojiForAnimal } from '@/constants/systemPrompt';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const FONT = Platform.select({ ios: 'Helvetica Neue', android: 'Roboto', default: 'System' });

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '');

// Your archetype overview — understand it here (gift/shadow/path + constellation),
// then act: work with your shadow / go deeper (open chat), or edit in Settings.
export default function ArchetypeScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [animals, setAnimals] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem('symponia_animals').then((raw) => {
      if (raw) {
        try { setAnimals(JSON.parse(raw)); } catch {}
      }
    });
  }, []);

  const dominant = animals[0];
  const shadow = animals[6];
  const arc = dominant ? ANIMAL_ARCHETYPES[dominant.toLowerCase().trim()] : undefined;

  const openChat = (mode: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    AsyncStorage.setItem('symponia_pending_mode', mode).then(() => router.navigate('/(tabs)/echo'));
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg, paddingTop: insets.top + 8 }]}>
      <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
        <Text style={[styles.back, { color: colors.textDim }]}>‹ back</Text>
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(300)}>
          <Text style={[styles.label, { color: colors.textDim }]}>YOUR ARCHETYPE</Text>

          {!dominant ? (
            <Text style={[styles.empty, { color: colors.textDim }]}>
              You haven&apos;t chosen your animals yet. You can set them in Settings.
            </Text>
          ) : (
            <>
              <View style={styles.domWrap}>
                <Text style={styles.domEmoji}>{emojiForAnimal(dominant)}</Text>
                <Text style={[styles.domName, { color: colors.cyan }]}>{dominant.toUpperCase()}</Text>
                <Text style={[styles.domSub, { color: colors.textDim }]}>your dominant archetype</Text>
              </View>

              {arc && (
                <Animated.View entering={FadeInDown.duration(300).delay(80)} style={styles.layers}>
                  <View style={[styles.layer, { borderLeftColor: colors.cyan }]}>
                    <Text style={[styles.ll, { color: colors.textDim }]}>GIFT</Text>
                    <Text style={[styles.lt, { color: colors.text }]}>{arc.gift}</Text>
                  </View>
                  <View style={[styles.layer, { borderLeftColor: colors.red }]}>
                    <Text style={[styles.ll, { color: colors.textDim }]}>SHADOW</Text>
                    <Text style={[styles.lt, { color: colors.text }]}>{arc.shadow}</Text>
                  </View>
                  <View style={[styles.layer, { borderLeftColor: colors.green }]}>
                    <Text style={[styles.ll, { color: colors.textDim }]}>PATH</Text>
                    <Text style={[styles.lt, { color: colors.text }]}>{arc.path}</Text>
                  </View>
                </Animated.View>
              )}

              <Text style={[styles.constL, { color: colors.textDim }]}>YOUR CONSTELLATION</Text>
              <View style={styles.constRow}>
                {animals.map((a, i) => {
                  const isDom = i === 0;
                  const isSha = i === 6;
                  return (
                    <View
                      key={i}
                      style={[
                        styles.an,
                        {
                          borderColor: isDom ? colors.cyan : isSha ? colors.violet : colors.glassBorder,
                          backgroundColor: isDom ? colors.cyanDim : isSha ? colors.violetDim : 'transparent',
                        },
                      ]}
                    >
                      <Text style={styles.anEmoji}>{emojiForAnimal(a)}</Text>
                    </View>
                  );
                })}
              </View>

              <View style={styles.actions}>
                <TouchableOpacity
                  onPress={() => openChat('shadow')}
                  activeOpacity={0.78}
                  style={[styles.cta, { borderColor: colors.violet + '66', backgroundColor: colors.violetDim }]}
                >
                  <Text style={[styles.ctaText, { color: colors.violet }]}>
                    {`work with your shadow${shadow ? ` · ${cap(shadow)}` : ''}  →`}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => openChat('animal')}
                  activeOpacity={0.78}
                  style={[styles.cta, { borderColor: colors.cyanBorder, backgroundColor: colors.cyanDim }]}
                >
                  <Text style={[styles.ctaText, { color: colors.cyan }]}>go deeper with Symponia  →</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.navigate('/update-animals'); }}
                  activeOpacity={0.7}
                  style={[styles.cta, { borderColor: colors.glassBorder }]}
                >
                  <Text style={[styles.ctaText, { color: colors.textSub }]}>edit in Settings  →</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  backBtn: { paddingHorizontal: 20, paddingVertical: 8 },
  back: { fontSize: 14, fontFamily: FONT, fontWeight: '400', letterSpacing: 0.3 },
  content: { paddingHorizontal: 24, paddingTop: 8 },
  label: { fontSize: 10, letterSpacing: 3, fontFamily: FONT, fontWeight: '500', marginBottom: 18 },
  empty: { fontSize: 14, fontFamily: FONT, fontWeight: '400', lineHeight: 22 },

  domWrap: { alignItems: 'center', gap: 5, marginBottom: 22 },
  domEmoji: { fontSize: 56, lineHeight: 64 },
  domName: { fontSize: 14, letterSpacing: 4, fontFamily: FONT, fontWeight: '500' },
  domSub: { fontSize: 12, fontFamily: FONT, fontWeight: '400' },

  layers: { gap: 12, marginBottom: 24 },
  layer: { borderLeftWidth: 2, paddingLeft: 14, paddingVertical: 2 },
  ll: { fontSize: 10, letterSpacing: 1.5, fontFamily: FONT, fontWeight: '500' },
  lt: { fontSize: 13.5, fontFamily: FONT, fontWeight: '400', lineHeight: 20, marginTop: 3 },

  constL: { fontSize: 10, letterSpacing: 1.5, fontFamily: FONT, fontWeight: '500', marginBottom: 10 },
  constRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 28 },
  an: { width: 42, height: 42, borderRadius: 11, borderWidth: 0.5, alignItems: 'center', justifyContent: 'center' },
  anEmoji: { fontSize: 20, lineHeight: 26 },

  actions: { gap: 10 },
  cta: { borderRadius: 16, borderWidth: 0.5, paddingVertical: 15, paddingHorizontal: 18 },
  ctaText: { fontSize: 13, fontFamily: FONT, fontWeight: '500', letterSpacing: 0.3 },
});
