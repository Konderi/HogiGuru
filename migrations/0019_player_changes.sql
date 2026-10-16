-- Pelaajamuutokset (uusi / seuraa vaihtanut / poistunut) tilastopäivityksistä
ALTER TABLE players ADD COLUMN active INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS player_changes (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  player_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('new', 'moved', 'gone')),
  name TEXT NOT NULL,
  role TEXT,
  team_from TEXT,
  team_to TEXT
);
CREATE INDEX IF NOT EXISTS idx_player_changes_at ON player_changes(at);
