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
// ONE BODY, FIVE FACES. The cloud is a single pencil drawing (cloud_idle.webp).
// Every other expression is a small soft-edged patch of just the face, laid over
// that body. An earlier version swapped six whole drawings, so each blink
// replaced the entire pencil texture for a moment, which read as a flicker.
// Patches change only the face, and cost 208 KB in total instead of 578 KB.
//
// ONE CLOCK. All continuous motion is computed from a single value that runs
// 0 -> 1 over a minute and repeats. Each movement is a whole number of sine
// waves inside that minute, so when the clock wraps from 1 back to 0 every
// sine is back where it started and nothing jumps. The waves have different
// lengths, so the combined drift only repeats once a minute and never looks
// like a loop. (Do not rebuild this from withRepeat(withSequence(...)) without
// `reverse`: Reanimated restarts each repeat from the value the animation
// FIRST started at, which made the cloud snap back to centre every 5 seconds.)
//
// It all runs on the UI thread as a transform: no layout, no re-render.
//
// Reduce Motion, or `paused`: the drift eases to rest. The face still changes,
// because that is information (it is listening, it is speaking), not decoration.

export type CloudState = 'idle' | 'listening' | 'thinking' | 'speaking';
type Face = 'idle' | 'blink' | 'listening' | 'thinking' | 'speak_a' | 'speak_b';

const BODY = require('@/Assets/revamp/cloud_idle.webp');
const FACES: Record<Exclude<Face, 'idle'>, number> = {
  blink: require('@/Assets/revamp/face_blink.webp'),
  listening: require('@/Assets/revamp/face_listening.webp'),
  thinking: require('@/Assets/revamp/face_thinking.webp'),
  speak_a: require('@/Assets/revamp/face_speak_a.webp'),
  speak_b: require('@/Assets/revamp/face_speak_b.webp'),
};
const FACE_KEYS = Object.keys(FACES) as Exclude<Face, 'idle'>[];

// The body drawing is 660 x 493; the face patches were cut from this box in it.
const BODY_W = 660;
const BODY_H = 493;
const FACE_BOX = { x: 150, y: 150, w: 360, h: 216 };
const ASPECT = BODY_H / BODY_W;

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

const LOOP_MS = 60_000;
const TAU = Math.PI * 2;

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

  const [face, setFace] = useState<Face>('idle');

  const clock = useSharedValue(0);
  // 0 = at rest, 1 = drifting. Eased, so starting and stopping are gentle.
  const drift = useSharedValue(0);
  // The pose eases between states instead of snapping.
  const float = useSharedValue(POSE.idle.float);
  const tilt = useSharedValue(0);
  const scale = useSharedValue(1);
  // A tiny pulse each time the mouth opens wide while speaking.
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (still) {
      // Ease to rest first, then stop the clock so nothing runs off-screen.
      drift.value = withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) }, (finished) => {
        if (finished) cancelAnimation(clock);
      });
      return;
    }
    // Safe to restart from 0: with drift at 0 the cloud is at rest wherever the
    // clock is, so there is nothing to jump.
    clock.value = 0;
    clock.value = withRepeat(withTiming(1, { duration: LOOP_MS, easing: Easing.linear }), -1, false);
    drift.value = withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) });
    return () => cancelAnimation(clock);
  }, [still, clock, drift]);

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
        const next: Face = r < 0.42 ? 'speak_b' : r < 0.8 ? 'speak_a' : 'idle';
        setFace(next);
        if (next === 'speak_b') {
          pulse.value = withSequence(withTiming(1, { duration: 70 }), withTiming(0, { duration: 160 }));
        }
        timer = setTimeout(tick, 120 + Math.random() * 110);
      };
      tick();
    } else if (state === 'thinking') {
      setFace('thinking');
    } else {
      const open: Face = state === 'listening' ? 'listening' : 'idle';
      setFace(open);
      const blink = () => {
        if (!alive) return;
        setFace('blink');
        timer = setTimeout(() => {
          if (!alive) return;
          setFace(open);
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

  // Whole numbers of cycles per minute: 11, 4, 7, 5, 13, 16. See the note above.
  const body = useAnimatedStyle(() => {
    const p = clock.value * TAU;
    const d = drift.value;
    const y = (Math.sin(p * 11) * 0.78 + Math.sin(p * 4 + 2.1) * 0.3) * float.value * d;
    const x = Math.sin(p * 7 + 1.3) * float.value * 0.5 * d;
    const sway = (Math.sin(p * 5 + 0.6) * 1.1 + Math.sin(p * 13) * 0.35) * d;
    const breath = (Math.sin(p * 16 - 1) + 1) / 2;
    return {
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${tilt.value + sway}deg` },
        { scale: scale.value * (1 + breath * 0.016 * d + pulse.value * 0.022) },
      ],
    };
  });

  // The shadow answers the float: higher cloud, smaller and fainter shadow.
  const shadow = useAnimatedStyle(() => {
    const p = clock.value * TAU;
    const lift = (Math.sin(p * 11) * 0.78 + Math.sin(p * 4 + 2.1) * 0.3) * drift.value;
    return {
      opacity: 0.62 + lift * 0.16,
      transform: [{ translateX: Math.sin(p * 7 + 1.3) * float.value * 0.5 * drift.value }, { scaleX: 1 + lift * 0.07 }],
    };
  });

  const k = width / BODY_W;

  return (
    <View style={{ width, height: height + width * 0.2 }} accessible accessibilityRole="image" accessibilityLabel={LABEL[state]}>
      <Animated.View style={[{ width, height }, body]}>
        <Image source={BODY} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} cachePolicy="memory" />
        {FACE_KEYS.map((key) => (
          <Image
            key={key}
            source={FACES[key]}
            style={{
              position: 'absolute',
              left: FACE_BOX.x * k,
              top: FACE_BOX.y * k,
              width: FACE_BOX.w * k,
              height: FACE_BOX.h * k,
              opacity: key === face ? 1 : 0,
            }}
            contentFit="fill"
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
    // `reverse` makes this a true back-and-forth, so it has no restart to jump at.
    const id = setTimeout(() => {
      t.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true);
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
