-- The intake answers. Nine questions, and until now they went nowhere.
--
-- Onboarding asks the person the sharpest questions in the whole product — the
-- trait that irritates them most in others, the version of themselves they keep
-- hidden — writes the answers to the device, and then nothing ever reads them.
-- Not the oracle, not the system prompt, not this database. The most revealing
-- thing we know about a person, offered before they have said a single word,
-- was being thrown away.
--
-- Stored as the resolved English question/answer text (not indices), so the
-- server needs no copy of the question bank and nothing breaks if the wording of
-- a question is ever edited.
--
--   [{ "q": "the trait that irritates you most in others is usually—",
--      "a": ["one I quietly carry too", "one I secretly wish I had"] }, ...]

alter table profiles
  add column if not exists attune jsonb;

comment on column profiles.attune is
  'Onboarding intake answers as [{q, a[]}] in English source text. Injected into the oracle system prompt (dynamic block) so the first reply already knows the person. Multi-select: `a` may hold more than one answer, and the combination is often more revealing than any single choice.';
