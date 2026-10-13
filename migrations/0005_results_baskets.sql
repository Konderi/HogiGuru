-- Kokonaistulosten julkaisu (veikkauskategoriat pimitetään gaalaan asti) ja valintatapa (draft / korit)
ALTER TABLE seasons ADD COLUMN results_published INTEGER NOT NULL DEFAULT 0;
ALTER TABLE seasons ADD COLUMN selection_mode TEXT NOT NULL DEFAULT 'draft'; -- 'draft' | 'baskets'
ALTER TABLE seasons ADD COLUMN baskets TEXT NOT NULL DEFAULT '[]';           -- [[team_id, team_id], …]
ALTER TABLE seasons ADD COLUMN results_override TEXT NOT NULL DEFAULT '{}';  -- ylläpidon käsikorjaukset oikeisiin vastauksiin
ALTER TABLE registrations ADD COLUMN basket_picks TEXT NOT NULL DEFAULT '[]'; -- [{position, entity_id}] korin indeksin mukaan
