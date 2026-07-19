# Symponia — Security Review

_Project: `jrwvjezpmexsewoicomz` (Supabase, eu-west-1). Reviewed June 30, 2026._

> **STATUS — APPLIED & VERIFIED (June 30, 2026).** Findings 1–4 and 6 are fixed on the live database via `security_fix.sql` and confirmed: the guard trigger blocks token tampering (tested — a 5,000-token self-grant was rejected), `add_tokens`/`handle_new_user` are now service-role-only, and anon's write grants are removed. Security advisors are clean except the two intentional items below. **Remaining (manual):** Finding 7 — enable leaked-password protection in the Auth dashboard. Finding 5 (atomic token decrement) is optional hardening.

## Bottom line

The architecture is fundamentally sound: Row Level Security is on for every table, users can only read their own rows, no secrets ship in the app, and the AI proxy authenticates and meters every call server-side. **Two real holes let a user mint themselves unlimited tokens and bypass the paywall.** Both are fixable with a short SQL script that does **not** break the currently-shipped build. Details below.

---

## What's already solid

- **RLS is enabled on all 7 tables.** `profiles`, `conversations`, `api_usage` carry correct own-row policies (`auth.uid() = user_id`), so one user can never read or modify another user's data. The four log / rate-limit tables (`account_deletion_log`, `apple_webhook_log`, `generation_jobs`, `rate_limit_daily_reflection`) have RLS on with **no** client policy — meaning deny-all to the app; only the service role touches them. That's correct, not a gap.
- **No secrets in the client.** The Anthropic key, Supabase service-role key, Stripe keys and Apple shared secret are all read from server-side Edge Function environment variables. Only the public `anon` key ships in the app, which is by design and safe **as long as RLS holds** (it does).
- **The AI proxy (`oracle`) is well-built.** Even though gateway `verify_jwt` is off, the function validates the caller's JWT itself (`auth.getUser`), refuses anyone without `ai_consent = true`, enforces a model allowlist, caps `max_tokens` (750), message count (25) and payload size (50 KB), checks the token balance, and deducts server-side. The client-side token counter is display-only — the server is the real gate. An outsider cannot use your Anthropic key.
- **Other functions are gated correctly.** `verify-receipt` and `delete-account` require a JWT; `apple-notification` is an Apple-to-server webhook (correctly not JWT-gated).

---

## Findings (ranked)

### 🔴 HIGH 1 — A signed-in user can give themselves unlimited tokens
`authenticated` holds table-wide `UPDATE` on `public.profiles`, and the RLS update policy allows editing your own row with **no column restriction**. So any logged-in user can, with just the public anon key, send:

```
PATCH /rest/v1/profiles?user_id=eq.<their-own-id>
{ "topup_tokens": 999999 }
```

and grant themselves unlimited reflections — or set `subscription_expires_at` to fake a subscription. Exploitable on the live app today. The oracle reads exactly these columns, so this fully defeats the paywall.

### 🔴 HIGH 2 — `add_tokens()` can be called by anyone, even logged-out
The `add_tokens(uuid,int)` and `add_tokens(text,int)` functions are `SECURITY DEFINER` and have `EXECUTE` granted to `anon`. Anyone with the public anon key can hit `/rest/v1/rpc/add_tokens` (no account needed) and add tokens to any user by id or email. (It writes the legacy `tokens` column, which the current oracle no longer reads, so today the paywall impact is blunted — but it still lets an outsider write arbitrary profile rows and is clearly unintended.)

### 🟠 MEDIUM 3 — Over-permissive base grants to `anon` on `profiles`
`anon` has `INSERT / UPDATE / DELETE / SELECT` grants on `profiles`. RLS currently blocks anon (no matching policy), so it's not live-exploitable, but the grants shouldn't exist — you're one loose policy away from exposure.

### 🟠 MEDIUM 4 — Trigger function callable as an RPC
`handle_new_user()` has `EXECUTE` for `anon` / `authenticated`. It's meant to fire as a signup trigger, not be invoked directly. Low impact, but revoke it.

### 🟡 LOW 5 — Token-deduction race in `oracle`
The balance is read, then decremented "fire-and-forget" (non-atomic). A user firing several requests at once with balance = 1 could squeeze a few extra calls before the decrement lands. Recommend an atomic conditional decrement (deduct in one `UPDATE … WHERE balance > 0 RETURNING`, reject if no row).

### 🟡 LOW 6 — `search_path` not pinned on SECURITY DEFINER functions
`add_tokens`, `set_updated_at` have mutable `search_path`. Pin to `''`. (Best practice; matters most for definer functions.)

### 🟡 LOW 7 — Leaked-password protection disabled
Supabase Auth can reject passwords found in HaveIBeenPwned breaches. It's off. Enable it in **Dashboard → Authentication → Policies** (one toggle).

### ℹ️ INFO 8 — "RLS enabled, no policy" on 4 tables
Intentional and secure (service-role-only tables). No action needed.

---

## Recommended fix

Apply `security_fix.sql` (in this folder). It is written to be **non-breaking for the live build**:

- Instead of revoking the column grant (which would break the shipped app's profile upsert), it adds a `BEFORE UPDATE` guard trigger that silently reverts any change to the protected columns (`tokens`, `subscription_tokens`, `topup_tokens`, `subscription_expires_at`, `original_transaction_id`, `tokens_reset_at`) unless the caller is the `service_role`. The app keeps saving name / gender / animals normally; token columns become untouchable from the client.
- Revokes `EXECUTE` on `add_tokens` and `handle_new_user` from `anon` / `authenticated`.
- Revokes anon's write grants on `profiles`.
- Pins `search_path` on the definer functions.

Leaked-password protection (Finding 7) and the optional atomic-decrement hardening (Finding 5) are noted in the script as manual follow-ups.

Run it in **Supabase → SQL Editor** (matches your usual workflow), or I can apply it for you on your say-so.
