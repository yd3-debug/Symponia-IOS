# Symponia 1.0.5 — what changed, and what the website must now say

Two kinds of item below. **Marketing** is what you *may* want to say. **Compliance** is what
the site *must* say, because the App Store cross-checks your store listing against your
public Terms and Privacy pages — and right now they contradict each other.

---

## COMPLIANCE — fix these before submitting

### 1. The pricing on symponia.io/terms is wrong and will get you rejected

The page currently says **£12.99 / 350 reflection sessions**. That product no longer exists.
Guideline 3.1.2 requires your public terms to match what you actually sell. A reviewer will
open this link. This is an automatic rejection.

It must now say:

- **£19.99 / month**, auto-renewing
- **7-day free trial**, then it auto-renews unless cancelled at least 24h before the trial ends
- Payment is charged to the Apple ID at confirmation of purchase
- The subscription renews automatically unless turned off at least 24h before the period ends
- Manage or cancel any time in the App Store account settings
- Links to Terms and Privacy (Apple requires both to be reachable from the paywall)

### 2. "Unlimited" needs a published fair-use clause

Symponia is marketed as unlimited. That word is only defensible if the limits are written
down somewhere public. Add a short, plain fair-use section:

> Symponia is unlimited for normal personal use. To protect the service from automated
> abuse, we apply a fair-use ceiling of **250 messages per week** and **60 messages in any
> 5-hour period**. These limits are far above what reflective use requires — most people
> will never encounter them.

Say it warmly, not defensively. The numbers are generous; leading with them is a strength.

### 3. The privacy policy is out of date

It doesn't mention things the app now collects. It must name:

- **Mood check-ins** — a 1–5 rating recorded before and after a session
- **Intake answers** — the questions asked during onboarding, stored to personalise the voice
- **Stored reflections** — only if the person opts in to memory; off by default
- **Third-party AI processing** — conversations are processed by Anthropic's Claude API.
  Apple guideline 5.1.2(i) requires this disclosure explicitly.

Also fix: the App Store download link points at the **wrong app id** (6744058607). It should
be **6760951504**. And Terms says 18+ while Privacy references under-16s — pick one. Given
the subject matter, **17+** is the right age rating and I'd set that in App Store Connect too.

---

## MARKETING — what's genuinely new and worth saying

### Pricing is now simple

Tokens are gone. There is no counting, no balance, no "sessions remaining." One price,
unlimited reflection, **7 days free** to see whether it's for you. This is the single biggest
change and the easiest to sell: the old model asked people to ration a thing they were
already reluctant to start.

### It speaks nine languages — natively

English, Spanish, Portuguese (Brazil), German, French, Italian, Russian, Danish, Swedish.

The important claim, and the true one: this is not machine translation bolted on. Every
screen, button, notification and the AI's own voice are written to read as though composed in
that language. If someone picks Danish, the daily reflection notification arrives in Danish.

### Mood check-in, and a week you can actually see

When you open Symponia it asks, simply, how you're feeling — five faces, one tap. It asks
again after you've talked.

Over a week this draws a small graph: a hollow ring for how you arrived, a filled dot for how
you left, and the bar between them is the lift. It's the only number in the product that
answers the question that actually matters — *is this helping me?*

Note for the copy: **this deliberately replaces a streak.** A streak measures obedience. This
measures whether the thing works. If you want a line for the site, that contrast is the line.

If there isn't enough data to say something honest, it says nothing rather than drawing a
confident trend through two points.

### The onboarding questions now mean something

The intake questions people answer before they begin are no longer decoration. They shape how
Symponia speaks to them from the first message — while never being quoted back at them.

### Sign in with Apple and Google

No password to invent, no password for us to store.

### The AI ends differently now

Symponia no longer ends a reflection vaguely, and no longer hands the work back with
"so what do you think that means for you?" It closes with something that holds. This applies
across all three voices.

### A cleaner Settings

Reorganised into: How you are (your mood week) · Your plan (usage) · You · Preferences ·
Privacy · Account. There's now a usage view, in the spirit of Claude's own — visible, honest,
never a threat.

---

## Suggested homepage line

> Unlimited reflection. Nine languages. Seven days free.
> And a small graph that tells you the truth about whether it's working.
