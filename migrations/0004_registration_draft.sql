-- All-Stars-toivelistat ja draftin valintajärjestys ilmoittautumislomakkeelle
ALTER TABLE registrations ADD COLUMN position_order TEXT NOT NULL DEFAULT '[]'; -- ["F","G","D",…] draftin kierrosjärjestys
ALTER TABLE registrations ADD COLUMN rankings TEXT NOT NULL DEFAULT '{}';       -- { F:[player_id…], D:[…], G:[…], C:[coach_id…] }
