import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { darkColors, lightColors, obsidianColors, pearlColors } from './colors';

export interface AppColors {
  bg: string;
  bgMid: string;
  glass: string;
  glassStrong: string;
  glassBorder: string;
  glassBorderStrong: string;
  glassShadow: string;
  cyan: string;
  cyanDim: string;
  cyanBorder: string;
  violet: string;
  violetDim: string;
  teal: string;
  text: string;
  textSub: string;
  textDim: string;
  textUser: string;
  green: string;
  red: string;
  tabBarBg: string;
}

// ── Theme definitions ──────────────────────────────────────────────────────────

export type ThemeId = 'indigo-dark' | 'indigo-light' | 'obsidian-dark' | 'pearl-light';

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  dark: boolean;
  bgColor: string;    // swatch background
  accentColor: string; // swatch accent
}

export const THEMES: ThemeMeta[] = [
  { id: 'indigo-dark',  label: 'Indigo',   dark: true,  bgColor: '#0E0B1A', accentColor: '#9B7FE8' },
  { id: 'obsidian-dark', label: 'Obsidian', dark: true, bgColor: '#0C1014', accentColor: '#3DD9D4' },
  { id: 'indigo-light', label: 'Bloom',    dark: false, bgColor: '#F0EEF9', accentColor: '#4B2DB5' },
  { id: 'pearl-light',  label: 'Pearl',    dark: false, bgColor: '#EDF5F5', accentColor: '#1A8A87' },
];

const THEME_COLORS: Record<ThemeId, typeof darkColors> = {
  'indigo-dark':  darkColors,
  'indigo-light': lightColors,
  'obsidian-dark': obsidianColors,
  'pearl-light':  pearlColors,
};

// ── Context ────────────────────────────────────────────────────────────────────

interface ThemeContextValue {
  isDark: boolean;
  themeId: ThemeId;
  colors: AppColors;
  setTheme: (id: ThemeId) => void;
  /** Legacy toggle — flips between the two variants of the current palette */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  isDark: true,
  themeId: 'indigo-dark',
  colors: darkColors as AppColors,
  setTheme: () => {},
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeState] = useState<ThemeId>('indigo-dark');

  useEffect(() => {
    AsyncStorage.getItem('symponia_theme').then((val) => {
      if (val && val in THEME_COLORS) setThemeState(val as ThemeId);
      else {
        // migrate old dark_mode boolean
        AsyncStorage.getItem('symponia_dark_mode').then((dm) => {
          if (dm === 'false') setThemeState('indigo-light');
        });
      }
    });
  }, []);

  const setTheme = useCallback((id: ThemeId) => {
    setThemeState(id);
    AsyncStorage.setItem('symponia_theme', id);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: ThemeId =
        prev === 'indigo-dark'   ? 'indigo-light' :
        prev === 'indigo-light'  ? 'indigo-dark'  :
        prev === 'obsidian-dark' ? 'pearl-light'  :
                                   'obsidian-dark';
      AsyncStorage.setItem('symponia_theme', next);
      return next;
    });
  }, []);

  const isDark = THEMES.find((t) => t.id === themeId)?.dark ?? true;
  const colors = THEME_COLORS[themeId] as AppColors;

  return (
    <ThemeContext.Provider value={{ isDark, themeId, colors, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
