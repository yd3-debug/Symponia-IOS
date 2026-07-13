// The week graph. Arrived vs left.
//
// This is the payoff for every check-in, and the reason this replaces a streak:
// a streak tells you how obedient you've been. This tells you whether the thing
// is working. The bar between the two dots IS the lift — the only number in the
// product that actually answers "is this helping me?"
//
// If there isn't enough data to say something honest, it says nothing. Drawing a
// confident trend through two points would be a lie, and this is the one screen
// that has to be trustworthy.

import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import { t } from '@/constants/i18n';
import { useTheme } from '@/constants/ThemeContext';
import { averageLift, type MoodRow } from '@/services/mood';

const FONT = Platform.select({ ios: 'Helvetica Neue', android: 'Roboto', default: 'System' });
const DAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function MoodWeek({ rows }: { rows: MoodRow[] }) {
  const { colors } = useTheme();

  if (rows.length === 0) {
    return (
      <Text style={[styles.empty, { color: colors.textDim }]}>
        {t('Check in when you open Symponia — after a week you’ll see the shape of it.')}
      </Text>
    );
  }

  // Bucket by day of week, most recent value wins for each phase.
  const days: { before?: number; after?: number }[] = Array.from({ length: 7 }, () => ({}));
  const now = new Date();
  for (const r of rows) {
    const d = new Date(r.created_at);
    const daysAgo = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (daysAgo > 6) continue;
    const slot = 6 - daysAgo; // oldest left, today right
    if (r.phase === 'before') days[slot].before = r.score;
    else days[slot].after = r.score;
  }

  const lift = averageLift(rows);
  const H = 92;
  const y = (v: number) => H - ((v - 1) / 4) * H;

  return (
    <View>
      {lift !== null && (
        <Text style={[styles.headline, { color: colors.cyan }]}>
          {lift > 0.3
            ? t('You tend to leave lighter than you arrive.')
            : lift < -0.3
              ? t('Lately this has been heavy going. That is worth knowing too.')
              : t('Steady. Not every week moves.')}
        </Text>
      )}

      <View style={[styles.chart, { height: H }]}>
        {[0, 1, 2].map((g) => (
          <View
            key={g}
            style={[styles.grid, { top: (g * H) / 2, backgroundColor: colors.glassBorder }]}
          />
        ))}

        {days.map((d, i) => {
          const left: `${number}%` = `${(i / 6) * 100}%`;
          return (
            <View key={i} style={[styles.col, { left }]}>
              {/* the lift, made visible */}
              {d.before !== undefined && d.after !== undefined && (
                <View
                  style={{
                    position: 'absolute',
                    width: 3,
                    borderRadius: 2,
                    backgroundColor: colors.cyan,
                    opacity: 0.28,
                    top: Math.min(y(d.before), y(d.after)),
                    height: Math.max(3, Math.abs(y(d.after) - y(d.before))),
                  }}
                />
              )}
              {d.before !== undefined && (
                <View style={[styles.ring, { top: y(d.before) - 4.5, borderColor: colors.textDim }]} />
              )}
              {d.after !== undefined && (
                <View style={[styles.dot, { top: y(d.after) - 5, backgroundColor: colors.cyan }]} />
              )}
            </View>
          );
        })}
      </View>

      <View style={styles.axis}>
        {DAY_KEYS.map((d) => (
          <Text key={d} style={[styles.day, { color: colors.textDim }]}>{t(d)}</Text>
        ))}
      </View>

      <View style={styles.legend}>
        <Text style={[styles.legendText, { color: colors.textDim }]}>{t('○ arriving')}</Text>
        <Text style={[styles.legendText, { color: colors.cyan }]}>{t('● leaving')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { fontSize: 12.5, fontFamily: FONT, lineHeight: 19, marginTop: 8 },
  headline: { fontSize: 13, fontFamily: FONT, fontWeight: '500', marginBottom: 14, lineHeight: 19 },
  chart: { position: 'relative', marginRight: 4 },
  grid: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, opacity: 0.6 },
  col: { position: 'absolute', width: 10, marginLeft: -5, height: '100%' },
  ring: { position: 'absolute', left: 0.5, width: 9, height: 9, borderRadius: 5, borderWidth: 1.4 },
  dot: { position: 'absolute', left: 0, width: 10, height: 10, borderRadius: 5 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  day: { fontSize: 10, fontFamily: FONT },
  legend: { flexDirection: 'row', gap: 14, marginTop: 12 },
  legendText: { fontSize: 10.5, fontFamily: FONT },
});
