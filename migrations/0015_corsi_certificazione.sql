-- Certificazione del corso, facoltativa: se c'è, servono istruttori abilitati in quella certificazione
ALTER TABLE corsi ADD COLUMN certificazione TEXT CHECK (certificazione IN ('irc', 'irccom'));
