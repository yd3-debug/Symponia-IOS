# Symponia 1.0.5 — release pack

Everything here is ready to paste. Three sections:
1. **What's New** — the App Store release-notes field (user-facing).
2. **App Review notes** — the private field only the reviewer sees.
3. **Blockers** — what must be true before you hit Submit.

---

## 1. WHAT'S NEW  (paste into App Store Connect → "What's New in This Version")

Keep it plain. Apple rejects release notes that read like marketing, and users skim.

```
Symponia is now unlimited.

The old system of counted reflections is gone. One subscription, reflect as
often as you need — and seven days free to find out whether it's for you.

NINE LANGUAGES
Symponia now speaks English, Spanish, Portuguese, French, German, Italian,
Russian, Danish and Swedish — not translated, but written to read naturally
in each. Your daily reflection arrives in your language too.

HOW YOU'RE DOING, NOT HOW OFTEN YOU SHOW UP
A new check-in asks how you're feeling when you arrive, and again after you've
talked. Over a week you can see the difference between the two — the only
measure that actually answers whether this is helping.

SIGN IN WITH APPLE AND GOOGLE
No password to invent.

ALSO
· Your intake answers now shape how Symponia speaks to you from the first message.
· Symponia no longer ends a reflection vaguely, or by handing the work back to you.
· Settings has been reorganised, with a clear view of your usage.
```

If you want it shorter, keep the first paragraph, the languages, and the check-in.
Those are the three a user would actually notice.

---

## 2. APP REVIEW NOTES  (paste into the "Notes" field — reviewer only, not public)

This is the field that decides whether a human argues with you. Address the four
guidelines this app touches, before they have to ask.

```
SUBSCRIPTION (3.1.2)
Symponia Premium — £19.99/month, auto-renewing, with a 7-day free trial.
Price, billing period, auto-renewal and cancellation terms are shown adjacent
to the purchase button in Settings, and on the paywall shown after account
creation. Terms and Privacy are linked from both.

"UNLIMITED" AND FAIR USE (3.1.2)
The subscription is marketed as unlimited. A fair-use ceiling of 250 messages
per week and 60 in any 5-hour window protects the service from automated abuse.
These limits are published in our Terms at https://symponia.io/terms and are far
above normal reflective use. No user-facing counter presents this as a quota.

THIRD-PARTY AI (5.1.2(i))
Conversations are processed by Anthropic's Claude API. This is disclosed during
onboarding and the user must explicitly consent before any message is sent. If
consent is declined, no conversation data leaves the device. The disclosure is
repeated in our Privacy Policy.

SIGN IN WITH APPLE (4.8)
The app offers Google sign-in, and therefore also offers Sign in with Apple,
presented with equal prominence using Apple's own button component. Email/password
remains available. No third-party sign-in is required to use the app.

DATA AND MEMORY
Storing reflections for continuity ("memory") is OPT-IN and off by default. Mood
check-ins are optional and can be dismissed. All user data is row-level-secured
per account; a user can only ever read their own rows.

DEMO ACCOUNT
[ ADD A WORKING TEST ACCOUNT HERE — email + password ]
The reviewer will need one to get past the paywall. Also confirm the sandbox
subscription can be purchased in their test environment.

NOT A MEDICAL APP
Symponia is a reflective companion for self-understanding. It does not diagnose,
treat, or provide therapy, and says so. It has crisis-signal handling that
surfaces support resources rather than continuing the conversation.
```

**You must fill in the demo account.** A reviewer who hits a paywall with no way
through rejects on 2.1 without reading anything else.

---

## 3. BEFORE YOU HIT SUBMIT

These are not optional. The first two are automatic rejections.

- [ ] **symponia.io/terms is still wrong.** It advertises "£12.99 / 350 reflection
      sessions" — a product that no longer exists. A reviewer opens this link.
      This is a guaranteed 3.1.2 rejection. It must state £19.99/month, the 7-day
      trial, auto-renewal, cancellation, and the fair-use clause quoted above.

- [ ] **symponia.io/privacy is stale.** It doesn't mention mood check-ins, stored
      reflections (opt-in memory), intake answers, or that conversations are
      processed by Anthropic. 5.1.2(i) requires the last one. It also links to the
      wrong App Store id (6744058607 — should be 6760951504), and contradicts the
      Terms on age (Terms say 18+, Privacy references under-16).

- [ ] **Age rating → 17+.** Given the subject matter (shadow work, emotional
      content, unrestricted AI conversation), 17+ is the defensible answer.

- [ ] **App Privacy labels** must declare what the app now collects: mood data,
      conversation content, intake answers.

- [ ] **Demo account** in the review notes, tested.

- [ ] **Store localizations** — the listing is English (U.K.) only, while the app
      ships nine languages. Copy is ready in AppStore_Localization.md. Not a
      rejection risk; pure downside if you skip it.

---

## Known limitation, deliberately shipped

The archetype readings (Gift / Shadow / Path) are composed in the user's language
at runtime by the AI and cached on-device. On the very first view in a new
language they appear in English for a moment, then settle. Every failure path
returns English rather than an error — the worst case is exactly the old
behaviour. Nothing here is a reviewer concern; noted so you aren't surprised.
