import React, { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useT } from '@/constants/i18n';
import { Cloud } from './Cloud';
import { Glass } from './Glass';
import { Paper, PAPER } from './Paper';

// "Before we begin": what Symponia is and is not, agreed to before it does
// anything for anyone.
//
// THE WORDING IS LOAD-BEARING. It mirrors section 5 of the published Terms
// ("not a medical, therapeutic, psychiatric, psychological, or counselling
// service ... not a substitute for professional care"), the AI disclosure that
// New York's companion law asks for ("a computer program and not a human
// being ... unable to feel human emotion"), and Apple's requirement to name
// the third-party AI provider before any data is sent to it. Do not soften,
// shorten or "improve" these strings without updating the Terms, the Privacy
// Policy and CONSENT_VERSION in services/consent.ts together, and without the
// change being read by a lawyer. This file has not been reviewed by one yet.
//
// THE BOXES. Three, separate, never pre-ticked, each a real statement in the
// first person. Begin stays disabled until all three are ticked. Agreement to
// the Terms is one box and consent to AI processing is another, because a
// consent that is bundled into the terms is not a specific consent.
//
// The whole text is visible without tapping anything: nothing important is
// behind a "learn more".

const FONT = Platform.select({ ios: 'Helvetica Neue', android: 'Roboto', default: 'System' });

const TERMS_URL = 'https://symponia.io/terms';
const PRIVACY_URL = 'https://symponia.io/privacy';
const HELPLINE_URL = 'https://findahelpline.com';

const FACTS: { title: string; body: string; link?: { label: string; url: string } }[] = [
  {
    title: 'I am an AI.',
    body: 'I am a computer program, not a human being. I cannot feel human emotion, however I sound.',
  },
  {
    title: 'This is not therapy or medical care.',
    body: 'Symponia is not a medical, therapeutic, psychiatric, psychological or counselling service. It does not diagnose or treat anything, and it is not a substitute for professional care.',
  },
  {
    title: 'I cannot help in an emergency.',
    body: 'If you are in crisis, or think you may harm yourself or someone else, contact your local emergency services or a crisis line now.',
    link: { label: 'Find a helpline near you', url: HELPLINE_URL },
  },
  {
    title: 'Your words are processed by AI.',
    body: 'What you write is sent to Anthropic, the company that makes the Claude AI model, to write my replies. That includes anything personal or sensitive you choose to share.',
  },
  {
    title: 'For adults.',
    body: 'Symponia is for people aged 18 and over.',
  },
];

type Key = 'terms_age' | 'not_medical' | 'ai_processing';

export function BeforeWeBegin({ onBegin }: { onBegin: () => void }) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [ticked, setTicked] = useState<Record<Key, boolean>>({ terms_age: false, not_medical: false, ai_processing: false });
  const ready = ticked.terms_age && ticked.not_medical && ticked.ai_processing;
  const toggle = (k: Key) => setTicked((v) => ({ ...v, [k]: !v[k] }));
  const small = height < 700;

  return (
    <Paper hills={false} sky={false}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (small ? 8 : 20), paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.cloud}>
          <Cloud state="idle" width={Math.min(width * 0.3, 130)} />
        </View>

        <Text style={styles.heading} accessibilityRole="header">{t('Before we begin')}</Text>
        <Text style={styles.lead}>{t('Please read these. They matter.')}</Text>

        <Glass frosted style={styles.card}>
          {FACTS.map((f, i) => (
            <View key={f.title} style={[styles.fact, i > 0 && styles.factDivider]}>
              <Text style={styles.factTitle}>{t(f.title)}</Text>
              <Text style={styles.factBody}>{t(f.body)}</Text>
              {f.link && (
                <Text style={styles.link} accessibilityRole="link" onPress={() => Linking.openURL(f.link!.url)}>
                  {t(f.link.label)}
                </Text>
              )}
            </View>
          ))}
        </Glass>

        <View style={styles.boxes}>
          <Tick on={ticked.terms_age} onPress={() => toggle('terms_age')}>
            <Text style={styles.tickText}>
              {/* One sentence with two placeholders, so each language can put the
                  links where its grammar wants them. */}
              {t('I am 18 or older, and I agree to the {terms} and the {privacy}.')
                .split(/(\{terms\}|\{privacy\})/)
                .map((part, i) =>
                  part === '{terms}' ? (
                    <Text key={i} style={styles.inlineLink} accessibilityRole="link" onPress={() => Linking.openURL(TERMS_URL)}>{t('Terms')}</Text>
                  ) : part === '{privacy}' ? (
                    <Text key={i} style={styles.inlineLink} accessibilityRole="link" onPress={() => Linking.openURL(PRIVACY_URL)}>{t('Privacy Policy')}</Text>
                  ) : (
                    part
                  ),
                )}
            </Text>
          </Tick>
          <Tick on={ticked.not_medical} onPress={() => toggle('not_medical')}>
            <Text style={styles.tickText}>
              {t('I understand that Symponia is an AI, not a person, not therapy and not medical care, and that it cannot help in an emergency.')}
            </Text>
          </Tick>
          <Tick on={ticked.ai_processing} onPress={() => toggle('ai_processing')}>
            <Text style={styles.tickText}>
              {t('I agree to what I write being sent to Anthropic to produce replies, including personal or sensitive things I choose to share.')}
            </Text>
          </Tick>
        </View>

        <Pressable
          onPress={ready ? onBegin : undefined}
          disabled={!ready}
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready }}
          style={{ opacity: ready ? 1 : 0.45, marginTop: 20 }}
        >
          <Glass tint={PAPER.indigo} interactive={ready} style={styles.button}>
            <Text style={styles.buttonText}>{t('Begin')}</Text>
          </Glass>
        </Pressable>

        <Text style={styles.foot}>{t('You can change your mind at any time in Settings.')}</Text>
      </ScrollView>
    </Paper>
  );
}

function Tick({ on, onPress, children }: { on: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable style={styles.tick} onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} aria-checked={on} hitSlop={4}>
      <View style={[styles.box, on && styles.boxOn]}>
        {on && (
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        )}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Capped and centred so lines stay a readable length on a wide screen.
  scroll: { paddingHorizontal: 22, width: '100%', maxWidth: 520, alignSelf: 'center' },
  cloud: { alignItems: 'center' },
  heading: { fontFamily: FONT, fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.3, color: PAPER.ink, textAlign: 'center' },
  lead: { fontFamily: FONT, fontSize: 16, lineHeight: 23, color: PAPER.inkSoft, textAlign: 'center', marginTop: 4, marginBottom: 16 },
  card: { borderRadius: 24, paddingHorizontal: 18, paddingVertical: 6 },
  fact: { paddingVertical: 13 },
  factDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(38,36,74,0.18)' },
  factTitle: { fontFamily: FONT, fontSize: 16, lineHeight: 22, fontWeight: '700', color: PAPER.ink },
  factBody: { fontFamily: FONT, fontSize: 15, lineHeight: 22, color: PAPER.ink, marginTop: 3 },
  link: { fontFamily: FONT, fontSize: 15, lineHeight: 22, fontWeight: '600', color: PAPER.teal, textDecorationLine: 'underline', marginTop: 6 },
  boxes: { marginTop: 18, gap: 4 },
  // 44 pt minimum touch height, the whole row is the target.
  tick: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 9, minHeight: 44 },
  box: {
    width: 26, height: 26, borderRadius: 8, borderWidth: 1.8, borderColor: 'rgba(38,36,74,0.5)',
    backgroundColor: 'rgba(255,252,244,0.8)', alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  boxOn: { backgroundColor: PAPER.teal, borderColor: PAPER.teal },
  tickText: { fontFamily: FONT, fontSize: 15, lineHeight: 22, color: PAPER.ink },
  inlineLink: { color: PAPER.teal, fontWeight: '600', textDecorationLine: 'underline' },
  button: { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: FONT, fontSize: 17, fontWeight: '600', color: '#fff' },
  foot: { fontFamily: FONT, fontSize: 13, lineHeight: 19, color: PAPER.inkSoft, textAlign: 'center', marginTop: 12 },
});
