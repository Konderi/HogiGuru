/** Sähköposti Resendin kautta (https://resend.com). Avain: `wrangler secret put RESEND_API_KEY`. */
export interface MailEnv { DB: D1Database; RESEND_API_KEY?: string; MAIL_FROM?: string }

export const SITE = 'https://guru.konderi.fi';
const DEFAULT_FROM = 'HogiGuru <no-reply@konderi.fi>';

export async function sendMail(env: MailEnv, kind: string, to: string, subject: string, html: string, unsubUrl?: string): Promise<boolean> {
  let ok = false; let error: string | null = null;
  try {
    if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY puuttuu');
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.MAIL_FROM || DEFAULT_FROM, to: [to], subject, html,
        ...(unsubUrl ? { headers: { 'List-Unsubscribe': `<${unsubUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {}),
      }),
    });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
    ok = true;
  } catch (e) { error = (e as Error).message; }
  await env.DB.prepare('INSERT INTO mail_log (kind, recipient, subject, ok, error) VALUES (?,?,?,?,?)').bind(kind, to, subject, ok ? 1 : 0, error).run();
  return ok;
}

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Yhteinen HTML-pohja (tumma, kiekkoteema, toimii sähköpostiohjelmissa). */
export function layout(title: string, body: string, unsubUrl?: string): string {
  return `<!doctype html><html lang="fi"><body style="margin:0;background:#060b18;font-family:Arial,Helvetica,sans-serif;color:#cbd5e1">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#060b18"><tr><td align="center" style="padding:24px 12px">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#0d1628;border:1px solid #1e2a44;border-radius:16px">
<tr><td style="padding:24px 28px;border-bottom:1px solid #1e2a44">
<div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#7dd3fc">HogiGuru</div>
<div style="font-size:24px;font-weight:bold;color:#ffffff;margin-top:4px">${esc(title)}</div></td></tr>
<tr><td style="padding:20px 28px;font-size:15px;line-height:1.5">${body}</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #1e2a44;font-size:12px;color:#64748b">
<a href="${SITE}" style="color:#7dd3fc">guru.konderi.fi</a>${unsubUrl ? ` · <a href="${unsubUrl}" style="color:#64748b">Peru nämä viestit</a>` : ''}</td></tr>
</table></td></tr></table></body></html>`;
}

export function table(rows: string[][], align: ('left' | 'right')[] = []): string {
  return `<table width="100%" cellpadding="6" cellspacing="0" style="border-collapse:collapse;margin:8px 0 16px">${rows.map((r) =>
    `<tr>${r.map((c, i) => `<td style="border-bottom:1px solid #1e2a44;text-align:${align[i] ?? 'left'};color:${i === 0 ? '#ffffff' : '#cbd5e1'}">${c}</td>`).join('')}</tr>`).join('')}</table>`;
}
export const h2 = (s: string) => `<div style="font-size:13px;letter-spacing:1.5px;text-transform:uppercase;color:#7dd3fc;margin-top:18px">${esc(s)}</div>`;
export const fmt = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1).replace('.', ',')}`;

/** Peruutustunniste käyttäjälle (luodaan tarvittaessa). */
export async function unsubToken(db: D1Database, userId: number): Promise<string> {
  const r = await db.prepare('SELECT unsub_token FROM users WHERE id = ?').bind(userId).first<{ unsub_token: string | null }>();
  if (r?.unsub_token) return r.unsub_token;
  const t = crypto.randomUUID().replace(/-/g, '');
  await db.prepare('UPDATE users SET unsub_token = ? WHERE id = ?').bind(t, userId).run();
  return t;
}
