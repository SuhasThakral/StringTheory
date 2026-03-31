import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'edge' };

function generateToken() {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let token = '';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  for (const b of bytes) token += chars[b % chars.length];
  return token;
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body;
  try { body = await req.json(); } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { email, data, consent } = body;
  if (!email || !data) {
    return new Response(JSON.stringify({ error: 'email and data required' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });
  }
  if (!consent) {
    return new Response(JSON.stringify({ error: 'consent required' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

  try {
    const sql = neon(process.env.DATABASE_URL);

    // Check if a token already exists for this email — reuse it
    const existing = await sql`
      SELECT token FROM timelines WHERE email = ${normalizedEmail} LIMIT 1
    `;
    const token = existing.length > 0 && existing[0].token
      ? existing[0].token
      : generateToken();

    await sql`
      INSERT INTO timelines (email, data, updated_at, consent_at, consent_ip, token)
      VALUES (${normalizedEmail}, ${JSON.stringify(data)}, now(), now(), ${ip}, ${token})
      ON CONFLICT (email)
      DO UPDATE SET
        data       = ${JSON.stringify(data)},
        updated_at = now(),
        token      = COALESCE(timelines.token, ${token}),
        consent_at = COALESCE(timelines.consent_at, now()),
        consent_ip = COALESCE(timelines.consent_ip, ${ip})
    `;

    return new Response(JSON.stringify({ ok: true, token }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
