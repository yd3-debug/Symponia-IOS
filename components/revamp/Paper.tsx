import React, { useEffect } from 'react';
import { Image as RNImage, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

// The sketchbook page every revamp screen sits on.
//
// Built from parts instead of one full-screen picture, so it fits every iPhone
// without stretching and stays small: a flat cream colour, a 96 px grain tile
// (8 KB) repeated for the paper tooth, and the pencil hills (120 KB) pinned to
// the bottom edge and scaled by width.

export const PAPER = {
  bg: '#F5EFE0',
  ink: '#26244A',
  inkSoft: '#5F5B78',
  teal: '#157F88',
  indigo: 'rgba(52, 48, 122, 0.9)',
  /** The colour at the very bottom of the hills drawing, used to extend it. */
  hillFoot: '#8FC6B8',
};

const HILLS_ASPECT = 496 / 1290;

export function Paper({ children, hills = true, sky = true }: { children?: React.ReactNode; hills?: boolean; sky?: boolean }) {
  const { width, height } = useWindowDimensions();
  // Drawn nearly twice as wide as the screen so the hills have real height on a
  // phone and their horizon rises behind the card; the overflow is clipped.
  const hillsW = width * 1.9;
  const hillsH = hillsW * HILLS_ASPECT;

  return (
    <View style={styles.root}>
      {/* Explicit size: without it the image takes the tile's own 96 px and
          never repeats. */}
      <RNImage
        source={require('@/Assets/revamp/paper_grain.png')}
        resizeMode="repeat"
        style={{ position: 'absolute', left: 0, top: 0, width, height }}
      />
      {sky && (
        <>
          <Doodle source={require('@/Assets/revamp/sun.webp')} size={width * 0.2} left={width * 0.74} top={height * 0.075} period={5200} />
          <Doodle source={require('@/Assets/revamp/star_lavender.webp')} size={width * 0.058} left={width * 0.1} top={height * 0.11} period={2600} delay={300} />
          <Doodle source={require('@/Assets/revamp/star_peach.webp')} size={width * 0.046} left={width * 0.06} top={height * 0.3} period={3100} delay={900} />
          <Doodle source={require('@/Assets/revamp/star_teal.webp')} size={width * 0.05} left={width * 0.86} top={height * 0.36} period={2900} delay={1500} />
        </>
      )}
      {hills && (
        <View pointerEvents="none" style={[styles.hills, { height: hillsH }]}>
          <Image
            source={require('@/Assets/revamp/hills.webp')}
            style={{ width: hillsW, height: hillsH, marginLeft: -(hillsW - width) / 2 }}
            contentFit="fill"
          />
        </View>
      )}
      {children}
    </View>
  );
}

/** A sky doodle that twinkles: a slow, small change in size and opacity. */
function Doodle({ source, size, left, top, period, delay = 0 }: { source: number; size: number; left: number; top: number; period: number; delay?: number }) {
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    const ease = Easing.inOut(Easing.sin);
    const id = setTimeout(() => {
      // `reverse` makes this a true back-and-forth, with no restart to jump at.
      t.value = withRepeat(withTiming(1, { duration: period, easing: ease }), -1, true);
    }, delay);
    return () => {
      clearTimeout(id);
      cancelAnimation(t);
    };
  }, [reduceMotion, period, delay, t]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.72 + t.value * 0.28,
    transform: [{ scale: 0.94 + t.value * 0.08 }, { rotate: `${(t.value - 0.5) * 6}deg` }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left, top, width: size, height: size }, style]}>
      <Image source={source} style={StyleSheet.absoluteFill} contentFit="contain" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAPER.bg, overflow: 'hidden' },
  hills: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden' },
});
