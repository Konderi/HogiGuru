-- Play-Off vaihe 3–4: ottelukohtaiset pudotuspelitilastot, kokoonpanot ja vaihdot
CREATE TABLE IF NOT EXISTS playoff_game_stats (
  season INTEGER NOT NULL,
  game_id INTEGER NOT NULL,
  phase INTEGER NOT NULL,
  date TEXT NOT NULL,
  player_id INTEGER NOT NULL,
  team_id TEXT NOT NULL,
  opponent TEXT,
  home INTEGER NOT NULL DEFAULT 0,
  goals INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0,
  pim INTEGER NOT NULL DEFAULT 0,
  plus_minus INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0,
  goals_against INTEGER NOT NULL DEFAULT 0,
  shutout INTEGER NOT NULL DEFAULT 0,
  win INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_pgs_player ON playoff_game_stats(player_id, season);

CREATE TABLE IF NOT EXISTS playoff_slots (
  id INTEGER PRIMARY KEY,
  season_id INTEGER NOT NULL,
  guru_id INTEGER NOT NULL,
  position TEXT NOT NULL CHECK (position IN ('F','D','G')),
  player_id INTEGER NOT NULL,
  start_date TEXT,          -- NULL = alusta asti
  end_date TEXT,            -- NULL = voimassa
  free INTEGER NOT NULL DEFAULT 0,  -- 1 = ilmainen vaihto (pudonneen joukkueen pelaaja)
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pslots ON playoff_slots(season_id, guru_id);

ALTER TABLE seasons ADD COLUMN swap_open INTEGER NOT NULL DEFAULT 0;  -- 0 = automaattinen, 1 = pakko auki, -1 = pakko kiinni
