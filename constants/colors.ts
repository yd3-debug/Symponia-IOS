// ── Indigo Dark (default) ──────────────────────────────────────────────────────

export const darkColors = {
  bg: '#0E0B1A',
  bgMid: '#14102A',
  glass: 'rgba(120, 90, 220, 0.06)',
  glassStrong: 'rgba(120, 90, 220, 0.12)',
  glassBorder: 'rgba(140, 110, 230, 0.24)',
  glassBorderStrong: 'rgba(140, 110, 230, 0.44)',
  glassShadow: 'rgba(50, 25, 120, 0.40)',
  cyan: '#9B7FE8',
  cyanDim: 'rgba(155, 127, 232, 0.18)',
  cyanBorder: 'rgba(155, 127, 232, 0.38)',
  violet: '#C084FC',
  violetDim: 'rgba(192, 132, 252, 0.20)',
  teal: '#5B8DF0',
  text: 'rgba(235, 228, 255, 0.90)',
  textSub: 'rgba(235, 228, 255, 0.55)',
  textDim: 'rgba(235, 228, 255, 0.32)',
  textUser: 'rgba(245, 240, 255, 0.95)',
  green: 'rgba(80, 190, 110, 0.85)',
  red: 'rgba(210, 75, 75, 0.80)',
  tabBarBg: 'rgba(14, 11, 26, 0.65)',
} as const;

// ── Indigo Light ──────────────────────────────────────────────────────────────

export const lightColors = {
  bg: '#F0EEF9',
  bgMid: '#E6E2F5',
  glass: 'rgba(70, 50, 160, 0.06)',
  glassStrong: 'rgba(70, 50, 160, 0.12)',
  glassBorder: 'rgba(90, 65, 190, 0.26)',
  glassBorderStrong: 'rgba(90, 65, 190, 0.48)',
  glassShadow: 'rgba(50, 35, 130, 0.14)',
  cyan: '#4B2DB5',
  cyanDim: 'rgba(75, 45, 181, 0.14)',
  cyanBorder: 'rgba(75, 45, 181, 0.34)',
  violet: '#7B3FBF',
  violetDim: 'rgba(123, 63, 191, 0.14)',
  teal: '#2E5DBF',
  text: 'rgba(15, 10, 40, 0.92)',
  textSub: 'rgba(15, 10, 40, 0.64)',
  textDim: 'rgba(15, 10, 40, 0.46)',
  textUser: 'rgba(8, 5, 30, 0.95)',
  green: 'rgba(25, 120, 60, 0.90)',
  red: 'rgba(165, 30, 30, 0.88)',
  tabBarBg: 'rgba(238, 234, 252, 0.88)',
} as const;

// ── Obsidian Dark — logo palette (charcoal + teal + gold) ─────────────────────

export const obsidianColors = {
  bg: '#0C1014',
  bgMid: '#131C22',
  glass: 'rgba(50, 210, 205, 0.06)',
  glassStrong: 'rgba(50, 210, 205, 0.12)',
  glassBorder: 'rgba(55, 215, 210, 0.22)',
  glassBorderStrong: 'rgba(55, 215, 210, 0.42)',
  glassShadow: 'rgba(15, 80, 80, 0.45)',
  cyan: '#3DD9D4',          // logo teal
  cyanDim: 'rgba(61, 217, 212, 0.16)',
  cyanBorder: 'rgba(61, 217, 212, 0.34)',
  violet: '#DDB84A',        // logo gold
  violetDim: 'rgba(221, 184, 74, 0.18)',
  teal: '#5AB8F5',
  text: 'rgba(215, 238, 238, 0.90)',
  textSub: 'rgba(215, 238, 238, 0.55)',
  textDim: 'rgba(215, 238, 238, 0.30)',
  textUser: 'rgba(230, 248, 248, 0.95)',
  green: 'rgba(80, 190, 110, 0.85)',
  red: 'rgba(210, 75, 75, 0.80)',
  tabBarBg: 'rgba(12, 16, 20, 0.65)',
} as const;

// ── Pearl Light — logo palette on light background ────────────────────────────

export const pearlColors = {
  bg: '#EDF5F5',
  bgMid: '#E0EEED',
  glass: 'rgba(25, 160, 155, 0.06)',
  glassStrong: 'rgba(25, 160, 155, 0.12)',
  glassBorder: 'rgba(25, 155, 150, 0.26)',
  glassBorderStrong: 'rgba(25, 155, 150, 0.48)',
  glassShadow: 'rgba(15, 90, 90, 0.14)',
  cyan: '#1A8A87',          // dark teal readable on light
  cyanDim: 'rgba(26, 138, 135, 0.14)',
  cyanBorder: 'rgba(26, 138, 135, 0.34)',
  violet: '#A07820',        // dark gold readable on light
  violetDim: 'rgba(160, 120, 32, 0.14)',
  teal: '#2E68BF',
  text: 'rgba(8, 28, 28, 0.92)',
  textSub: 'rgba(8, 28, 28, 0.64)',
  textDim: 'rgba(8, 28, 28, 0.44)',
  textUser: 'rgba(4, 18, 18, 0.95)',
  green: 'rgba(25, 120, 60, 0.90)',
  red: 'rgba(165, 30, 30, 0.88)',
  tabBarBg: 'rgba(225, 238, 238, 0.88)',
} as const;

// Backward-compatible alias
export const C = darkColors;
