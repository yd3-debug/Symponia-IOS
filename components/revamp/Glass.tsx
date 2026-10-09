import React from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

// One glass surface, two ways to draw it.
//
// iOS 26 and later: Apple's real Liquid Glass (expo-glass-effect), which bends
// and brightens whatever sits behind it.
// Older iPhones, and the browser preview: a frosted panel (expo-blur) with a
// light rim, so the layout and the legibility are the same everywhere.
//
// Liquid Glass is one of the more expensive things a phone draws. Keep the
// number of these on a screen small; see REVAMP_PLAN.md.

const REAL_GLASS = Platform.OS === 'ios' && isLiquidGlassAvailable();

export function Glass({
  children,
  style,
  tint,
  interactive = false,
  frosted = false,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** A colour to tint the glass with, e.g. the indigo of the Talk button. */
  tint?: string;
  /** Lets real glass react to touch. Use on buttons only. */
  interactive?: boolean;
  /**
   * Fallback only: blur what is behind this surface. Use on large panels, not
   * on buttons. A blur per button costs the phone more than it gives the eye.
   */
  frosted?: boolean;
}) {
  if (REAL_GLASS) {
    return (
      <GlassView glassEffectStyle="regular" tintColor={tint} isInteractive={interactive} style={style}>
        {children}
      </GlassView>
    );
  }
  const radius = StyleSheet.flatten(style)?.borderRadius;
  return (
    <View style={[styles.fallback, tint ? { backgroundColor: tint, borderColor: 'rgba(255,255,255,0.35)' } : null, style]}>
      {frosted && !tint && (
        <BlurView intensity={22} tint="light" style={[StyleSheet.absoluteFill, { borderRadius: radius as number | undefined }]} />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 252, 244, 0.66)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
});
