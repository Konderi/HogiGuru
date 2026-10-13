-- HogiGuru: perusrakenne

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'guru' CHECK (role IN ('admin', 'guru')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE seasons (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  liiga_season INTEGER NOT NULL,            -- liiga.fi:n kausitunnus = päättymisvuosi (2026-2027 -> 2027)
  active INTEGER NOT NULL DEFAULT 0,
  max_swaps INTEGER,                        -- NULL = ei rajaa
  max_picks_per_entity INTEGER NOT NULL DEFAULT 5,
  roster TEXT NOT NULL DEFAULT '{"C":1,"G":1,"D":2,"F":3}',
  scoring TEXT NOT NULL,
  draft_status TEXT NOT NULL DEFAULT 'setup' CHECK (draft_status IN ('setup', 'live', 'done')),
  draft_snake INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT,
  logo TEXT
);

CREATE TABLE players (
  id INTEGER PRIMARY KEY,                   -- liiga.fi playerId
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  team_id TEXT,
  team_name TEXT,
  role TEXT,                                -- H / P / MV
  jersey INTEGER,
  picture TEXT,
  nationality TEXT,
  updated_at TEXT
);
CREATE INDEX idx_players_name ON players(last_name, first_name);

CREATE TABLE player_stats (
  season INTEGER NOT NULL,
  player_id INTEGER NOT NULL,
  games INTEGER NOT NULL DEFAULT 0,
  goals INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0,
  pim INTEGER NOT NULL DEFAULT 0,
  plus_minus INTEGER NOT NULL DEFAULT 0,
  shutouts INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0,
  goals_against INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  save_pct REAL,
  updated_at TEXT,
  PRIMARY KEY (season, player_id)
);

CREATE TABLE standings (
  season INTEGER NOT NULL,
  team_id TEXT NOT NULL,
  ranking INTEGER,
  games INTEGER, wins INTEGER, ot_wins INTEGER, ot_losses INTEGER, losses INTEGER,
  points INTEGER, goals_for INTEGER, goals_against INTEGER,
  updated_at TEXT,
  PRIMARY KEY (season, team_id)
);

CREATE TABLE coaches (
  id INTEGER PRIMARY KEY,
  season_id INTEGER NOT NULL REFERENCES seasons(id),
  name TEXT NOT NULL,
  team_id TEXT NOT NULL REFERENCES teams(id),
  fired INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE gurus (
  id INTEGER PRIMARY KEY,
  season_id INTEGER NOT NULL REFERENCES seasons(id),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  draft_number INTEGER,
  remote_draft INTEGER NOT NULL DEFAULT 0,
  UNIQUE (season_id, name)
);

-- Kentällisen paikka. Vaihto = vanha paikka suljetaan (end_*) ja uusi avataan.
-- Pisteet = (end_points TAI nykyiset pisteet) - start_points  (sama logiikka kuin Excelissä)
CREATE TABLE roster_slots (
  id INTEGER PRIMARY KEY,
  guru_id INTEGER NOT NULL REFERENCES gurus(id) ON DELETE CASCADE,
  position TEXT NOT NULL CHECK (position IN ('C', 'G', 'D', 'F')),
  entity_id INTEGER NOT NULL,               -- pelaajan id tai valmentajan id (C)
  start_date TEXT NOT NULL,
  end_date TEXT,
  start_points REAL NOT NULL DEFAULT 0,
  end_points REAL,
  replaced_slot_id INTEGER REFERENCES roster_slots(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_slots_guru ON roster_slots(guru_id);
CREATE INDEX idx_slots_entity ON roster_slots(position, entity_id);

CREATE TABLE adjustments (
  id INTEGER PRIMARY KEY,
  guru_id INTEGER NOT NULL REFERENCES gurus(id) ON DELETE CASCADE,
  points REAL NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE swap_days (
  id INTEGER PRIMARY KEY,
  season_id INTEGER NOT NULL REFERENCES seasons(id),
  date TEXT NOT NULL,
  note TEXT
);

CREATE TABLE draft_pool (
  season_id INTEGER NOT NULL,
  position TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  PRIMARY KEY (season_id, position, entity_id)
);

CREATE TABLE draft_picks (
  id INTEGER PRIMARY KEY,
  season_id INTEGER NOT NULL,
  pick_no INTEGER NOT NULL,
  guru_id INTEGER NOT NULL REFERENCES gurus(id) ON DELETE CASCADE,
  position TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  auto INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (season_id, pick_no)
);

-- Etädraftaajan ennakkolista: paikkajärjestys (esim. ["F","G","D","C",...]) + toivelistat per paikka
CREATE TABLE draft_prefs (
  guru_id INTEGER PRIMARY KEY REFERENCES gurus(id) ON DELETE CASCADE,
  position_order TEXT NOT NULL DEFAULT '[]',
  rankings TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE leaderboard_history (
  date TEXT NOT NULL,
  guru_id INTEGER NOT NULL REFERENCES gurus(id) ON DELETE CASCADE,
  points REAL NOT NULL,
  rank INTEGER NOT NULL,
  PRIMARY KEY (date, guru_id)
);

CREATE TABLE hall_of_fame (
  id INTEGER PRIMARY KEY,
  season_name TEXT NOT NULL,
  rank INTEGER NOT NULL,
  name TEXT NOT NULL,
  points REAL,
  note TEXT
);

CREATE TABLE sync_log (
  id INTEGER PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  ok INTEGER,
  message TEXT
);

INSERT INTO seasons (name, liiga_season, active, scoring) VALUES (
  '2026–2027', 2027, 1,
  '{"F":{"goals":1.5,"assists":0.9,"pim":0.1,"plusMinus":0.4,"games":-0.5},"D":{"goals":2.5,"assists":1.5,"pim":0.1,"plusMinus":0.4,"games":-0.5},"G":{"shutouts":2,"saves":0.1,"goalsAgainst":-1,"wins":0},"C":{"teamPoints":0.5},"coachFiredPenalty":-10}'
);
