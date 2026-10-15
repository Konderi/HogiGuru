-- Play-Offs vaihe 2: ilmoittautuminen (gurut-rivit play-off-kaudelle) + mestariveikkaus
ALTER TABLE seasons ADD COLUMN reg_open INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS playoff_predictions (
  season_id INTEGER NOT NULL,
  guru_id INTEGER NOT NULL,
  champion TEXT,
  updated_at TEXT,
  PRIMARY KEY (season_id, guru_id)
);
