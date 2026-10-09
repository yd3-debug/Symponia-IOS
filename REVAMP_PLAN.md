# Symponia revamp plan

Branch: `revamp`. App version on this branch: 2.0.0. Started 2026-10-09.

The mission does not change: shadow work through seven animals, depth psychology,
not therapy. What changes is how you do it: you speak with a presence instead of
typing into a chat.

## Standing rules

1. **Compact, smooth, efficient.** Every visual or feature choice states its size
   and performance cost. Images are compressed (WebP) and sized for the largest
   iPhone, no larger. Rarely seen art loads from the network and is cached.
   Animation moves, scales and fades a few drawings on the UI thread; no video,
   no long frame sequences. Animation pauses off-screen and calms down in Low
   Power Mode and Reduce Motion.
2. **Few native modules.** Each one adds size and forces a new build.
3. **Security is checked every phase** (see the checklist at the end).
4. **Nothing is promised on the website or App Store before it ships.**

## Look and feel (decided)

- Light mode on cream sketchbook paper; coloured-pencil illustration.
- **The cloud** is the guide: cute, colourful, soft. Four states: idle,
  listening, thinking, speaking. No dashes under it (they read as rain).
- **The animals are realistic**, in their real colours, calm and neutral, never
  cute or magical. The method depends on an honest reaction to the real animal,
  most of all the seventh. Face portraits in the picker; whole-body drawings on
  the larger reading screen.
- **Home screen B:** the cloud over pencil hills, one large Liquid Glass card
  holding today's line and the Talk / Write buttons, a glass tab bar.
- **Animal picker:** round bubbles. Real Liquid Glass only on the selected
  animals, the Continue button and the tab bar; the other bubbles are a drawn
  glass ring, because dozens of real glass elements may stutter on older phones.
- Liquid Glass needs iOS 26. Older iPhones get a frosted blur (`expo-blur`).

## How changes reach the phone

Yekta's Mac cannot run the iOS Simulator. So:

- **Browser preview** (`npx expo export --platform web`) for screens and motion.
  Voice, purchases and real Liquid Glass do not work there.
- **One TestFlight build** on the `revamp` update channel (`eas build --profile
  revamp --platform ios`). After it is installed, JavaScript and image changes
  are sent over the air with `eas update --channel revamp`; no rebuild.
- A new build is needed only when a native module is added.

## Builds: as few as possible

Checked on 2026-10-09 in the Expo account (`yekta7`): Starter plan, $19 a month,
which includes $45 of build credit. An iOS build costs about $2 of that credit
($6 for 3 builds this cycle), so roughly 19 more builds are covered before any
extra charge. Over-the-air updates are included up to 3,000 monthly users.

Even so, the rule is: build once for device testing, once for submission.

1. Finish everything that can be checked in the browser preview first: home
   screen, animal picker, onboarding screens, text conversation, crisis screen.
2. Settle every native module before the build: Expo SDK upgrade, speech
   recognition library, audio.
3. **Revamp build** to TestFlight. From then on, changes go over the air.
4. **Submission build** at the end.

The 1.0.8 crash fix is separate: the live app has no update channel, so it can
only ship as its own build.

## iPhone Duo

Apple's foldable (5.4" outer, 7.6" inner), on sale 23 October 2026. Existing
apps keep working. To be optimised an app must be built with the iOS 27.1 SDK;
Duo screenshots are required for updates submitted from April 2027.

- Done 2026-10-09: upgraded from Expo SDK 54 to 57 (React Native 0.86), with
  scene support on and the `revamp` build profile pinned to Expo's Xcode 27.1
  image. Steps and findings are in `EXPO_UPGRADE_54_TO_57.md`. Not yet proven
  by a real build; `revamp-xcode26` is the fallback profile.
- The preview layout holds at Duo-like sizes. To do for the inner display: cap
  the card width, and ship a sharper hills drawing (the current one is enlarged
  and goes soft).

## Phases

| Phase | Builds | Done when |
|---|---|---|
| 0. Foundations | Update channel, native modules for build 1, analytics, crisis-safety screen | The app on Yekta's phone updates without a rebuild |
| 1. The cloud | Floating cloud, four states, home screen B | New home screen on the phone |
| 2. Voice session | Speak, streamed reply, spoken reply, captions, text fallback | A real spoken conversation |
| 3. Onboarding | Cloud-guided animal picker by voice or text; sign-up after the reveal | New first run, fewer steps |
| 4. Memory and daily loop | Server-side memory, an animal for each day, personal notifications, weekly summary | It remembers yesterday |
| 5. Pricing and review | Free first session, free daily moment, annual plan, Apple compliance check | A build ready to submit |
| 6. Launch, then website | Store listing, screenshots, website, marketing content | Live |

Agreed on 2026-10-09, borrowed from Tolan and reshaped for Symponia:

- **The day's animal asks its question** (Phase 4). Seven animals, seven days.
- **The cloud keeps a journal** of your sessions, written from its point of
  view (Phase 4). The middle tab is the journal.
- **Weekly pattern summary** (Phase 4).
- **The pencil landscape fills in as you progress**: trees, flowers, more
  stars. Small drawings added to the page, not a new screen (Phase 4).
- **A shareable "my seven animals" card** (Phase 6, for marketing).
- **A free daily moment**, with depth, memory and long conversations paid
  (Phase 5).
- Not doing: photo sharing, a shared space with friends, everyday-help
  features such as meal plans.

Later, as its own build: a home-screen widget showing the cloud, and the
Dynamic Island during a voice session. iOS does not
allow a character to float freely over the home screen.

## Phase 0 status

- [x] 1.0.8 crash fix committed on `main` (not yet shipped)
- [x] `revamp` branch, version 2.0.0
- [x] Over-the-air updates configured (`expo-updates`, channel `revamp`)
- [x] Native modules for build 1 installed: `expo-updates`, `expo-glass-effect`,
      `expo-image`, `expo-audio`, `expo-speech`, plus what analytics needs
- [x] Browser preview confirmed working
- [ ] Build 1 to TestFlight. Yekta must run it: EAS builds are blocked from the
      assistant's session as production deploys.
- [ ] 1.0.8 crash fix built and sent to TestFlight (same: Yekta runs it)
- [ ] Analytics wired (needs a PostHog project key)
- [ ] Crisis-safety flow: server-side detection and a screen with helplines
- [ ] Measure the real download size of build 1 as the baseline

## Phase 1 status

- [x] Cloud artwork: one body drawing plus five soft-edged face patches cut
      from a single sheet, so they match. `Assets/revamp/` is 404 KB for the
      whole home screen.
- [x] `components/revamp/Cloud.tsx`: drift, sway, breathing, blink, speaking
      mouth, thinking stars, listening lean; honours Reduce Motion. All
      continuous motion comes from one 60-second clock (see the note in the
      file). Measured in headless Chrome over 22 s: 60 fps, largest step
      between frames 0.65 px, no jumps. The first version jumped 7 px every
      5 s because `withRepeat(withSequence(...))` restarts from its first value.
- [x] `components/revamp/Glass.tsx`: real Liquid Glass on iOS 26+, a translucent
      panel elsewhere (blur only on large panels).
- [x] `components/revamp/Paper.tsx`: cream page, grain tile, hills, sun, stars.
- [x] `app/lab.tsx`: home screen B as a preview at `/lab` (browser preview and
      development only). Checked at 375x667, 393x852 and 440x956.
- [ ] Replace the real home tab with this screen and wire Talk / Write.
- [ ] Check real Liquid Glass and frame rate on a phone (needs build 1).
- [ ] The label and heading are placeholder copy until memory exists (Phase 4).

## Supabase findings (2026-10-09, dashboard read only)

- The Symponia organisation is on the **Free plan**. That means no automatic
  database backups, and "Prevent use of leaked passwords" cannot be switched
  on (Pro only).
- Confirm email is off and Captcha is off. Anyone can create accounts in bulk
  and each gets the free trial messages, paid for by the Anthropic key. Fine at
  today's scale; close before any marketing push.
- Secure email change and secure password change are off.

## Open decisions

- Spoken replies: **ElevenLabs** (Yekta's choice, 2026-10-09). The voice must
  feel very natural, and the user picks a woman's or a man's voice. Picture in
  picture is out.
  - Price on elevenlabs.io/pricing/api that day: $0.04 per 1,000 characters
    (about $0.04 per minute of speech) for Flash v2.5 and for v3 Conversational.
    Multilingual v2 and v3 are $0.08. The free plan is 10-20 thousand
    characters a month for the whole account: testing only.
  - Flash v2.5: 32 languages, about 75 ms. v3 Conversational: 70+ languages,
    about 280 ms, more expressive. Both cover all nine app languages, and one
    voice keeps its character across languages. Pick between them by ear.
  - Keep spoken replies short (aim for about 350 characters, roughly 1.4 cents).
    A 2,000-character reply costs 8 cents.
  - The key lives only on the server (a Supabase function secret). The server
    counts characters per user and enforces a monthly cap on spoken minutes;
    past the cap, fall back to Apple's built-in voice or text.
  - Before shipping: add ElevenLabs to the privacy policy, the consent screen
    and Apple's privacy answers; check what ElevenLabs retains; have a native
    speaker listen to Danish, Swedish and Russian.
- Speech recognition: settled. `@react-native-voice/voice` removed,
  `expo-speech-recognition` installed, so it is in the first build.

## Security checklist (run every phase)

- No secrets in the repo or the app bundle; only the public Supabase key ships.
- Supabase security advisors clean, or every finding understood.
- Every new table has Row Level Security with own-row policies.
- Every new server function checks the caller's login itself.
- Any new company that receives user data (speech, analytics) is added to the
  privacy policy, the consent screen and Apple's privacy answers before it ships.
- Voice audio: decide and state whether it is stored. Default is not stored.
- `npm audit` reviewed; build-tool findings are noted, shipped-code findings fixed.

Known open items on 2026-10-09:

- Leaked-password protection is off in Supabase Auth (one toggle in the dashboard).
- `pg_net` extension sits in the `public` schema (low risk, advisory).
- `oracle` has gateway JWT checking off and checks the login in code instead.
  This is deliberate; keep it that way and keep the check.
- `npm audit` reports 54 findings (59 before the patch updates on this branch).
  Almost all are in build tooling that never ships: Metro, Expo CLI, Jest,
  `shell-quote`, `xmldom`, `node-forge`, `fast-uri`. Two flagged packages are
  inside the app bundle, and in both the flawed code path is not used:
  `nanoid` (React Navigation calls it with fixed sizes; the bug needs a negative
  size) and `ws` (pulled in by Supabase realtime for Node; React Native uses the
  phone's own WebSocket, and the app does not use realtime). They clear with
  Expo SDK and Supabase upgrades; do not run `npm audit fix --force`.
- Trial token decrement in `oracle` is not atomic (a user could squeeze a few
  extra free messages). Low impact.
