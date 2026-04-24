// Symponia — Stripe Webhook Edge Function
// Listens for completed Stripe Checkout sessions and adds tokens to the buyer's profile.
//
// Deploy: supabase functions deploy stripe-webhook
// Set secrets:
//   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
//
// In Stripe Dashboard → Webhooks → add endpoint:
//   https://<project-ref>.supabase.co/functions/v1/stripe-webhook
//   Events: checkout.session.completed

import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // service role to bypass RLS
);

// ── Token packages — must match your Stripe products ──────────────────────────
// Map Stripe price ID → how many tokens to grant
const PRICE_TOKENS: Record<string, number> = {
  // Fill these in from your Stripe Dashboard → Products
  // e.g. 'price_1Xxx...': 100,
  // e.g. 'price_1Yyy...': 300,
};

Deno.serve(async (req: Request) => {
  const sig = req.headers.get('stripe-signature');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, webhookSecret);
  } catch (err) {
    console.error('Webhook signature failed:', err);
    return new Response('Webhook signature verification failed', { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const email = session.customer_details?.email ?? session.customer_email;
    const priceId = session.line_items?.data?.[0]?.price?.id
      ?? (session as any).metadata?.price_id;

    if (!email) {
      console.error('No email in session', session.id);
      return new Response('No email', { status: 200 }); // 200 so Stripe doesn't retry
    }

    const tokensToAdd = PRICE_TOKENS[priceId ?? ''] ?? 100; // default 100 if price not mapped

    // Upsert profile: create if new, add tokens if existing
    const { error } = await supabase.rpc('add_tokens', {
      p_email: email,
      p_tokens: tokensToAdd,
    });

    if (error) {
      console.error('add_tokens failed:', error);
      return new Response('DB error', { status: 500 });
    }

    console.log(`+${tokensToAdd} tokens → ${email}`);
  }

  return new Response('ok', { status: 200 });
});
