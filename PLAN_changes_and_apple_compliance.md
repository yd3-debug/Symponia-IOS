# Symponia: what to change or add next, plus Apple compliance

_Combines the daily-use and shadow-work research with a check of Apple's current App Store Review Guidelines (including the November 2025 third-party AI rules). Priorities are P0 (do before the next submission), P1 (soon, high value), P2 (later)._

## The single most important thing you have not raised: crisis safety

This is both an Apple risk and an ethical one, and the research made it sharper. Depth work and shadow work can destabilize people, and Apple plus the APA now expect any app in the mental-wellness space to handle crisis signals. Right now Symponia has no self-harm or crisis detection. If a user writes "I want to hurt myself," the AI should not just reflect on it. This is a P0.

**P0. Crisis and self-harm safety flow.**
- Detect crisis signals (suicidal ideation, self-harm, "I want to cut myself," not just the word "suicide") on the server before or alongside the AI reply.
- On detection, show a clear, caring interstitial with clickable human resources: Samaritans 116 123 in the UK, 988 in the US, and a "find help near you" link, plus a gentle line and the option to keep going or reach out.
- Tell the model, in the system prompt, to never encourage self-harm, never validate delusional or harmful thinking, reduce sycophancy, and to steer toward support. Claude already refuses the worst, but the app should own the routing.
- This protects real users, satisfies Apple's greater scrutiny of health-adjacent apps, and makes the "go deep" shadow work feature safe to promote.

## Apple compliance check (so we do not hit a wall)

**P0. Third-party AI consent wording (new Apple rule, 13 Nov 2025).** Apple now treats sharing data with third-party AI as a regulated category. You must clearly disclose that personal data goes to a third-party AI and get explicit permission before sending, and broad or vague consent is not enough. You already have the AI consent screen naming Anthropic's Claude and an explicit toggle, which is ahead of most apps. Action: make sure the consent names Anthropic by name, says exactly what is sent, is obtained before any message is sent (it is, via the consent gate), and is reflected in your App Privacy answers. Low effort, just verify and tighten wording.

**P0. Age rating.** Apple says to set the rating based on how often the AI can generate sensitive content. A free-form AI that goes into emotional depth and shadow work should almost certainly be 17+ (or the equivalent new band). Shipping a low rating with this kind of AI is a common rejection and a removal risk. Action: review and likely raise the age rating in App Store Connect.

**P1. Not therapy, not medical advice disclaimer.** Guideline 1.4.1 wants health-adjacent apps to remind users to consult a professional and not present as treatment. Keep positioning as reflection and self-understanding, never as therapy or a cure. Add one explicit line in onboarding or settings: "Symponia is a space for reflection, not therapy or medical advice. If you are struggling, please reach out to a professional." You already say "not therapy" in copy; make it an explicit disclaimer too.

**P1. Do not over-claim clinical benefit in copy.** Avoid words like "heal your trauma," "treat anxiety," or "clinically proven." They invite both the medical-app scrutiny and a false-advertising angle. Keep the benefit language experiential (understand yourself, feel heard, come back to yourself).

**P2. Sign in with Apple.** Only when you add the Google sign-in we deferred. Guideline 4.8 requires offering Sign in with Apple alongside any third-party social login. Build both together or review will reject it.

**Already compliant, keep as is:** account deletion (you have the delete-account flow), subscriptions through in-app purchase, privacy policy, submitting under a company (Boroto ltd, not an individual, which matters for health-adjacent apps), and Anthropic Zero Data Retention.

## Product changes and additions, from the research

**P1. Build memory. This is the biggest lever.** The number one retention and monetization feature in the whole category is an AI that visibly gets to know you over time. Concretely for Symponia: resurface a relevant past reflection ("a few weeks ago you kept circling this same feeling, how is it now"), track evolving themes tied to a person's animals, and give a short weekly pattern insight. This directly fixes the "outgrown in 2-3 months" churn and is a natural paid-tier feature. Note: this increases how much personal data is stored, so it must be covered by the privacy policy and consent, and ideally encrypted.

**P1. Make the daily reflection a real ritual, with no guilt.** A soft morning anchor plus the evening reflection, a streak that never punishes a missed day (Finch's model, the top retention outlier), the pre-permission notification step we already planned, one sparing daily reminder, and an iOS widget so Symponia has a quiet daily presence.

**P1. Add a gentle inner-child on-ramp to shadow work.** Shadow work is mainstream now (roughly 2.3 billion TikTok views, a million-selling journal), and it is a real search and interest driver, so lean in, but keep it gentle. Route beginners through inner-child prompts, reframe the shadow as hidden strengths not only flaws, and keep the heavier depth behind the "deep and philosophical" tone the user opts into. Your "meet your shadow, gently" is already the right frame.

**P1. Make anti-generic your loud positioning.** The category's number one complaint is that responses feel generic and interchangeable. Your archetype personalization, three distinct voices, and the "name something specific they said" rule are a direct cure. Say it in the store copy: reflections shaped by your own archetype, not the same advice any chatbot gives.

**P1. Make privacy a headline, not a footnote.** Users now actively check whether apps train AI on their journals. Anthropic Zero Data Retention means their reflections are not stored after the reply and never used to train. State it plainly: private by design, never used to train AI. This answers the sharpest trust objection in the category and doubles as a compliance strength.

**P2. Tone and persona control is a differentiator, keep and surface it.** Users explicitly ask to switch how the AI talks to them (gentle versus direct). You already have warm and plain, deep and philosophical, direct and practical. Make it visible and easy to change, and mention it in marketing.

**P2. Pair depth with grounding.** After an intense reflection, offer a small grounding or self-care nudge. This supports wellbeing and reinforces the safety posture Apple looks for.

## Suggested order

1. P0 crisis safety flow, age rating, and verify the AI-consent wording. These unblock a clean submission.
2. P1 memory feature and the daily ritual with a no-guilt streak. These win daily use and retention.
3. P1 inner-child shadow path, anti-generic and privacy positioning in the store copy.
4. P2 tone visibility, grounding nudges, and Sign in with Apple when Google login lands.

## Sources
Apple guidelines and AI rules: developer.apple.com/app-store/review/guidelines, openforge.io App Store 2025 AI rules, dev.to Guideline 5.1.2(i) third-party AI data sharing, techrepublic.com Apple AI data-sharing update, blog.dashsdk.com health app requirements, developer.apple.com App Privacy Details.
Crisis and mental-health safety expectations: apa.org health advisory on AI chatbots and wellness apps (2025), news.harvard.edu emotional wellness apps, jedfoundation.org response to APA advisory, cyberbullying.org teen safety blueprint.
