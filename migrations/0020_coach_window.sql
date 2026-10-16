-- Valmentajan toimikausi kauden sisällä: pisteet lasketaan vain joukkueen otteluista välillä since..until (team_games).
ALTER TABLE coaches ADD COLUMN since TEXT;
ALTER TABLE coaches ADD COLUMN until TEXT;
