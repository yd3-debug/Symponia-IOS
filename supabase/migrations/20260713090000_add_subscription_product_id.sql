-- Record WHICH plan a subscriber is on.
--
-- profiles has always stored subscription_expires_at (that you are subscribed)
-- but never the product (what you are subscribed to). With a single monthly plan
-- that was fine — the app could safely hardcode "350 reflections per month".
-- With weekly + monthly it is not: Settings would tell a weekly subscriber their
-- plan "renews monthly".
--
-- Written server-side only, from Apple's signed productId (verify-receipt on
-- purchase/restore, apple-notification on renewal). The client only reads it.
-- Nullable: existing subscribers have no value until their next renewal, and the
-- app falls back to the monthly plan for them, which is what they are on.

alter table profiles
  add column if not exists subscription_product_id text;

comment on column profiles.subscription_product_id is
  'Apple productId of the active subscription (e.g. com.symponia.premium.weekly). Set by verify-receipt and apple-notification from Apple''s signed transaction. Null for legacy monthly subscribers who have not renewed since this column was added.';
