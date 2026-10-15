-- Play-Off: pudotuspelien summatilastot (liiga.fi tournament=playoffs) + kisatyyppi kausille
CREATE TABLE IF NOT EXISTS playoff_stats (
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
ALTER TABLE seasons ADD COLUMN kind TEXT NOT NULL DEFAULT 'regular';
ALTER TABLE seasons ADD COLUMN parent_season_id INTEGER;
