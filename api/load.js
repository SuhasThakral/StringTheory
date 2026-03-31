import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { token, email } = req.query;

  if (!token && !email) return res.status(400).json({ error: 'token or email required' });

  try {
    const sql = neon(process.env.DATABASE_URL);

    const rows = token
      ? await sql`SELECT data, updated_at FROM timelines WHERE token = ${token} LIMIT 1`
      : await sql`SELECT data, updated_at FROM timelines WHERE email = ${email.toLowerCase().trim()} LIMIT 1`;

    if (rows.length === 0) return res.status(200).json({ found: false });
    return res.status(200).json({ found: true, data: rows[0].data, updated_at: rows[0].updated_at });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
