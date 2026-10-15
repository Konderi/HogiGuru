/**
 * Varmistukset R2:een: koko kanta SQL-dumpina (CREATE + INSERT).
 *   daily/YYYY-MM-DD.sql   – yöllinen, säilytys 30 pv + jokaisen kuun 1. pysyvästi
 *   event/<aika>-<syy>.sql – ennen riskialttiita toimintoja, säilytys 90 pv
 *   manual/<aika>.sql      – ylläpidon "Tee varmistus nyt"
 * Palautus: `wrangler d1 execute hogiguru --remote --file <dump.sql>` tyhjään kantaan
 * (tai D1 Time Travel 30 pv taaksepäin).
 */
const SKIP = new Set(['sessions', '_cf_KV', 'sqlite_sequence']);

const lit = (v: unknown): string => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (v instanceof ArrayBuffer) return `X'${[...new Uint8Array(v)].map((b) => b.toString(16).padStart(2, '0')).join('')}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
};

export async function dumpDatabase(db: D1Database): Promise<{ sql: string; tables: Record<string, number> }> {
  const meta = await db.prepare(
    "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type = 'table' DESC, name",
  ).all<{ type: string; name: string; tbl_name: string; sql: string }>();
  const out: string[] = [`-- HogiGuru varmistus ${new Date().toISOString()}`, 'PRAGMA foreign_keys = OFF;'];
  const tables: Record<string, number> = {};
  for (const m of meta.results) {
    if (SKIP.has(m.tbl_name)) continue;
    if (m.type === 'table') {
      out.push(`DROP TABLE IF EXISTS "${m.name}";`, `${m.sql};`);
      let offset = 0; let n = 0;
      for (;;) {
        const rows = (await db.prepare(`SELECT * FROM "${m.name}" LIMIT 1000 OFFSET ?`).bind(offset).all<Record<string, unknown>>()).results;
        for (const r of rows) {
          const cols = Object.keys(r);
          out.push(`INSERT INTO "${m.name}" (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${cols.map((c) => lit(r[c])).join(',')});`);
        }
        n += rows.length; offset += 1000;
        if (rows.length < 1000) break;
      }
      tables[m.name] = n;
    } else {
      out.push(`${m.sql};`);
    }
  }
  out.push('PRAGMA foreign_keys = ON;');
  return { sql: out.join('\n'), tables };
}

export async function makeBackup(db: D1Database, bucket: R2Bucket, kind: 'daily' | 'event' | 'manual', reason = ''): Promise<{ key: string; size: number; tables: Record<string, number> }> {
  const { sql, tables } = await dumpDatabase(db);
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const helsinkiDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Helsinki' }).format(now);
  const key = kind === 'daily' ? `daily/${helsinkiDay}.sql` : `${kind}/${stamp}${reason ? `-${reason.replace(/[^a-z0-9-]/gi, '')}` : ''}.sql`;
  await bucket.put(key, sql, { httpMetadata: { contentType: 'application/sql; charset=utf-8' }, customMetadata: { tables: JSON.stringify(tables), reason } });
  return { key, size: sql.length, tables };
}

/** Vanhojen poisto: daily > 30 pv (paitsi kuun 1.), event > 90 pv. Manual säilyy. */
export async function pruneBackups(bucket: R2Bucket): Promise<number> {
  const now = Date.now(); let removed = 0;
  for (const [prefix, days] of [['daily/', 30], ['event/', 90]] as const) {
    let cursor: string | undefined;
    do {
      const list = await bucket.list({ prefix, cursor });
      const old = list.objects.filter((o) => now - o.uploaded.getTime() > days * 86400_000 && !(prefix === 'daily/' && /-01\.sql$/.test(o.key)));
      if (old.length) { await bucket.delete(old.map((o) => o.key)); removed += old.length; }
      cursor = list.truncated ? list.cursor : undefined;
    } while (cursor);
  }
  return removed;
}

export async function listBackups(bucket: R2Bucket) {
  const all: { key: string; size: number; uploaded: string }[] = [];
  let cursor: string | undefined;
  do {
    const list = await bucket.list({ cursor });
    for (const o of list.objects) all.push({ key: o.key, size: o.size, uploaded: o.uploaded.toISOString() });
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
  return all.sort((a, b) => b.uploaded.localeCompare(a.uploaded));
}
