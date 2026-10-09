# Marketing Symponia: one person, no face

Draft, 2026-10-09. To run after the new app is live. Nothing here has been
tested yet; every channel below is a bet to be measured, not a promise.

## Where things stand

- App Store, 8 July to 5 October 2026: 730 impressions, 54 product page views,
  13 first-time downloads. About eight people a day see the app at all.
- Website, one week in October: 8 visitors, half from Google search.
- So the first job is to be seen. Conversion comes second.

## The one idea

**"Pick the animal you can't stand. That's the part of you you buried."**

It is a hook, a method and a product demo in one line, and nobody else can say
it. Everything below is that sentence in a different format.

Who it is for: people already searching for shadow work, inner child work and
"why do I react like this" (the research in
`RESEARCH_daily_use_and_shadow_work.md` puts the core audience at Gen Z and
young millennial women who are therapy-curious).

What it is not: therapy, a cure, or a personality test. Never claim healing or
clinical benefit; it invites App Store trouble and it is not true.

## The faces: the cloud and the animals

Yekta stays off camera. The cloud is the presenter and the animals are the
subject. Both already exist as artwork, in one style, which most small apps
cannot say.

## The engine: a free test on the website

`symponia.io/test`: choose seven animals, get a short reading of the seventh,
then "hear the rest in the app". It is the bridge between every piece of
content and the App Store, it is shareable, and the site already targets
"shadow self test".

- Ends with a share card: "My seventh animal is the crow."
- Counts as its own conversion in Google Analytics, next to `app_store_click`.
- Needs: the picker (being built for the app anyway) and one short AI reading
  per completed test, rate-limited so it cannot be abused.

## Three kinds of content

1. **One animal, one truth** (short video, 15 to 25 seconds).
   The realistic drawing, the cloud's voice, three lines: what this animal
   gives you, what it costs you, what it is asking. 54 animals, already
   written in `constants/systemPrompt.ts`. Ends: "Which one can't you stand?"
2. **The seventh animal** (short video or carousel).
   "If the animal you can't stand is the snake..." One per animal. This is the
   format people argue with in the comments, which is what spreads it.
3. **The cloud asks** (one line, daily).
   The day's question as a still of the cloud on paper. Cheap, consistent,
   and it is the same question the app asks that day.

One recording of the product itself each week: a real 20-second exchange with
the cloud, screen-recorded. Proof that the app does what the content says.

## Where

| Channel | Why | Cadence to start |
|---|---|---|
| TikTok and Instagram Reels | Where shadow work content already lives | 4 short videos a week |
| Pinterest | Slow, long-lived search traffic for exactly these topics | The same pieces as pins, linking to the test |
| The website guide | Already 15 articles; add one page per animal | 54 pages, generated from existing text, reviewed |
| App Store listing | New screenshots, the cloud and an animal on the first one | Once, at launch; then test |
| Apple Search Ads | Only on exact terms like "shadow work app" | A small fixed budget, after the listing converts |

Not at the start: paid social, influencers, a newsletter, Reddit promotion.

## What it takes each week

- Batch once a week. Artwork from the existing set, voice from the same
  ElevenLabs voice as the app, assembled with HyperFrames or Higgsfield,
  scheduled through Blotato.
- The unused marketing dashboard (`symponia-marketing-v2`) can draft captions;
  a person still reads every post before it goes out.

## What to measure

| Step | Number | Where |
|---|---|---|
| Seen | Video views, pin impressions | Each platform |
| Curious | Visits to the test | Google Analytics |
| Tried | Tests completed | Google Analytics (new event) |
| Wanted it | `app_store_click` | Google Analytics, already set up |
| Got it | Downloads, product page conversion | App Store Connect |
| Stayed | Day 1 and day 7 return, first session finished | In-app analytics (to be added) |
| Paid | Trial starts, subscriptions | App Store Connect |

Review every two weeks. Keep the format that moves the test number; drop the
rest.

## Things to settle first

- Rights: the realistic animals and the cloud were generated in Higgsfield.
  Check its terms allow commercial use in an app and in advertising.
- The claims list: what the copy may and may not say (not therapy, no
  healing claims), agreed once and reused.
- A phobia note: realistic spiders and snakes in an autoplaying feed will make
  some people scroll away, and may be limited by ad policies. Lead with the
  wolf, the owl and the fox; let the hard animals appear inside the piece.
- Budget: none assumed here beyond the tools already paid for.
