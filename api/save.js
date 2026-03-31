import { neon } from '@neondatabase/serverless';

function generateToken() {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let token = '';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  for (const b of bytes) token += chars[b % chars.length];
  return token;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, data, consent } = req.body || {};

  if (!email || !data) return res.status(400).json({ error: 'email and data required' });
  if (!consent) return res.status(400).json({ error: 'consent required' });

  const normalizedEmail = email.toLowerCase().trim();
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null;

  try {
    const sql = neon(process.env.DATABASE_URL);

    const existing = await sql`SELECT token FROM timelines WHERE email = ${normalizedEmail} LIMIT 1`;
    const token = existing.length > 0 && existing[0].token ? existing[0].token : generateToken();

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

    return res.status(200).json({ ok: true, token });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
