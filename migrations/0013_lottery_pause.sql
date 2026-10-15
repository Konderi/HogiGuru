-- Draft-arvonnan tauko: pysäytyshetki (ms epoch), NULL = käynnissä
ALTER TABLE seasons ADD COLUMN draft_lottery_paused INTEGER;
