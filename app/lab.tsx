import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { CloudState } from '@/components/revamp/Cloud';
import { DraggableCloud } from '@/components/revamp/DraggableCloud';
import { Glass } from '@/components/revamp/Glass';
import { Paper, PAPER } from '@/components/revamp/Paper';

// The revamp home screen ("home screen B"), as a standalone preview.
//
// Reachable at /lab in the browser preview and in development only (see the
// gate in app/_layout.tsx). It uses no account and no network, so the look and
// the motion can be judged on their own. The row of words at the top switches
// the cloud between its four states; it is a preview control, not part of the
// design.

const STATES: CloudState[] = ['idle', 'listening', 'thinking', 'speaking'];
const FONT = Platform.select({ ios: 'Helvetica Neue', android: 'Roboto', default: 'System' });

export default function Lab() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // Small phones (iPhone SE) get a smaller cloud so the card never crowds it.
  const small = height < 700;
  const [state, setState] = useState<CloudState>('idle');

  // One layout for every iPhone: the cloud scales with the screen but is capped,
  // and the card is pinned above the tab bar, so nothing depends on a fixed
  // screen height.
  const cloudW = Math.min(width * (small ? 0.5 : 0.62), 270);

  return (
    <Paper>
      <View style={[styles.switcher, { top: insets.top + 8 }]}>
        {STATES.map((s) => (
          <Pressable key={s} onPress={() => setState(s)} hitSlop={8}>
            <Text style={[styles.switchText, s === state && styles.switchOn]}>{s}</Text>
          </Pressable>
        ))}
      </View>

      {/* The cloud takes whatever height the card leaves and sits a little
          above the middle of it, so the layout holds on every iPhone. */}
      <View style={[styles.cloudWrap, { paddingTop: insets.top + 36 }]}>
        <DraggableCloud state={state} width={cloudW} />
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 14 }]}>
        <Glass frosted style={styles.card}>
          <Text style={styles.label}>TUESDAY · THE FOX SPEAKS</Text>
          <Text style={styles.heading}>You went quiet yesterday.</Text>
          <Text style={styles.sub}>Shall we pick it up?</Text>
          <View style={styles.actions}>
            <Pressable style={styles.action} onPress={() => setState('listening')} accessibilityRole="button" accessibilityLabel="Talk">
              <Glass tint={PAPER.indigo} interactive style={styles.button}>
                <MicIcon color="#fff" />
                <Text style={[styles.buttonText, { color: '#fff' }]}>Talk</Text>
              </Glass>
            </Pressable>
            <Pressable style={styles.action} onPress={() => setState('thinking')} accessibilityRole="button" accessibilityLabel="Write">
              <Glass interactive style={styles.button}>
                <PencilIcon color={PAPER.ink} />
                <Text style={[styles.buttonText, { color: PAPER.ink }]}>Write</Text>
              </Glass>
            </Pressable>
          </View>
        </Glass>

        <Glass frosted style={styles.tabs}>
          <View style={styles.tabOn}>
            <HomeIcon color={PAPER.ink} />
          </View>
          <View style={styles.tab}>
            <BookIcon color={PAPER.inkSoft} />
          </View>
          <View style={styles.tab}>
            <PersonIcon color={PAPER.inkSoft} />
          </View>
        </Glass>
      </View>
    </Paper>
  );
}

const icon = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none' as const };
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
function HomeIcon({ color }: { color: string }) {
  return (
    <Svg {...icon}>
      <Path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1v-8z" {...stroke(color)} />
    </Svg>
  );
}
function BookIcon({ color }: { color: string }) {
  return (
    <Svg {...icon}>
      <Path d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5zM12 6.5v13" {...stroke(color)} />
    </Svg>
  );
}
function PersonIcon({ color }: { color: string }) {
  return (
    <Svg {...icon}>
      <Circle cx={12} cy={8} r={3.6} {...stroke(color)} />
      <Path d="M5 20c.6-3.6 3.4-5.5 7-5.5s6.4 1.9 7 5.5" {...stroke(color)} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  switcher: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 14, zIndex: 5 },
  switchText: { fontFamily: FONT, fontSize: 12, color: PAPER.inkSoft, opacity: 0.6 },
  switchOn: { opacity: 1, color: PAPER.teal, fontWeight: '700' },

  cloudWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 28, zIndex: 2 },

  bottom: { paddingHorizontal: 18, alignItems: 'center', gap: 14 },
  card: { alignSelf: 'stretch', borderRadius: 30, paddingHorizontal: 22, paddingTop: 20, paddingBottom: 18 },
  label: { fontFamily: FONT, fontSize: 12, fontWeight: '700', letterSpacing: 1.3, color: PAPER.teal },
  heading: { fontFamily: FONT, fontSize: 25, lineHeight: 31, fontWeight: '700', letterSpacing: -0.3, color: PAPER.ink, marginTop: 8 },
  sub: { fontFamily: FONT, fontSize: 16, lineHeight: 23, color: PAPER.inkSoft, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  action: { flex: 1 },
  // 52 pt tall: comfortably above Apple's 44 pt minimum touch target.
  button: { height: 52, borderRadius: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonText: { fontFamily: FONT, fontSize: 17, fontWeight: '600' },

  tabs: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 56, paddingHorizontal: 8, borderRadius: 28 },
  tab: { width: 56, height: 44, alignItems: 'center', justifyContent: 'center' },
  tabOn: { width: 56, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.7)' },
});
