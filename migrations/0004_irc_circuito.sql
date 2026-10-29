-- Certificazioni dell'istruttore (anche entrambe): usate come filtro nella scelta dei destinatari
ALTER TABLE istruttori ADD COLUMN irc INTEGER NOT NULL DEFAULT 0;
ALTER TABLE istruttori ADD COLUMN irccom INTEGER NOT NULL DEFAULT 0;

-- Circuito del corso, facoltativo
ALTER TABLE corsi ADD COLUMN circuito TEXT CHECK (circuito IN ('CoES', 'VdA'));
