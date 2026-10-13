-- Ilmoittautuminen, paikkakohtaiset valintarajat ja kauden 2026–2027 säännöt osallistumiskaavakkeesta

ALTER TABLE seasons ADD COLUMN max_picks_by_pos TEXT NOT NULL DEFAULT '{"C":5,"G":5,"D":5,"F":4}';
ALTER TABLE seasons ADD COLUMN registration_open INTEGER NOT NULL DEFAULT 0;
ALTER TABLE seasons ADD COLUMN registration_deadline TEXT;   -- ISO, esim. 2026-09-01T18:30
ALTER TABLE seasons ADD COLUMN entry_fee TEXT;
ALTER TABLE seasons ADD COLUMN registration_info TEXT;       -- vapaa teksti lomakkeen yläosaan

ALTER TABLE swap_days ADD COLUMN start_time TEXT NOT NULL DEFAULT '09:00';
ALTER TABLE swap_days ADD COLUMN end_time TEXT NOT NULL DEFAULT '21:00';

CREATE TABLE registrations (
  id INTEGER PRIMARY KEY,
  season_id INTEGER NOT NULL REFERENCES seasons(id),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT NOT NULL,
  standings TEXT NOT NULL DEFAULT '[]',      -- [team_id, …] sijat 1..17
  top_scorers TEXT NOT NULL DEFAULT '{}',    -- { team_id: player_id }
  categories TEXT NOT NULL DEFAULT '{}',     -- { points|goals|assists|plusMinus|dPoints|pim|shutouts: player_id }
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'accepted', 'rejected')),
  guru_id INTEGER REFERENCES gurus(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX registrations_email ON registrations(season_id, email);

UPDATE seasons SET
  max_swaps = 4,
  entry_fee = '30 €',
  registration_deadline = '2026-09-01T18:30',
  scoring = json_set(scoring, '$.prediction', json('{"standings":[6,4,1],"topScorer":[7,4,2],"category":[12,6,3],"shutoutFactor":0.5}'))
WHERE liiga_season = 2027;

INSERT INTO swap_days (season_id, date, note, start_time, end_time)
SELECT id, d.date, 'Vaihdot WhatsApp-ryhmään klo 9–21', '09:00', '21:00'
FROM seasons, (SELECT '2026-10-11' AS date UNION ALL SELECT '2026-11-29' UNION ALL SELECT '2027-01-10' UNION ALL SELECT '2027-02-21') d
WHERE liiga_season = 2027
  AND NOT EXISTS (SELECT 1 FROM swap_days s WHERE s.season_id = seasons.id AND s.date = d.date);
