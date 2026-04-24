# Symponia — App Store Rejection Fix Brief

**For:** Claude Code (and whoever updates the website + App Store Connect)
**Context:** iOS submission ID 18951a20-7198-4313-9bec-9469c4c312ee was rejected under guidelines 4.3(b), 3.1.2(c) (×2), and 5.1.1(i) / 5.1.2(i). This brief resolves all four.
**AI backend:** Anthropic (Claude API)
**Subscription model:** 10 free reflections → £12.99/month (350 reflections), plus two consumable packs (£4.99 for 50, £9.99 for 150)
**Execution order:** Home screen → Paywall → AI consent step → Global copy audit → everything else.

---

## 0. Critical features to remove or rewrite (do this FIRST)

The Apple review screenshots surfaced features that were not visible in the earlier audit. These are the single biggest 4.3(b) triggers in the app and must be addressed before anything else. Do not resubmit with any of these still present.

**0.1 — Remove or completely rewrite the `SENSE · ZODIAC` chat flow**

This flow collects the user's birth date and the AI responds in explicit astrological voice, with lines such as: *"The stars and the year you arrived are the first layer of what I see. I have been reading configurations like yours for a long time."*

This is the single most damaging screen in the app for 4.3(b). The AI persona is presenting as an astrologer, which is exactly the saturated-category pattern Apple rejects.

Preferred resolution: **delete the entire `SENSE · ZODIAC` feature** — remove the navigation entry, the flow, the system prompt, and any associated server routes.

If the feature must remain in some form:
- Remove "ZODIAC" from every user-visible label. Rename the flow to something like `Birth Chart Reflection` only if kept — but better to just remove it.
- Remove birth-date collection as a mandatory step. If you keep it, explain it as "used only to inform your archetype" and do not have the AI describe the data as astrological.
- Rewrite the system prompt for this flow so the AI does **not** speak as an astrologer. No references to "stars", "configurations I read", "the first layer of what I see", etc. The AI must speak as a reflection companion throughout.
- Apply the global forbidden-word list (section 10) to every response this flow generates.

**0.2 — Remove the NUMEROLOGY section**

The profile/settings screen contains a `NUMEROLOGY` section. Numerology is in the same 4.3(b) saturated category as astrology. Delete the entire section: the label, any feature it fronts, and any associated code path. Do not simply rename it — numerology is itself the problem, not the wording.

**0.3 — Rename the `SENSE · ZODIAC` chat header**

If any `SENSE · ZODIAC` screen header survives anywhere in the app after 0.1, rename it. The word `ZODIAC` must not appear as a user-visible label anywhere in the app.

**0.4 — Confirm AI system prompts are clean across all flows**

After 0.1 is done, audit every system prompt used to call the Anthropic API. There should be:
- No prompt that tells the AI to act as an astrologer, oracle, fortune-teller, or numerologist.
- No prompt that includes astrological terms, zodiac sign names, planetary names, or numerological concepts as instructions to the AI.
- All prompts should instruct the AI to speak as a reflection companion using Jungian/archetypal/philosophical language (the voice from section 10).

The forbidden-word list from section 10 must apply to **every** AI-generated string in the app (chat, daily reflection, notifications, any special flows), not just daily reflection generation.

---

## 1. Home screen

- Rename the `SENSE · TODAY` card label to `REFLECTION · TODAY`. Keep the body copy and voice unchanged.
- Change the prompt text `what would you like to explore?` to `what do you want to reflect on?`.
- Rename the `ANIMAL READING` tile to `ARCHETYPE`. Change its subtitle from `Name your seven animals. Discover the soul they reveal.` to `Seven animals that reveal who you are.`
- Keep the `MY DAY` tile title. Change its subtitle from `A personal oracle reading for this exact moment.` to `A personal reflection for this exact moment.`
- **Remove** the `ZODIAC COMPASS` tile from the home screen. If the underlying feature must remain accessible, move it behind the profile or "More" tab. Do not link it from home.
- **Remove** the `FREQUENCY — coming soon` tile.
- **Add** a new tile titled `CONVERSATION` with subtitle `Talk with Symponia about anything on your mind.` that routes to the chat tab.
- Increase the size and prominence of the footer hint `long-press any word to see the archetype behind it`.
- If feasible, change the app's default launch tab to the chat tab. Otherwise, add a prominent `Talk with Symponia` CTA directly below the Reflection · Today card.

## 2. Paywall (new/updated screen)

Shown when the user reaches 0 remaining reflections, or taps an upgrade CTA. **Preferred implementation:** StoreKit 2 `SubscriptionStoreView` for the subscription, plus separate product views for the consumable packs.

Required visible content, in this order:

```
Keep reflecting with Symponia
Choose a plan that fits you.

── SUBSCRIPTION ──

Symponia Monthly — £12.99 / month
350 reflections per month
(a reflection is one exchange with Symponia)
Auto-renews every month until cancelled.
Unused reflections do not carry over — your allowance
resets at each renewal.
Cancel anytime in your Apple ID settings.

[ Subscribe — £12.99 / month ]

── ONE-TIME PACKS ──
(no subscription — yours to keep, no expiry)

Small pack — £4.99
50 reflections
[ Buy ]

Popular pack — £9.99
150 reflections
[ Buy ]

[ Restore Purchases ]

By continuing you agree to our
Terms of Use · Privacy Policy
```

All four labels (title, length, full price, what's included), the reset-at-renewal behaviour, the cancellation line, the Restore Purchases button, and both policy links are required by guideline 3.1.2(c).

**Profile/settings SUBSCRIPTION section must also be compliant.** The review screenshots show a settings screen with a `SUBSCRIPTION` section containing only a `symponia premium` button, a `restore purchases` button, and policy links — no plan title, length, price, or description. Either:

- Have the `symponia premium` button route to the full paywall screen described above (preferred), OR
- Render the same required disclosures inline in this section (title, length, price, what's included, auto-renewal line, reset-at-renewal line, cancellation line).

When a user has an active subscription, this section must also display: the active plan name, renewal date, and a link to manage the subscription in Apple ID settings.

## 3. AI consent — new onboarding step 06/06

Insert this step after account creation (step 05/05) and before the user lands on the home screen.

```
Title:    a moment of transparency

Body:     Symponia thinks with you using Anthropic's Claude,
          a third-party AI service.

          When you write to Symponia, your messages, your chosen
          name, and your archetype are sent to Anthropic so a
          reflection can come back to you.

          Nothing else is shared. Your email, password, and
          payment details never leave our systems. We do not
          sell your data. Anthropic processes your messages to
          generate responses and does not use them to train
          their models.

Checkbox: I understand and agree to this processing. (required)

Button:   continue   (disabled until the checkbox is ticked)
```

- Persist consent both locally and server-side.
- Add a `Revoke AI consent` option in the profile/settings tab. Revoking consent disables chat features until re-accepted.
- Confirm with your team that you're on Anthropic's standard API terms (which don't use customer data for training) before shipping the line about training.

## 4. Global copy audit

- Find every user-facing occurrence of `reading` (when used to describe a feature, output, button, or screen title) and replace with `reflection` or `session`. Do **not** change legal/policy text.
- Find every user-facing occurrence of `oracle` and replace with `Symponia` or `reflection`, as context requires.
- Find every user-facing occurrence of `token` / `tokens` and replace with `reflection` / `reflections`. Update counters, receipts, history screens accordingly.
- In onboarding step 03/05 page 1, change the subtitle `your dominant soul` to `your dominant archetype`.
- Leave `shadow` and `the one that unsettles you` unchanged — those are correct Jungian terminology and are a strong asset.
- On the profile/settings screen, rename the section header `SENSE · TOKENS` to `REFLECTIONS`.
- On the profile/settings screen, change the progress-bar label `10 READINGS LEFT` to `10 reflections left` (match case to surrounding UI).
- On the profile/settings screen, change the subtitle `1 READING = 1 EXCHANGE` to something clearer — recommended: `one reflection is one exchange with Symponia`.
- On the profile/settings screen, change the pack purchase buttons from `50 tokens` / `150 tokens` to `50 reflections — £4.99` / `150 reflections — £9.99` (match exact pricing from section 2).
- Audit every chat screen header/title for the word `ZODIAC` and remove it as part of section 0.

## 5. Splash screen + step 05 microcopy

- Splash: add a second line beneath `a resonant presence` reading `an AI companion for reflection`.
- Step 05/05 bottom microcopy: replace `Your data is processed under GDPR. We never sell or share it.` with:

```
Your messages are processed by Anthropic's Claude to generate
responses. We never sell your data. See Privacy Policy for
full details.
```

## 6. Reflection counter + soft paywall warm-up

- Display remaining free reflections persistently on the home screen or chat header (e.g., `8 reflections remaining`).
- When the user reaches 0 remaining free reflections, show a soft intermediate screen once, before the hard paywall:

```
Headline: You've used your 10 free reflections.
Body:     Choose a plan to keep reflecting with Symponia.
Button:   See plans  →  (routes to paywall)
```

## 7. Privacy Policy (hosted, not in app code)

Add this section to the hosted Privacy Policy at symponia.io. Adjust to your policy's voice:

```
AI Processing

Symponia uses Anthropic's Claude API to generate reflections
in response to your messages. When you send a message to
Symponia, the following data is transmitted to Anthropic:

  - The text of your message
  - Your chosen name (or "unnamed" if you left it blank)
  - Your archetype, shadow, and voice preference

No other personal data is sent. Under Anthropic's standard API
terms, this data is processed to generate a response and is
not used to train Anthropic's models. For more information,
see Anthropic's Privacy Policy at
https://www.anthropic.com/legal/privacy.

You consent to this processing during onboarding, and you may
revoke consent at any time from your profile settings, which
will end your ability to use Symponia's reflection features.
```

Confirm both the Privacy Policy URL and the Terms of Use URL return 200 and render correctly on mobile.

## 8. Website consistency (symponia.io)

- On `/credits`: replace `Experience the oracle.` with `Experience Symponia.` or `Start reflecting.`
- Sitewide: audit for `oracle`, `horoscope`, `zodiac`, `reading` and rework to match the in-app reflection/archetype positioning. Apple reviewers sometimes cross-check the marketing site against the App Store listing.

## 9. App Store Connect (configured in App Store Connect, not in code)

- **Subtitle:** `AI reflection companion` (or similar — avoid `horoscope`, `zodiac`, `oracle`, `fortune`).
- **Description:** rewrite the first paragraph to lead with the reflection/archetype positioning, not astrology.
- **EULA:** add a functional link to Apple's standard Terms of Use in the App Description, or upload a custom EULA in the EULA field.
- **Privacy Policy URL:** confirm the field is set and live.
- **Screenshots:** replace all. Suggested order:
  1. Step 03/05 "and finally your shadow" grid
  2. Step 03/05 "which animal speaks to you most?" with panther selected
  3. Step 04/05 "how shall I speak to you?" (felt · precise · still)
  4. Chat conversation screenshot
  5. New home screen
  6. Archetype result screen
- **App Review Information → Demo Account:** provide a working test email + password so reviewers don't bail at sign-up.
- **App Review Information → Notes:** paste the positioning blurb below.

```
Symponia is a reflection companion built around a Jungian
archetype onboarding (users select a dominant animal, five more,
and a shadow animal — standard archetypal psychology), which
then shapes how the AI speaks with them in one of three
reflection voices (felt, precise, still). It is not an astrology,
horoscope, or divination app.

The app uses Anthropic's Claude as its AI backend; explicit user
consent is obtained at onboarding step 06/06, and users can
revoke consent in the profile tab.

Daily notifications send short, affirmational reflections written
in archetypal/philosophical language, shaped by the user's
selected archetype. They do not contain horoscopes, zodiac
predictions, or astrological content in their surface text.

Notable screens: step 03 (archetype selection, including shadow),
step 04 (voice selection), step 06 (AI consent), and the revised
home screen (Reflection · Archetype · Conversation · My Day).

Demo credentials provided above.
```

## 10. Daily reflection + push notification generation

Notifications are reviewer-visible during App Review and must not read as horoscopes.

- Update the daily reflection generation prompt (used for both push notifications and the home screen `Reflection · Today` card) with the following guidance:

```
Voice: Jungian, philosophical, affirmational, present-tense,
second-person. 1–2 sentences for notifications. 2–4 sentences
for the home card.

Draw on archetypal language (Sovereign, Shadow, Seeker,
Caregiver, Lover, Warrior, Sage) and nature imagery (stillness,
ground, water, wind, seed, root, light).

FORBIDDEN words in output (never include, even if relevant to
the underlying input):
  horoscope, zodiac, sign, retrograde, aligned, lucky, fortune,
  oracle, prediction, destiny, fate, stars, Mercury, Venus, Mars,
  Jupiter, Saturn, Uranus, Neptune, Pluto, Aries, Taurus, Gemini,
  Cancer, Leo, Virgo, Libra, Scorpio, Sagittarius, Capricorn,
  Aquarius, Pisces.

The planetary/energy context is for internal seeding only. It
must not appear in the surface text. Translate any astrological
influence into archetypal or philosophical language instead
(e.g. "Saturn's weight" → "a call to structure"; "Mercury's
unrest" → "words moving faster than meaning").
```

- Add a **post-generation validator** that rejects and regenerates any notification or daily card whose output contains any word from the exclusion list.
- Do not send raw astrological data as strings that could surface in error states or logs.
- Update the in-app **notification permission pre-prompt** (shown before iOS's system dialog):

```
A daily reflection, if you'd like one.

Once a day, Symponia can send a short, centering thought
shaped by your archetype. Nothing else.

[ Yes, please ]   [ Not now ]
```

- Update the iOS system permission **reason string** (the one passed to `requestAuthorization` / configured in `Info.plist` where applicable) to:

```
Symponia would like to send you a daily reflection — a short,
centering thought for your morning.
```

## 11. Anthropic API cost controls

These changes are not required by Apple but will materially affect your unit economics on the £12.99/month plan. Without them, heavy users can cost more than they pay.

- **Split the models by use case.** Use `claude-sonnet-4-6` for the main chat, and `claude-haiku-4-5-20251001` for daily reflection card and push notification generation. Two separate call sites.

- **Cap `max_tokens` on every call:**
  - chat: `500`
  - daily reflection card: `200`
  - push notification: `80`

- **Trim conversation history before each chat request.** Keep only the last 20 messages in the `messages` array. Implement as `MAX_HISTORY_TURNS = 10` (10 user + 10 assistant).

- **Enable prompt caching on the static system prompt.** Split the `system` field into two text blocks:

```json
"system": [
  {
    "type": "text",
    "text": "<static Symponia voice, rules, forbidden-word list,
             Jungian guidance — identical across users and sessions>",
    "cache_control": {"type": "ephemeral"}
  },
  {
    "type": "text",
    "text": "<this user's archetype, shadow, name, voice
             preference — changes per user, not cached>"
  }
]
```

The static block must be at least ~1,024 tokens for Sonnet caching to activate. If the current system prompt is shorter, pad it with the voice/rules guidance from section 10 — that content is needed anyway.

- **Log usage per API call.** Every Anthropic response includes a `usage` object. Persist the following per exchange against the user's account: `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `model`, `timestamp`. This gives real per-user cost visibility and lets you confirm caching is actually hitting (high `cache_read_input_tokens` = working).

- **Verify current pricing at https://www.anthropic.com/pricing before locking plan margins.** Pricing has shifted over time and any cost estimates should be checked against the current rate card.

---

## Resolution Center reply (send after the new build is ready)

Paste this in App Store Connect Resolution Center when you resubmit. Attach a screen recording that walks through: the new onboarding (including the step 06 AI consent), the revised home screen, the paywall with subscription and pack options, and a sample daily reflection notification.

```
Hello,

Thank you for the detailed review. We've substantially addressed
all four guideline issues.

Guideline 4.3(b) — Saturated category
Symponia is not primarily an astrology, horoscope, or divination
app. Its core experience is an AI reflection companion built
around a Jungian archetype onboarding (users select a dominant
animal, five more, and a shadow animal — standard archetypal
psychology), which then shapes how the AI speaks with them in
one of three reflection voices (felt, precise, still). We have
repositioned the app:

  - The home screen now foregrounds Reflection · Archetype ·
    Conversation · My Day, with no Zodiac Compass or
    horoscope-style content.
  - All user-facing uses of "oracle" and "reading" have been
    replaced with "Symponia" and "reflection".
  - The daily reflection and push notification generator has
    an explicit forbidden-word list that prevents any
    astrological terms from appearing in surface text; planetary
    context is used only for internal seeding.
  - The App Store listing, screenshots, subtitle, and
    description have been rewritten to reflect the
    reflection/archetype positioning.

Notable screens for the reviewer: onboarding step 03 (archetype
selection, including the Jungian "shadow" step), step 04 (voice
selection), and the revised home screen.

Guideline 3.1.2(c) — Subscription information
The paywall now clearly displays, for the auto-renewable monthly
subscription: title, length, price, exactly what the user
receives (350 reflections per month, where a reflection is one exchange with Symponia), the
auto-renewal disclosure, the fact that unused reflections reset
at renewal, cancellation instructions, and tappable links to
Terms of Use and Privacy Policy. A Restore Purchases button is
visible. A functional link to the Terms of Use has been added
in App Store Connect.

Guideline 3.1.2(c) — Clear value for price
The paywall lists the specific benefits in plain language
(350 reflections per month, where a reflection is one
exchange with Symponia; all three reflection voices, daily
reflection, archetype + shadow reading).

Guidelines 5.1.1(i) / 5.1.2(i) — Data sharing with AI
Symponia uses Anthropic's Claude API as its AI backend. We have
added a dedicated onboarding step (06/06) that:

  - Names Anthropic explicitly
  - Discloses exactly what data is sent (user messages, chosen
    name, archetype)
  - Confirms, under Anthropic's standard API terms, the data
    is not used to train their models
  - Requires an explicit consent checkbox before the user can
    continue

We have also added a "Revoke AI consent" option in the profile
tab. The hosted Privacy Policy has been updated with a dedicated
"AI Processing" section that names Anthropic and lists the data
shared.

Screen recording attached. Demo credentials are provided in
App Review Information.

Thank you for your time.
```

---

## Checklist before resubmission

- [ ] `SENSE · ZODIAC` chat flow removed or fully rewritten (section 0.1)
- [ ] NUMEROLOGY section removed from profile/settings (section 0.2)
- [ ] Every `ZODIAC` label removed from the app (section 0.3)
- [ ] Every AI system prompt audited — no astrologer/oracle/numerologist personas (section 0.4)
- [ ] Home screen revised (tiles, labels, chat CTA)
- [ ] Profile/settings screen revised (section header, progress-bar copy, pack buttons, subscription disclosures)
- [ ] Global copy audit complete (reading → reflection, oracle → Symponia, token → reflection)
- [ ] Onboarding step 03 subtitle updated (soul → archetype)
- [ ] Splash tagline second line added
- [ ] Step 06/06 AI consent screen implemented and persisted
- [ ] Revoke consent option in profile tab
- [ ] Reflection counter visible on home/chat
- [ ] Soft paywall warm-up screen at 0 reflections
- [ ] Paywall screen compliant (all 3.1.2(c) fields, reset-at-renewal line, Restore Purchases, policy links)
- [ ] Daily reflection generator updated with voice + exclusion list
- [ ] Post-generation validator blocking forbidden words
- [ ] Notification permission pre-prompt + system reason string updated
- [ ] Hosted Privacy Policy updated with AI Processing section
- [ ] Both policy URLs return 200 on mobile
- [ ] symponia.io /credits page fixed (no "oracle") and sitewide copy aligned
- [ ] App Store Connect subtitle + description rewritten
- [ ] EULA link in description or custom EULA uploaded
- [ ] Screenshots replaced (6 new ones in the recommended order)
- [ ] Demo account credentials added to App Review Information
- [ ] Reviewer notes added to App Review Information
- [ ] Screen recording prepared
- [ ] Resolution Center reply ready to paste
