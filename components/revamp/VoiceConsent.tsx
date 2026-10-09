import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { useT } from '@/constants/i18n';
import type { VoiceKind } from '@/services/voice';
import { Cloud } from './Cloud';
import { Glass } from './Glass';
import { Paper, PAPER } from './Paper';

// The voice consent screen.
//
// Shown once, the first time someone is about to speak with the cloud, and
// again from Settings. It says, in the cloud's own first person, exactly what
// voice involves: when the microphone is on, who turns speech into text, who
// reads the replies aloud and what is sent to them. Both answers are the same
// size: declining voice must be as easy as accepting it, and typing always
// works.
//
// If the wording here changes, the privacy policy and the App Store privacy
// answers must change with it (see REVAMP_PLAN.md, security checklist).

const FONT = Platform.select({ ios: 'Helvetica Neue', android: 'Roboto', default: 'System' });

const POINTS = [
  'Your microphone is on only while you are speaking to me.',
  'Apple turns your speech into text. Symponia never keeps the recording.',
  'My replies are read aloud by a voice from ElevenLabs. The text of each reply is sent to them for that.',
  'You can type instead at any moment, and turn voice off in Settings.',
];

export function VoiceConsent({
  initialKind = 'woman',
  onChoose,
}: {
  initialKind?: VoiceKind;
  /** `enabled: false` means they chose to type. */
  onChoose: (choice: { enabled: boolean; kind: VoiceKind }) => void;
}) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [kind, setKind] = useState<VoiceKind>(initialKind);
  const small = height < 700;

  return (
    <Paper hills={false} sky={false}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (small ? 12 : 28), paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.cloud}>
          <Cloud state="speaking" width={Math.min(width * (small ? 0.34 : 0.42), 190)} />
        </View>

        <Text style={styles.heading} accessibilityRole="header">{t('Shall we talk out loud?')}</Text>
        <Text style={styles.lead}>{t('You speak, and I answer in a voice. Here is what that involves.')}</Text>

        <Glass frosted style={styles.card}>
          {POINTS.map((point) => (
            <View key={point} style={styles.point}>
              <View style={styles.dot} />
              <Text style={styles.pointText}>{t(point)}</Text>
            </View>
          ))}
        </Glass>

        <Text style={styles.label}>{t('My voice').toUpperCase()}</Text>
        <View style={styles.row} accessibilityRole="radiogroup">
          {(['woman', 'man'] as VoiceKind[]).map((k) => {
            const on = k === kind;
            return (
              <Pressable
                key={k}
                style={[styles.choice, on && styles.choiceOn]}
                onPress={() => setKind(k)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, checked: on }}
                aria-checked={on}
              >
                <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioDot} />}</View>
                <Text style={[styles.choiceText, on && { color: PAPER.ink, fontWeight: '600' }]}>
                  {t(k === 'woman' ? 'A woman’s voice' : 'A man’s voice')}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.row, { marginTop: 22 }]}>
          <Pressable style={styles.action} onPress={() => onChoose({ enabled: false, kind })} accessibilityRole="button">
            <Glass interactive style={styles.button}>
              <PencilIcon color={PAPER.ink} />
              <Text style={[styles.buttonText, { color: PAPER.ink }]}>{t('Type instead')}</Text>
            </Glass>
          </Pressable>
          <Pressable style={styles.action} onPress={() => onChoose({ enabled: true, kind })} accessibilityRole="button">
            <Glass tint={PAPER.indigo} interactive style={styles.button}>
              <MicIcon color="#fff" />
              <Text style={[styles.buttonText, { color: '#fff' }]}>{t('Use voice')}</Text>
            </Glass>
          </Pressable>
        </View>
      </ScrollView>
    </Paper>
  );
}

const icon = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none' as const };
const stroke = (color: string) => ({ stroke: color, strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });
function MicIcon({ color }: { color: string }) {
  return (
    <Svg {...icon}>
      <Rect x={9} y={3} width={6} height={11} rx={3} {...stroke(color)} />
      <Path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" {...stroke(color)} />
    </Svg>
  );
}
function PencilIcon({ color }: { color: string }) {
  return (
    <Svg {...icon}>
      <Path d="M4 20l1-4.5L16.5 4a2 2 0 0 1 2.8 0l.7.7a2 2 0 0 1 0 2.8L8.5 19 4 20zM14.5 6l3.5 3.5" {...stroke(color)} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  // Capped and centred so the text stays a readable width on a wide screen.
  scroll: { paddingHorizontal: 22, width: '100%', maxWidth: 520, alignSelf: 'center' },
  cloud: { alignItems: 'center', marginBottom: 2 },
  heading: { fontFamily: FONT, fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.3, color: PAPER.ink, textAlign: 'center' },
  lead: { fontFamily: FONT, fontSize: 16, lineHeight: 23, color: PAPER.inkSoft, textAlign: 'center', marginTop: 6, marginBottom: 18 },
  card: { borderRadius: 24, paddingHorizontal: 18, paddingVertical: 16, gap: 12 },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: PAPER.teal, marginTop: 8 },
  pointText: { flex: 1, fontFamily: FONT, fontSize: 15.5, lineHeight: 22, color: PAPER.ink },
  label: { fontFamily: FONT, fontSize: 12, fontWeight: '700', letterSpacing: 1.3, color: PAPER.teal, marginTop: 22, marginBottom: 10 },
  row: { flexDirection: 'row', gap: 10 },
  choice: {
    flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: 18,
    borderWidth: 1.5, borderColor: 'rgba(38,36,74,0.16)', backgroundColor: 'rgba(255,252,244,0.5)',
  },
  choiceOn: { borderColor: PAPER.teal, backgroundColor: 'rgba(255,252,244,0.9)' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(38,36,74,0.35)', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: PAPER.teal },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: PAPER.teal },
  choiceText: { flex: 1, fontFamily: FONT, fontSize: 15, lineHeight: 20, color: PAPER.inkSoft },
  action: { flex: 1 },
  button: { height: 52, borderRadius: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonText: { fontFamily: FONT, fontSize: 16.5, fontWeight: '600' },
});
