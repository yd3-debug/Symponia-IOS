import { useTheme } from '@/constants/ThemeContext';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const FONT = Platform.select({ ios: 'Helvetica Neue', android: 'Roboto', default: 'System' });

// ── Tab Icons ─────────────────────────────────────────────────────────────────

function OracleIcon({ focused, color }: { focused: boolean; color: string }) {
  return (
    <View style={styles.iconWrap}>
      <Svg width={32} height={32} viewBox="0 0 24 24">
        {/* Outer circle */}
        <Circle cx="12" cy="12" r="8" fill="none" stroke={color} strokeWidth={1.1} opacity={focused ? 1 : 0.7} />
        {/* Inner dot */}
        <Circle cx="12" cy="12" r={focused ? 3 : 1.5} fill={color} opacity={focused ? 0.9 : 0.6} />
        {focused && (
          <Circle cx="12" cy="12" r="5.5" fill="none" stroke={color} strokeWidth={0.6} opacity={0.4} />
        )}
      </Svg>
    </View>
  );
}

function DialogoIcon({ focused, color }: { focused: boolean; color: string }) {
  return (
    <View style={styles.iconWrap}>
      <Svg width={32} height={32} viewBox="0 0 22 22">
        {/* Clean speech bubble */}
        <Path
          d="M4,4 L18,4 Q19.5,4 19.5,5.5 L19.5,13.5 Q19.5,15 18,15 L12.5,15 L10,18.5 L7.5,15 L4,15 Q2.5,15 2.5,13.5 L2.5,5.5 Q2.5,4 4,4 Z"
          fill={focused ? color + '20' : 'none'}
          stroke={color}
          strokeWidth={1.0}
          strokeLinejoin="round"
          opacity={focused ? 1 : 0.75}
        />
        {/* Three dots */}
        <Circle cx="8" cy="9.5" r={focused ? 1.2 : 1} fill={color} opacity={focused ? 1 : 0.6} />
        <Circle cx="11" cy="9.5" r={focused ? 1.2 : 1} fill={color} opacity={focused ? 1 : 0.6} />
        <Circle cx="14" cy="9.5" r={focused ? 1.2 : 1} fill={color} opacity={focused ? 1 : 0.6} />
      </Svg>
    </View>
  );
}

function ProfileIcon({ focused, color }: { focused: boolean; color: string }) {
  return (
    <View style={styles.iconWrap}>
      <Svg width={32} height={32} viewBox="0 0 22 22">
        {/* Head */}
        <Circle
          cx="11" cy="7" r="3.8"
          fill={focused ? color + '20' : 'none'}
          stroke={color}
          strokeWidth={1.1}
          opacity={focused ? 1 : 0.75}
        />
        {/* Shoulders */}
        <Path
          d="M3.5,20 Q3.5,13.5 11,13.5 Q18.5,13.5 18.5,20"
          fill="none"
          stroke={color}
          strokeWidth={1.1}
          strokeLinecap="round"
          opacity={focused ? 1 : 0.75}
        />
      </Svg>
    </View>
  );
}

// ── Apple-style Tab Bar ───────────────────────────────────────────────────────

function GlassTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const icons: Record<string, (focused: boolean) => React.ReactNode> = {
    index: (f) => <OracleIcon focused={f} color={f ? colors.cyan : colors.textDim} />,
    echo:  (f) => <DialogoIcon focused={f} color={f ? colors.cyan : colors.textDim} />,
    pulse: (f) => <ProfileIcon focused={f} color={f ? colors.cyan : colors.textDim} />,
  };

  return (
    <View style={styles.wrapper}>
      <BlurView intensity={85} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <View style={[styles.separator, { backgroundColor: colors.glassBorder }]} />
      <View style={[styles.inner, { backgroundColor: colors.tabBarBg, paddingBottom: insets.bottom + 4 }]}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };
          return (
            <TouchableOpacity key={route.key} style={styles.tab} onPress={onPress} activeOpacity={0.65}>
              {icons[route.name]?.(focused)}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────

export default function TabLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      initialRouteName="echo"
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="echo" />
      <Tabs.Screen name="pulse" />
    </Tabs>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  separator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 0.5,
  },
  inner: {
    flexDirection: 'row',
    paddingTop: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 2,
  },
  iconWrap: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: FONT,
    fontSize: 9,
    letterSpacing: 0.5,
  },
});
