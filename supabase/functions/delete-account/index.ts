// Symponia — Delete Account Edge Function
// Deploy: supabase functions deploy delete-account

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0?target=deno';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  // ── Decode user ID directly from JWT (gateway already verified it) ─────────
  let userId: string;
  try {
    const jwt = authHeader.replace('Bearer ', '');
    // JWT uses base64url — convert to standard base64 before decoding
    const base64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));
    userId = payload.sub;
    if (!userId) throw new Error('No sub in JWT');
  } catch (e) {
    console.error('JWT decode error:', e);
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  console.log('Deleting user:', userId);

  // ── Delete profile + conversation data ────────────────────────────────────
  const admin = createClient(supabaseUrl, serviceRoleKey);
  await admin.from('profiles').delete().eq('user_id', userId);
  await admin.from('conversations').delete().eq('user_id', userId);

  // ── Delete the auth user ──────────────────────────────────────────────────
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);

  if (deleteError) {
    console.error('deleteUser error:', JSON.stringify(deleteError));
    return new Response(JSON.stringify({ error: deleteError.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  console.log('User deleted successfully:', userId);
  return new Response(JSON.stringify({ success: true }), {
    status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
