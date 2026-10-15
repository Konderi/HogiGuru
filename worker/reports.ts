import { computeLeaderboard, helsinkiDate, type Season } from './data';
import { esc, fmt, h2, layout, sendMail, SITE, table, unsubToken, type MailEnv } from './mail';
import { addDays, mondayOf, weeklyReview } from './weekly';

const POS: Record<string, string> = { F: 'H', D: 'P', G: 'MV', C: 'V' };

/** Maanantain viikkokatsaus kaikille guruille (edellinen ma–su). Ei lähetä samaa viikkoa kahdesti. */
export async function sendWeeklyReport(env: MailEnv, season: Season, opts: { onlyTo?: string } = {}) {
  const db = env.DB;
  const monday = addDays(mondayOf(helsinkiDate()), -7);
  const kind = `weekly:${monday}`;
  const w = await weeklyReview(db, season, monday);
  const lb = await computeLeaderboard(db, season);
  const recipients = (await db.prepare(
    `SELECT g.id AS guru_id, u.id AS user_id, u.email, u.email_prefs FROM gurus g JOIN users u ON u.id = g.user_id
     WHERE g.season_id = ? AND u.active = 1`,
  ).bind(season.id).all<{ guru_id: number; user_id: number; email: string; email_prefs: string }>()).results
    .filter((r) => (opts.onlyTo ? r.email.toLowerCase() === opts.onlyTo.toLowerCase() : (JSON.parse(r.email_prefs || '{}').weekly ?? true)));
  const sent = new Set((await db.prepare('SELECT recipient FROM mail_log WHERE kind = ? AND ok = 1').bind(kind).all<{ recipient: string }>()).results.map((r) => r.recipient));

  const common = [
    h2('Viikon parhaat gurut'),
    table(w.gurus.slice(0, 5).map((g, i) => [`${i + 1}. ${esc(g.name)}`, fmt(g.points)]), ['left', 'right']),
    h2('Viikon tähdet'),
    table([
      ...([['Hyökkääjä', w.topF[0]], ['Puolustaja', w.topD[0]], ['Maalivahti', w.topG[0]]] as const)
        .filter(([, p]) => p).map(([l, p]) => [`${l}: ${esc(p!.name)} <span style="color:#64748b">${esc(p!.team)}</span>`, fmt(p!.hg)]),
      ...(w.coaches[0] ? [[`Valmentaja: ${esc(w.coaches[0].name)} <span style="color:#64748b">${esc(w.coaches[0].team)}</span>`, fmt(w.coaches[0].hg)]] : []),
    ], ['left', 'right']),
    h2('Viikon huippupelit'),
    table(w.bestGames.slice(0, 3).map((g) => [`${esc(g.name)} <span style="color:#64748b">(${POS[g.pos]}) vs ${esc(g.opponent)} · ${esc(g.line)}</span>`, fmt(g.hg)]), ['left', 'right']),
    `<p style="margin-top:20px"><a href="${SITE}/gurukierros" style="display:inline-block;background:#38bdf8;color:#060b18;padding:10px 18px;border-radius:10px;font-weight:bold;text-decoration:none">Koko Gurukierros →</a></p>`,
  ].join('');

  let ok = 0; let fail = 0; let skipped = 0;
  for (const r of recipients) {
    if (sent.has(r.email) && !opts.onlyTo) { skipped++; continue; }
    const weekIdx = w.gurus.findIndex((g) => g.id === r.guru_id);
    const me = lb.find((g) => g.id === r.guru_id);
    const delta = me?.prevRank != null ? me.prevRank - me.rank : null;
    const own = `<p>Viikko ${esc(w.monday.slice(8, 10))}.${esc(w.monday.slice(5, 7))}.–${esc(w.sunday.slice(8, 10))}.${esc(w.sunday.slice(5, 7))}. on pelattu (${w.games} ottelua).</p>
<table width="100%" cellpadding="10" cellspacing="0" style="background:#060b18;border-radius:12px;margin:8px 0 6px"><tr>
<td align="center"><div style="font-size:11px;color:#64748b;text-transform:uppercase">Viikon pisteesi</div><div style="font-size:24px;font-weight:bold;color:#fde68a">${fmt(w.gurus[weekIdx]?.points ?? 0)}</div></td>
<td align="center"><div style="font-size:11px;color:#64748b;text-transform:uppercase">Viikon sija</div><div style="font-size:24px;font-weight:bold;color:#ffffff">${weekIdx + 1}/${w.gurus.length}</div></td>
<td align="center"><div style="font-size:11px;color:#64748b;text-transform:uppercase">Kokonaissija</div><div style="font-size:24px;font-weight:bold;color:#ffffff">${me?.rank ?? '–'}${delta ? ` <span style="font-size:14px;color:${delta > 0 ? '#34d399' : '#f87171'}">${delta > 0 ? '▲' : '▼'}${Math.abs(delta)}</span>` : ''}</div></td>
</tr></table>`;
    const unsub = `${SITE}/api/unsubscribe?t=${await unsubToken(db, r.user_id)}`;
    const good = await sendMail(env, kind, r.email, `Gurukierros ${w.monday.slice(8, 10)}.${w.monday.slice(5, 7)}.–${w.sunday.slice(8, 10)}.${w.sunday.slice(5, 7)}.`, layout('Gurukierros', own + common, unsub), unsub);
    if (good) ok++; else fail++;
  }
  return { week: monday, recipients: recipients.length, ok, fail, skipped };
}

/** Ylläpidon päiväraportti: synkat, varmistus, sähköpostit, ilmoittautumiset. */
export async function sendAdminReport(env: MailEnv & { BACKUPS?: R2Bucket }, season: Season) {
  const db = env.DB;
  const since = new Date(Date.now() - 86400_000).toISOString();
  const [syncs, mails, regs, admins, audit] = await Promise.all([
    db.prepare('SELECT ok, COUNT(*) AS n, MAX(message) AS msg FROM sync_log WHERE started_at > ? GROUP BY ok').bind(since).all<{ ok: number; n: number; msg: string }>(),
    db.prepare("SELECT ok, COUNT(*) AS n FROM mail_log WHERE at > datetime('now','-1 day') AND kind NOT LIKE 'admin%' GROUP BY ok").all<{ ok: number; n: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM registrations WHERE season_id = ? AND created_at > datetime('now','-1 day')").bind(season.id).first<{ n: number }>().catch(() => null),
    db.prepare("SELECT email FROM users WHERE role = 'admin' AND active = 1").all<{ email: string }>(),
    db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE at > datetime('now','-1 day')").first<{ n: number }>(),
  ]);
  let backup = 'ei tietoa';
  if (env.BACKUPS) {
    const today = helsinkiDate();
    const o = await env.BACKUPS.head(`daily/${today}.sql`);
    backup = o ? `✅ daily/${today}.sql (${Math.round(o.size / 1024)} kt)` : '❌ tämän päivän varmistus puuttuu';
  }
  const okSync = syncs.results.find((s) => s.ok === 1)?.n ?? 0;
  const badSync = syncs.results.find((s) => s.ok === 0);
  const body = table([
    ['Tilastopäivitykset 24 h', `${okSync} ok${badSync ? `, <b style="color:#f87171">${badSync.n} virhettä</b> (${esc(badSync.msg)})` : ''}`],
    ['Varmistus', backup],
    ['Sähköpostit 24 h', `${mails.results.find((m) => m.ok === 1)?.n ?? 0} ok, ${mails.results.find((m) => m.ok === 0)?.n ?? 0} virhettä`],
    ['Uudet ilmoittautumiset', String(regs?.n ?? 0)],
    ['Muutoksia (audit-loki)', String(audit?.n ?? 0)],
  ]);
  for (const a of admins.results) await sendMail(env, 'admin:daily', a.email, `HogiGuru ylläpito ${helsinkiDate()}${badSync ? ' ⚠️' : ''}`, layout('Ylläpidon päiväraportti', body));
  return { admins: admins.results.length };
}
