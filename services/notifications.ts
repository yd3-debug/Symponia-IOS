import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { generateDailyReflection, RateLimitError } from './anthropic';

// ── Handler (must be set before scheduling) ───────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// ── Permission ────────────────────────────────────────────────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ── Daily reflections ─────────────────────────────────────────────────────────

export interface DailyReflectionUserContext {
  name?: string;
  animals: string[];
  frequency?: string;
}

// Ensures the next 7 days have AI-generated reflection notifications scheduled.
// Safe to call on every app-open — skips days already covered.
export async function topUpDailyReflections(userContext: DailyReflectionUserContext): Promise<void> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  // Find which dates already have a scheduled daily reflection
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  const scheduledDates = new Set(
    existing
      .filter((n) => n.identifier.startsWith('symponia-drefl-'))
      .map((n) => n.identifier.slice('symponia-drefl-'.length)),
  );

  const now = new Date();

  for (let i = 1; i <= 7; i++) {
    const date = new Date(now);
    date.setDate(now.getDate() + i);
    const dateKey = date.toISOString().split('T')[0];

    if (scheduledDates.has(dateKey)) continue;

    // Check trigger before hitting the API — skip past-due slots without a wasted call
    const trigger = new Date(date);
    trigger.setHours(9, 0, 0, 0);
    if (trigger <= now) continue;

    try {
      const body = await generateDailyReflection(userContext, date);

      await Notifications.scheduleNotificationAsync({
        identifier: `symponia-drefl-${dateKey}`,
        content: { title: 'Symponia', body, sound: false },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: trigger,
        },
      });
    } catch (err: unknown) {
      if (err instanceof RateLimitError) {
        console.warn(
          `[Symponia] Daily reflection rate limited — stopping top-up. ` +
          `Retry after ${(err as RateLimitError).retryAfter}s`,
        );
        break;
      }
      console.error(`[Symponia] Failed to schedule reflection for ${dateKey}:`, err);
      // Continue with remaining days
    }
  }
}

// Thin bridge for the pulse.tsx notification toggle.
// enabled=true: reads context from AsyncStorage and runs topUpDailyReflections.
// enabled=false: cancels all scheduled daily reflections.
export async function scheduleDaily(enabled: boolean): Promise<void> {
  const existing = await Notifications.getAllScheduledNotificationsAsync();

  if (!enabled) {
    await Promise.all(
      existing
        .filter((n) =>
          n.identifier.startsWith('symponia-drefl-') ||
          n.identifier.startsWith('symponia-daily-'), // clean up old-format identifiers
        )
        .map((n) =>
          Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {}),
        ),
    );
    return;
  }

  // Read context from AsyncStorage — may be one session stale, which is acceptable
  const [animalsRaw, name, frequency] = await Promise.all([
    AsyncStorage.getItem('symponia_animals'),
    AsyncStorage.getItem('symponia_name'),
    AsyncStorage.getItem('symponia_frequency'),
  ]);
  const animals: string[] = animalsRaw ? JSON.parse(animalsRaw) : [];
  if (animals.length === 0) return;

  await topUpDailyReflections({
    name: name ?? undefined,
    animals,
    frequency: frequency ?? undefined,
  });
}

// ── Weekly / monthly ──────────────────────────────────────────────────────────

const WEEKLY = [
  'This week, notice what you defend most strongly. That is your teacher.',
  'Seven days to practice one thing: letting what is true, be true.',
  'The pattern you keep repeating — this week, name it.',
  'Your dominant archetype is watching. What does it see in you this week?',
];

const MONTHLY = [
  'A new cycle begins. What are you willing to shed?',
  'The month ahead asks: what are you not yet willing to feel?',
  'Something is completing. Let it end cleanly.',
  "A threshold is near. You don't need to know what's on the other side.",
  'The deepest growth rarely announces itself. Pay attention.',
  "What if this month's challenge is your most important teacher?",
  'Something in you is ready to be seen. Let it.',
  'The season inside you is shifting. What wants to grow?',
  'Old skin is ready to be left behind. The new is already forming.',
  "Cycles don't repeat — they spiral. Notice how this one is different.",
  'What you resist this month holds the most information.',
  'You are in the middle of a story you cannot yet read.',
];

export async function scheduleWeekly(enabled: boolean): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync('symponia-weekly').catch(() => {});
  if (!enabled) return;
  // Rotate by ISO week number — same pattern as monthly rotation by month index
  const weekNumber = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  await Notifications.scheduleNotificationAsync({
    identifier: 'symponia-weekly',
    content: { title: 'Symponia', body: WEEKLY[weekNumber % WEEKLY.length], sound: false },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 2, // Monday (1 = Sunday)
      hour: 9,
      minute: 0,
    },
  });
}

export async function scheduleMonthly(enabled: boolean): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync('symponia-monthly').catch(() => {});
  if (!enabled) return;
  await Notifications.scheduleNotificationAsync({
    identifier: 'symponia-monthly',
    content: { title: 'Symponia', body: MONTHLY[new Date().getMonth() % MONTHLY.length], sound: false },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
      repeats: true,
      day: 1,
      hour: 9,
      minute: 0,
    },
  });
}
