-- Vaihtotoiveet: gurut tallentavat toiveet etukäteen, ylläpito käsittelee ne vaihtopäivänä
-- etusijajärjestyksessä (draft-numero, joka toisena vaihtopäivänä käänteinen).

ALTER TABLE swap_days ADD COLUMN processed_at TEXT;

CREATE TABLE swap_requests (
  id INTEGER PRIMARY KEY,
  swap_day_id INTEGER NOT NULL REFERENCES swap_days(id) ON DELETE CASCADE,
  guru_id INTEGER NOT NULL REFERENCES gurus(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL,                 -- gurun oma järjestys 1..n
  slot_id INTEGER NOT NULL REFERENCES roster_slots(id) ON DELETE CASCADE,  -- ulos lähtevä paikka
  candidates TEXT NOT NULL DEFAULT '[]',     -- [entity_id, …] sisään, varavaihtoehdot järjestyksessä
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
  result_entity_id INTEGER,
  result_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX swap_requests_day ON swap_requests(swap_day_id, guru_id, priority);
