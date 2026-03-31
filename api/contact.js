import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'edge' };

const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;   // your real inbox
const FROM_EMAIL   = process.env.FROM_EMAIL;      // e.g. noreply@dystopic.co (Resend verified domain)
const RESEND_KEY   = process.env.RESEND_API_KEY;

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

  const { type, name, email, message } = body;
  if (!type || !email || !message) {
    return new Response(JSON.stringify({ error: 'type, email, and message are required' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    // 1. Save request to DB
    await sql`
      INSERT INTO contact_requests (name, email, type, message)
      VALUES (${name || null}, ${email.toLowerCase().trim()}, ${type}, ${message})
    `;

    // 2. If deletion request — auto-delete timeline immediately
    if (type === 'deletion') {
      await sql`DELETE FROM timelines WHERE email = ${email.toLowerCase().trim()}`;
    }

    // 3. Notify you via Resend
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
          <p style="margin-top:16px;color:rgba(232,232,224,0.3);font-size:11px;">
            Received: ${new Date().toUTCString()}<br>
            Reply directly to this email to respond to the user.
          </p>
        </div>
      `;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: NOTIFY_EMAIL,
          reply_to: email,
          subject,
          html,
        }),
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
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
