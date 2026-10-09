import React from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Cloud, type CloudState } from './Cloud';

// The cloud, but you can pick it up.
//
// Drag: it follows the finger, grows a touch while held, and when released
// springs back to where it lives, so it can never be left covering the text.
// Tap: a small hop, so touching it always gets an answer.
//
// Everything here runs on the UI thread. The drag adds to the cloud's own
// drift rather than replacing it, so it keeps floating while it is held.

const HOME = { damping: 13, stiffness: 95, mass: 0.9 };

export function DraggableCloud({ state, width, paused }: { state?: CloudState; width?: number; paused?: boolean }) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const held = useSharedValue(0);
  const hop = useSharedValue(0);

  const pan = Gesture.Pan()
    .onBegin(() => {
      held.value = withTiming(1, { duration: 140 });
    })
    .onChange((e) => {
      x.value += e.changeX;
      y.value += e.changeY;
    })
    .onFinalize(() => {
      held.value = withTiming(0, { duration: 220 });
      x.value = withSpring(0, HOME);
      y.value = withSpring(0, HOME);
    });

  const tap = Gesture.Tap().onEnd(() => {
    hop.value = withSequence(withTiming(1, { duration: 110 }), withSpring(0, { damping: 9, stiffness: 180 }));
  });

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value - hop.value * 14 },
      // Leans a little in the direction it is being pulled.
      { rotate: `${Math.max(-8, Math.min(8, x.value * 0.04))}deg` },
      { scale: 1 + held.value * 0.05 + hop.value * 0.03 },
    ],
  }));

  return (
    <GestureDetector gesture={Gesture.Race(pan, tap)}>
      <Animated.View style={style} accessibilityHint="Drag to move the cloud. It floats back when you let go.">
        <Cloud state={state} width={width} paused={paused} />
      </Animated.View>
    </GestureDetector>
  );
}
