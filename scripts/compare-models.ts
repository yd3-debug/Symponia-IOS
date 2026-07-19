// Blind A/B: does Haiku hold Symponia's voice, or does it go generic?
//
// Runs the REAL system prompt (supabase/functions/oracle/systemPrompt.ts) through
// Sonnet 4.6 and Haiku 4.5 on the same inputs, in the same three registers, and
// writes a side-by-side file where the models are labelled A and B — shuffled per
// question, so you cannot tell which is which while reading.
//
// That blindness is the whole point. If you know which one is Haiku you will find
// reasons to be disappointed in it. Read all of them, mark the ones that land,
// THEN look at the key at the bottom.
//
// RUN:
//   export ANTHROPIC_API_KEY=sk-ant-...        (same key as your Supabase secret)
//   deno run --allow-net --allow-read --allow-write --allow-env scripts/compare-models.ts
//
// Costs about $0.15 to run.

import { buildSystemPromptParts } from '../supabase/functions/oracle/systemPrompt.ts';

const KEY = Deno.env.get('ANTHROPIC_API_KEY');
if (!KEY) {
  console.error('Set ANTHROPIC_API_KEY first.  export ANTHROPIC_API_KEY=sk-ant-...');
  Deno.exit(1);
}

const SONNET = 'claude-sonnet-4-6';
const HAIKU = 'claude-haiku-4-5-20251001';

// A real profile. Seven animals, shadow last.
const ANIMALS = ['Wolf', 'Owl', 'Otter', 'Deer', 'Crow', 'Whale', 'Spider'];
const NAME = 'Yekta';
const GENDER = 'he/him';

// The cases that actually matter — where a weaker model goes limp and starts
// sounding like a wellness poster. Includes the three registers and a non-English
// turn, since the app now ships in 9 languages.
const CASES: { label: string; freq: string; lang: string; msg: string }[] = [
  {
    label: 'Shadow work — the hard one',
    freq: 'Intellectual', lang: 'en',
    msg: "I keep sabotaging things right when they start going well. I did it again last week with someone I actually liked. I don't understand why I do this.",
  },
  {
    label: 'Restraint — will it resist advice-giving?',
    freq: 'Quiet', lang: 'en',
    msg: "I don't really want to talk. I just feel flat. Nothing is wrong exactly.",
  },
  {
    label: 'Emotional register — imagery without cliché',
    freq: 'Deeply Emotional', lang: 'en',
    msg: 'My father died in March and I still have not cried. Everyone keeps telling me that is normal and I want to scream at them.',
  },
  {
    label: 'Projection — will it flatter or confront?',
    freq: 'Intellectual', lang: 'en',
    msg: 'My colleague is arrogant and it drives me insane. Everyone else seems fine with him.',
  },
  {
    label: 'German — does depth survive translation?',
    freq: 'Deeply Emotional', lang: 'de',
    msg: 'Ich habe das Gefühl, dass ich mein ganzes Leben lang eine Rolle spiele und niemand den echten Menschen darunter kennt.',
  },
  {
    label: 'Russian — same test, harder language',
    freq: 'Intellectual', lang: 'ru',
    msg: 'Я боюсь, что если я перестану всё контролировать, всё развалится. Но контроль меня истощает.',
  },
];

const LANG_NAMES: Record<string, string> = { en: 'English', de: 'German', ru: 'Russian' };

async function ask(model: string, freq: string, lang: string, msg: string): Promise<string> {
  const { staticText, dynamicText } = buildSystemPromptParts(freq, 'oracle', NAME, GENDER, ANIMALS);
  const rule = lang === 'en' ? '' :
    `\n\n═══ LANGUAGE ═══\nWrite your entire response in ${LANG_NAMES[lang]}, and only in ${LANG_NAMES[lang]}. Keep exactly the same depth, nuance and register you would have in English.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 750,
      system: [
        { type: 'text', text: staticText },
        { type: 'text', text: dynamicText + rule },
      ],
      messages: [{ role: 'user', content: msg }],
    }),
  });
  if (!res.ok) return `[ERROR ${res.status}] ${await res.text()}`;
  const j = await res.json();
  return (j.content?.[0]?.text ?? '').trim();
}

const out: string[] = [
  '# Sonnet vs Haiku — blind comparison',
  '',
  'For each case, one of A/B is Sonnet 4.6 and the other is Haiku 4.5.',
  '**The order is shuffled every time.** Read all of them first. Mark which landed.',
  'The key is at the bottom — do not scroll to it early.',
  '',
  'What you are looking for: does it hold the register, resist giving advice,',
  'sit with the discomfort instead of resolving it, and avoid sounding like a',
  'wellness poster? Fluency is not the test. Depth is.',
  '',
];
const key: string[] = [];

for (const c of CASES) {
  console.log(`running: ${c.label} ...`);
  const [a, b] = await Promise.all([
    ask(SONNET, c.freq, c.lang, c.msg),
    ask(HAIKU, c.freq, c.lang, c.msg),
  ]);
  const flip = Math.random() < 0.5;             // hide which is which
  const [first, second] = flip ? [b, a] : [a, b];
  key.push(`- **${c.label}** — A = ${flip ? 'HAIKU' : 'SONNET'}, B = ${flip ? 'SONNET' : 'HAIKU'}`);

  out.push(`---\n\n## ${c.label}`, `*register: ${c.freq} · language: ${c.lang}*`, '',
    `> ${c.msg}`, '', '### A', '', first, '', '### B', '', second, '');
}

out.push('---', '', '## Key (read only after you have judged them)', '', ...key);
await Deno.writeTextFile('MODEL_COMPARISON.md', out.join('\n'));
console.log('\nWrote MODEL_COMPARISON.md — read it before looking at the key.');
