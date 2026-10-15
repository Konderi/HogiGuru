-- Näytetäänkö Draft-linkki yläpalkissa (ylläpitäjä voi piilottaa kauden alettua)
ALTER TABLE seasons ADD COLUMN draft_nav INTEGER NOT NULL DEFAULT 1;
