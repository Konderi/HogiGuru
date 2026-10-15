-- Draft-numeroiden graafinen arvonta: arvonnan alkuhetki (ms epoch) ja paljastusjärjestys
ALTER TABLE seasons ADD COLUMN draft_lottery_at INTEGER;
ALTER TABLE gurus ADD COLUMN lottery_order INTEGER;
