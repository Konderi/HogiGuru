-- Pääylläpitäjä-rooli: tekninen ylläpito (varmistukset, sähköposti, muutoshistoria).
-- users.role CHECK sallii vain admin/guru, joten oikeus on erillinen lippu:
-- role='admin' + maintainer=1 => 'superadmin' sovelluksessa.
ALTER TABLE users ADD COLUMN maintainer INTEGER NOT NULL DEFAULT 0;
UPDATE users SET maintainer = 1 WHERE role = 'admin';
