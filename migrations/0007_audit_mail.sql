-- Muutoshistoria: kaikki ylläpidon ja gurujen muuttavat toiminnot
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER,
  user_name TEXT,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  body TEXT,
  status INTEGER
);
CREATE INDEX idx_audit_at ON audit_log(at);

-- Sähköpostit: asetukset, peruutustunniste ja lähetysloki
ALTER TABLE users ADD COLUMN email_prefs TEXT NOT NULL DEFAULT '{"weekly":true,"swaps":true,"coach":true}';
ALTER TABLE users ADD COLUMN unsub_token TEXT;

CREATE TABLE mail_log (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  kind TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT,
  ok INTEGER NOT NULL,
  error TEXT
);
CREATE INDEX idx_mail_kind ON mail_log(kind, at);
