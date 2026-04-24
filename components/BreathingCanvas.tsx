import React, { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

// Dark: indigo night — deep violet, cobalt, purple
const DARK_BLOBS = [
  { color: '#3D1E8A', x: 0.20, y: 0.25, rx: 240, ry: 200, duration: 9000, driftX: 0.06, driftY: 0.04 },
  { color: '#1A2A7A', x: 0.80, y: 0.20, rx: 210, ry: 175, duration: 12000, driftX: -0.05, driftY: 0.05 },
  { color: '#5A1E8A', x: 0.50, y: 0.65, rx: 260, ry: 210, duration: 10500, driftX: 0.04, driftY: -0.04 },
] as const;

// Light: lavender day — soft violet, periwinkle, lilac
const LIGHT_BLOBS = [
  { color: '#9080D8', x: 0.20, y: 0.25, rx: 240, ry: 200, duration: 9000, driftX: 0.06, driftY: 0.04 },
  { color: '#7080C8', x: 0.80, y: 0.20, rx: 210, ry: 175, duration: 12000, driftX: -0.05, driftY: 0.05 },
  { color: '#B090E0', x: 0.50, y: 0.65, rx: 260, ry: 210, duration: 10500, driftX: 0.04, driftY: -0.04 },
] as const;

type BlobDef = { color: string; x: number; y: number; rx: number; ry: number; duration: number; driftX: number; driftY: number };

function BlobShape({
  index,
  blob,
  isDark,
  width,
  height,
}: {
  index: number;
  blob: BlobDef;
  isDark: boolean;
  width: number;
  height: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: blob.duration, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const baseCx = blob.x * width;
  const baseCy = blob.y * height;
  const dx = blob.driftX * width;
  const dy = blob.driftY * height;

  const animatedProps = useAnimatedProps(() => ({
    cx: baseCx + progress.value * dx,
    cy: baseCy + progress.value * dy,
  }));

  const t = isDark ? 'd' : 'l';

  return (
    <AnimatedEllipse
      animatedProps={animatedProps}
      rx={blob.rx}
      ry={blob.ry}
      fill={`url(#bg${t}${index})`}
      opacity={0.75}
    />
  );
}

export function BreathingCanvas({ isDark = true }: { isDark?: boolean }) {
  const { width, height } = useWindowDimensions();
  const blobs: BlobDef[] = isDark ? [...DARK_BLOBS] : [...LIGHT_BLOBS];
  const bgColor = isDark ? '#0E0B1A' : '#F0EEF9';
  // Theme prefix in gradient IDs forces SVG to re-resolve colors on theme change
  const t = isDark ? 'd' : 'l';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: bgColor }]} />
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          {blobs.map((blob, i) => (
            <RadialGradient key={`${t}${i}`} id={`bg${t}${i}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={blob.color} stopOpacity="0.65" />
              <Stop offset="70%" stopColor={blob.color} stopOpacity="0.12" />
              <Stop offset="100%" stopColor={blob.color} stopOpacity="0" />
            </RadialGradient>
          ))}
        </Defs>
        {blobs.map((blob, i) => (
          <BlobShape key={`${t}${i}`} index={i} blob={blob} isDark={isDark} width={width} height={height} />
        ))}
      </Svg>
    </View>
  );
}
