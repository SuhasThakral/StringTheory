import { neon } from '@neondatabase/serverless';

const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;
const FROM_EMAIL   = process.env.FROM_EMAIL;
const RESEND_KEY   = process.env.RESEND_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, name, email, message } = req.body || {};

  if (!type || !email || !message) return res.status(400).json({ error: 'type, email, and message are required' });

  const sql = neon(process.env.DATABASE_URL);

  try {
    await sql`INSERT INTO contact_requests (name, email, type, message) VALUES (${name || null}, ${email.toLowerCase().trim()}, ${type}, ${message})`;

    if (type === 'deletion') {
      await sql`DELETE FROM timelines WHERE email = ${email.toLowerCase().trim()}`;
    }

    if (RESEND_KEY && NOTIFY_EMAIL && FROM_EMAIL) {
      const subject = type === 'deletion'
        ? `[STRING THEORY] Data deletion request from ${email}`
        : type === 'data_request'
        ? `[STRING THEORY] Data export request from ${email}`
        : `[STRING THEORY] Contact form: ${type} from ${email}`;

      const html = `
        <div style="font-family:monospace;background:#0a0a0f;color:#e8e8e0;padding:24px;max-width:560px;">
          <h2 style="color:#ffb800;letter-spacing:2px;margin-bottom:16px;">NEW ${type.toUpperCase()} REQUEST</h2>
          <table style="border-collapse:collapse;width:100%">
            <tr><td style="color:rgba(232,232,224,0.5);padding:6px 0;width:120px;">Type</td><td style="color:#e8e8e0;">${type}</td></tr>
            <tr><td style="color:rgba(232,232,224,0.5);padding:6px 0;">Name</td><td style="color:#e8e8e0;">${name || '—'}</td></tr>
            <tr><td style="color:rgba(232,232,224,0.5);padding:6px 0;">Email</td><td style="color:#00f0ff;">${email}</td></tr>
            ${type === 'deletion' ? '<tr><td colspan="2" style="color:#ff2222;padding-top:12px;">⚠ Timeline data has been automatically deleted.</td></tr>' : ''}
          </table>
          <div style="margin-top:20px;padding:16px;background:#16162a;border-left:3px solid #ffb800;">
            <p style="color:rgba(232,232,224,0.5);font-size:11px;margin-bottom:8px;">MESSAGE</p>
            <p style="color:#e8e8e0;line-height:1.6;">${message.replace(/\n/g, '<br>')}</p>
          </div>
          <p style="margin-top:16px;color:rgba(232,232,224,0.3);font-size:11px;">Received: ${new Date().toUTCString()}</p>
        </div>
      `;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM_EMAIL, to: NOTIFY_EMAIL, reply_to: email, subject, html }),
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
