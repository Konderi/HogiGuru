-- Kirjautumisen, salasanan palautuksen ja ilmoittautumisen yritysrajoitus.
CREATE TABLE rate_limits (
  key TEXT NOT NULL,      -- esim. 'login:email:x@y.fi', 'login:ip:1.2.3.4'
  at INTEGER NOT NULL     -- ms
);
CREATE INDEX idx_rate_limits ON rate_limits(key, at);
