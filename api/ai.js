export const config = { runtime: 'edge' };

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// In-memory rate limit store (per edge instance, resets on cold start — good enough)
const rateLimitMap = new Map();
const RATE_LIMIT = 10;       // max requests
const RATE_WINDOW = 60000;   // per 60 seconds

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > RATE_WINDOW) {
    rateLimitMap.set(ip, { count: 1, start: now });
    return false;
  }
  if (entry.count >= RATE_LIMIT) return true;
  entry.count++;
  rateLimitMap.set(ip, entry);
  return false;
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(ip)) {
    return new Response(JSON.stringify({ error: 'Too many requests — please wait a moment' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { messages, model, max_tokens, temperature, stream } = body;

  if (!messages || !Array.isArray(messages)) {
    return new Response('Missing messages', { status: 400 });
  }

  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return new Response('API not configured', { status: 503 });
  }

  try {
    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: model || 'openai/gpt-oss-120b',
        messages,
        max_tokens: max_tokens || 1200,
        temperature: temperature ?? 0.4,
        stream: stream || false,
      }),
    });

    if (!groqRes.ok) {
      const data = await groqRes.json();
      return new Response(JSON.stringify({ error: data.error || 'Groq error' }), {
        status: groqRes.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    // Streaming: pipe SSE directly back to client
    if (stream) {
      return new Response(groqRes.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          ...corsHeaders(),
        },
      });
    }

    const data = await groqRes.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
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
