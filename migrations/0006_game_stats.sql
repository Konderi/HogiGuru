-- Ottelukohtaiset tilastot (pelaajat + maalivahdit) ja joukkueiden ottelutulokset (valmentajat)
CREATE TABLE game_stats (
  season INTEGER NOT NULL,
  game_id INTEGER NOT NULL,
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
CREATE INDEX idx_game_stats_player ON game_stats(player_id, season);

CREATE TABLE team_games (
  season INTEGER NOT NULL,
  game_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  team_id TEXT NOT NULL,
  opponent TEXT,
  home INTEGER NOT NULL DEFAULT 0,
  gf INTEGER NOT NULL, ga INTEGER NOT NULL,
  points INTEGER NOT NULL,
  PRIMARY KEY (game_id, team_id)
);
CREATE INDEX idx_team_games_team ON team_games(team_id, season);

CREATE TABLE games_synced (game_id INTEGER PRIMARY KEY, season INTEGER NOT NULL, synced_at TEXT NOT NULL);
