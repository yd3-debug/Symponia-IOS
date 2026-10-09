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

## Voice disclosure (built 2026-10-09, ahead of the voice session)

- `components/revamp/VoiceConsent.tsx`: shown before the first spoken session
  and from Settings. Says when the microphone is on, that Apple turns speech
  into text, that ElevenLabs reads the replies and receives their text, and
  that typing always works. Woman's or man's voice is chosen here. Translated
  into all nine languages.
- `services/voice.ts`: the answer, cached on the device and mirrored to the
  profile. `null` = not asked, `false` = types.
- `supabase/migrations/20261009120000_add_voice_prefs.sql`: **applied to the
  live database on 2026-10-09** (additive: two profile columns, a usage table
  and a self-test token table, the last two service-role only).
- `supabase/functions/speak`: **deployed 2026-10-09**. Signed-in people only;
  refuses without AI consent and voice consent; voice comes from the profile;
  1,200 characters per reply; 120,000 characters per 30 days for subscribers,
  8,000 on the trial, 12,000 per hour; fails closed if the meter is down.
  Nothing in the shipped app calls it yet.
- Self-test (2026-10-09): the key is accepted, and unauthenticated calls and a
  reused token are refused with 401. **Both voices were refused with 402:
  "Free users cannot use library voices via the API."** A paid ElevenLabs plan
  (Starter or above) is needed before the cloud can speak in these voices.
- To re-run the self-test: insert a random token with a short expiry into
  `voice_selftest_tokens`, then POST to the function with the public key as
  the bearer and the token in the `x-voice-selftest` header.
- Known gap: the app supplies the text to speak. Before release, have oracle
  sign its replies and have `speak` verify the signature, so the voice can only
  read what the server wrote.
- ElevenLabs keeps request history by default (zero-retention mode is for
  enterprise plans only). Say so in the privacy policy.
- Still to do before voice ships: the same facts in the privacy policy and
  Apple's privacy answers; confirm on-device recognition per language (if a
  language is recognised on Apple's servers instead, the wording stays true but
  say so in the policy); check ElevenLabs' retention terms.
- Voices chosen by Yekta (2026-10-09), in `supabase/functions/_shared/voices.ts`:
  woman = Marie Callahasin (`L98c1yZIIK3on1wizQ55`), man = Jeremy
  (`5gaEGrWSk4v20HMfIhgC`). Both are Voice Library voices: add them to the
  account's own voices, confirm the plan allows library voices over the API,
  and listen to each in all nine languages.
- ElevenLabs account (checked 2026-10-09): Free plan, API access included, no
  commercial licence. Fine for building and private testing (20,000 characters
  a month on the real-time models). Needs Starter or above before release.
  Key for this app: its own key, Text to Speech access only.

## Agreement before use (built 2026-10-09)

Shown before Symponia does anything, with or without an account.

- `components/revamp/BeforeWeBegin.tsx`: five plain statements (it is an AI and
  not a person; not therapy or medical care; cannot help in an emergency, with
  a helpline link; words are sent to Anthropic; adults only), then three
  separate unticked boxes: 18+ and Terms/Privacy; understands what it is not;
  agrees to AI processing. Begin is disabled until all three are ticked.
- `services/consent.ts` + `consent_records` (applied to the live database):
  an append-only record of each acceptance with wording version, language and
  app version. Works before sign-in: rows wait on the device and upload when a
  session exists. Change the wording and bump `CONSENT_VERSION`, and everyone
  is asked again.
- Wording mirrors section 5 of the published Terms and the AI disclosure in
  New York's companion law. Translated into the other eight languages.
- Tested in headless Chrome: Begin does nothing with zero or two boxes ticked;
  with three it proceeds, stores the version and is not shown again.

**Not legal advice, and not yet reviewed by a lawyer.** Before release:

1. A solicitor reads the screen, the Terms and the Privacy Policy together
   (England and Wales governs; users are worldwide). Native speakers check the
   eight translations.
2. Publish the crisis protocol on the website (California SB 243 asks for it
   to be public) and build the in-app crisis flow that matches it.
3. Repeat the "I am an AI, not a person" notice at the start of every session
   and at least every three hours in a long one (New York, California).
4. Show a "may not be suitable for minors" notice; keep 18+ in the Terms and
   set the App Store age rating to match.
5. Add ElevenLabs and the new data to the Privacy Policy and Apple's privacy
   answers; state how long each provider keeps data.
6. Never promise confidentiality in the app's copy. Say "private", and only
   where the Privacy Policy backs it.
7. Let people withdraw each consent in Settings, and record the withdrawal.
8. Ask an insurance broker about cover for a wellbeing app (professional
   indemnity / technology errors and omissions). A disclaimer limits risk; it
   does not remove it.
9. Consider whether reflections are "special category" data under UK/EU law
   (they may reveal health). If so the separate, explicit AI-processing box is
   doing necessary work: keep it separate.

## Starting without an account (agreed 2026-10-09; not built)

Open the app, a temporary account is created silently, agree, pick animals,
first session; then "shall I keep this for you?" links it to Apple, Google or
email. Required at subscription.

**Database change: done on 2026-10-09**
(`supabase/migrations/20261009160000_profiles_key_on_user_id.sql`). Profiles
are now keyed on `user_id`; `email` may be empty and stays unique; the new-user
trigger inserts by `user_id`; a second trigger copies an email onto the
profile when a temporary account is linked. Tested with fake accounts inside a
rolled-back transaction, and the live API still answers the shipped app's
calls. Not tested: a real sign-up from the App Store build.

**Switch on, and checked, 2026-10-09.** "Allow anonymous sign-ins" is enabled.

What a temporary account can do (simulated inside the database, rolled back):
sees only its own profile; cannot give itself credit or a subscription; cannot
read or change anyone else's data; can add its own consent records but cannot
forge, edit or delete any; has no access to the usage, voice or self-test
tables.

Limits in force:

- Supabase: 30 temporary sign-ins per hour per IP address.
- Database: 50 temporary accounts per rolling 24 hours in total
  (`app_limits.anon_accounts_per_day`; raise it before any marketing push).
  Past the ceiling, temporary sign-in fails and the app must offer ordinary
  sign-in. Email, Apple and Google sign-ups are unaffected.
- Each account: 10 trial messages; voice 8,000 characters per 30 days.

**What is still exposed.** Inside `oracle`, three paths cost money without
using a trial message: the translated opening (up to 40 per 30 days), the
archetype text, and the daily reflection (10 a day). A scripted temporary
account could spend roughly $2 on them. With the ceiling that is about $100 a
day at the very worst. The same was already true of email sign-ups, which
need no confirmation and no captcha. To close it properly:

1. In `oracle`, refuse those three paths for temporary accounts and add a
   daily budget for all trial spending. Do this in the one planned `oracle`
   update (streaming, signed replies, crisis detection), not as a hot patch.
2. Set a monthly spending limit in the Anthropic console (Yekta). It is the
   backstop for everything above.
3. Captcha or Apple device attestation on sign-up, before marketing.

Still to build:

1. App: sign in silently on first open, show "Before we begin", and offer
   "shall I keep this for you?" after the first session (link to Apple, Google
   or email; required at subscription). Handle "temporary accounts are paused"
   by offering ordinary sign-in.
2. Clean-up of temporary accounts that never return. Needs a decision on how
   long to keep them, because deleting one deletes that person's animals.
3. `delete-account` and the purchase functions: confirm they behave for an
   account with no email.

## After launch

- Redesign the website home page in full, once the new app is live (Yekta,
  2026-10-09). Until then the site says nothing about the new features.
- Marketing: see `MARKETING_PLAN.md`.

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
