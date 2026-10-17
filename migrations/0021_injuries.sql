-- Sairastupa: liiga.fi:n ottelukokoonpanon injured-lippu joukkueen viimeisimmästä ottelusta
ALTER TABLE players ADD COLUMN injured INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN injured_date TEXT;
