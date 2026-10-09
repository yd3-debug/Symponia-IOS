import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

// The cloud: Symponia's guide.
//
// Six pencil drawings of the same cloud (Assets/revamp/cloud_*.webp, ~97 KB
// each) differing only in the face. All six are mounted once and cross-shown by
// opacity, so a change of expression never decodes an image or flashes. Each
// drawing's hatching is slightly different, which is what gives the pencil line
// its hand-drawn shimmer when the face changes.
//
// Everything that moves continuously (float, sway, breathing) is a transform
// driven by Reanimated on the UI thread: no layout, no re-render, 60 fps on old
// phones. The only JS-thread work is swapping the face a few times a second.
//
// Reduce Motion: floating and swaying stop; the face still changes, because
// that is information (it is listening, it is speaking), not decoration.

export type CloudState = 'idle' | 'listening' | 'thinking' | 'speaking';
type Frame = 'idle' | 'blink' | 'listening' | 'thinking' | 'speak_a' | 'speak_b';

const FRAMES: Record<Frame, number> = {
  idle: require('@/Assets/revamp/cloud_idle.webp'),
  blink: require('@/Assets/revamp/cloud_blink.webp'),
  listening: require('@/Assets/revamp/cloud_listening.webp'),
  thinking: require('@/Assets/revamp/cloud_thinking.webp'),
  speak_a: require('@/Assets/revamp/cloud_speak_a.webp'),
  speak_b: require('@/Assets/revamp/cloud_speak_b.webp'),
};
const FRAME_KEYS = Object.keys(FRAMES) as Frame[];
const ASPECT = 493 / 660;

const STARS = [
  require('@/Assets/revamp/star_peach.webp'),
  require('@/Assets/revamp/star_lavender.webp'),
  require('@/Assets/revamp/star_teal.webp'),
];

// How each state holds itself. Small numbers on purpose: a guide, not a mascot.
const POSE: Record<CloudState, { float: number; tilt: number; scale: number }> = {
  idle: { float: 7, tilt: 0, scale: 1 },
  listening: { float: 3, tilt: -3.5, scale: 1.05 },
  thinking: { float: 5, tilt: 4, scale: 0.98 },
  speaking: { float: 4, tilt: 0, scale: 1.02 },
};

const ease = Easing.inOut(Easing.sin);

export function Cloud({
  state = 'idle',
  width = 220,
  paused = false,
}: {
  state?: CloudState;
  width?: number;
  /** Stop all motion, e.g. when the screen is not focused. */
  paused?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const still = paused || reduceMotion;
  const height = width * ASPECT;

  const [frame, setFrame] = useState<Frame>('idle');

  // -1..1 oscillators on different periods, so the motion never visibly loops.
  const bob = useSharedValue(0);
  const sway = useSharedValue(0);
  const breath = useSharedValue(0);
  // The pose eases between states instead of snapping.
  const float = useSharedValue(POSE.idle.float);
  const tilt = useSharedValue(0);
  const scale = useSharedValue(1);
  // A tiny pulse each time the mouth opens while speaking.
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (still) {
      [bob, sway, breath].forEach((v) => {
        cancelAnimation(v);
        v.value = withTiming(0, { duration: 300 });
      });
      return;
    }
    bob.value = withRepeat(
      withSequence(withTiming(1, { duration: 2600, easing: ease }), withTiming(-1, { duration: 2600, easing: ease })),
      -1,
    );
    sway.value = withRepeat(
      withSequence(withTiming(1, { duration: 4300, easing: ease }), withTiming(-1, { duration: 4300, easing: ease })),
      -1,
    );
    breath.value = withRepeat(
      withSequence(withTiming(1, { duration: 1900, easing: ease }), withTiming(0, { duration: 1900, easing: ease })),
      -1,
    );
    return () => {
      cancelAnimation(bob);
      cancelAnimation(sway);
      cancelAnimation(breath);
    };
  }, [still, bob, sway, breath]);

  useEffect(() => {
    const p = POSE[state];
    const t = { duration: 520, easing: Easing.out(Easing.cubic) };
    float.value = withTiming(p.float, t);
    tilt.value = withTiming(p.tilt, t);
    scale.value = withTiming(p.scale, t);
  }, [state, float, tilt, scale]);

  // The face. Idle and listening blink at irregular intervals; speaking moves
  // the mouth. In the app the mouth will follow the real audio level; here it
  // is a plausible rhythm.
  useEffect(() => {
    if (paused) return;
    let timer: ReturnType<typeof setTimeout>;
    let alive = true;

    if (state === 'speaking') {
      const tick = () => {
        if (!alive) return;
        const r = Math.random();
        const next: Frame = r < 0.42 ? 'speak_b' : r < 0.8 ? 'speak_a' : 'idle';
        setFrame(next);
        if (next === 'speak_b') {
          pulse.value = withSequence(withTiming(1, { duration: 70 }), withTiming(0, { duration: 160 }));
        }
        timer = setTimeout(tick, 120 + Math.random() * 110);
      };
      tick();
    } else if (state === 'thinking') {
      setFrame('thinking');
    } else {
      const open: Frame = state === 'listening' ? 'listening' : 'idle';
      setFrame(open);
      const blink = () => {
        if (!alive) return;
        setFrame('blink');
        timer = setTimeout(() => {
          if (!alive) return;
          setFrame(open);
          timer = setTimeout(blink, 2600 + Math.random() * 3200);
        }, 130);
      };
      timer = setTimeout(blink, 1800 + Math.random() * 2200);
    }
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [state, paused, pulse]);

  const body = useAnimatedStyle(() => ({
    transform: [
      { translateY: bob.value * float.value },
      { rotate: `${tilt.value + sway.value * 1.2}deg` },
      { scale: scale.value * (1 + breath.value * 0.018 + pulse.value * 0.022) },
    ],
  }));

  // The shadow answers the float: higher cloud, smaller and fainter shadow.
  const shadow = useAnimatedStyle(() => ({
    opacity: 0.62 + bob.value * 0.16,
    transform: [{ scaleX: 1 + bob.value * 0.07 }],
  }));

  return (
    <View style={{ width, height: height + width * 0.2 }} accessible accessibilityRole="image" accessibilityLabel={LABEL[state]}>
      <Animated.View style={[{ width, height }, body]}>
        {FRAME_KEYS.map((key) => (
          <Image
            key={key}
            source={FRAMES[key]}
            style={[StyleSheet.absoluteFill, { opacity: key === frame ? 1 : 0 }]}
            contentFit="contain"
            transition={0}
            cachePolicy="memory"
          />
        ))}
        {state === 'thinking' && !still && <ThinkingStars size={width} />}
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', width: width * 0.7, height: width * 0.13, left: width * 0.15, top: height + width * 0.03 }, shadow]}>
        <Svg width="100%" height="100%" viewBox="0 0 100 20" preserveAspectRatio="none">
          <Defs>
            <RadialGradient id="cloudShadow" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#4B3F7A" stopOpacity="0.55" />
              <Stop offset="55%" stopColor="#4B3F7A" stopOpacity="0.18" />
              <Stop offset="100%" stopColor="#4B3F7A" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Ellipse cx="50" cy="10" rx="50" ry="10" fill="url(#cloudShadow)" />
        </Svg>
      </Animated.View>
    </View>
  );
}

const LABEL: Record<CloudState, string> = {
  idle: 'The cloud is here with you',
  listening: 'The cloud is listening',
  thinking: 'The cloud is thinking',
  speaking: 'The cloud is speaking',
};

/** Three small pencil stars that drift up beside the cloud while it thinks. */
function ThinkingStars({ size }: { size: number }) {
  return (
    <>
      {STARS.map((src, i) => (
        <Star key={i} source={src} delay={i * 420} size={size * (0.085 - i * 0.012)} x={size * (0.76 + i * 0.075)} y={size * (0.1 - i * 0.07)} />
      ))}
    </>
  );
}

function Star({ source, delay, size, x, y }: { source: number; delay: number; size: number; x: number; y: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    const id = setTimeout(() => {
      t.value = withRepeat(
        withSequence(withTiming(1, { duration: 1100, easing: ease }), withTiming(0, { duration: 1100, easing: ease })),
        -1,
      );
    }, delay);
    return () => {
      clearTimeout(id);
      cancelAnimation(t);
    };
  }, [delay, t]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.25 + t.value * 0.75,
    transform: [{ translateY: -t.value * 5 }, { scale: 0.85 + t.value * 0.2 }],
  }));
  return (
    <Animated.View style={[{ position: 'absolute', left: x, top: y, width: size, height: size }, style]}>
      <Image source={source} style={StyleSheet.absoluteFill} contentFit="contain" />
    </Animated.View>
  );
}

