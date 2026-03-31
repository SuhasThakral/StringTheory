import { neon } from '@neondatabase/serverless';

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url   = new URL(req.url);
  const token = url.searchParams.get('token');
  const email = url.searchParams.get('email');

  if (!token && !email) {
    return new Response(JSON.stringify({ error: 'token or email required' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);

    const rows = token
      ? await sql`SELECT data, updated_at FROM timelines WHERE token = ${token} LIMIT 1`
      : await sql`SELECT data, updated_at FROM timelines WHERE email = ${email.toLowerCase().trim()} LIMIT 1`;

    if (rows.length === 0) {
      return new Response(JSON.stringify({ found: false }), {
        status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      });
    }
    return new Response(JSON.stringify({ found: true, data: rows[0].data, updated_at: rows[0].updated_at }), {
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
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
