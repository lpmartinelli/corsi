-- Categoria del corso: decide la sezione del messaggio e chi può riceverlo
ALTER TABLE corsi ADD COLUMN categoria TEXT NOT NULL DEFAULT 'volontari' CHECK (categoria IN ('ausl', 'volontari'));
ALTER TABLE corsi ADD COLUMN retraining INTEGER NOT NULL DEFAULT 0;

-- Solo gli iscritti all'albo dei formatori AUSL possono tenere i corsi AUSL
ALTER TABLE istruttori ADD COLUMN albo_ausl INTEGER NOT NULL DEFAULT 0;

-- Un invio raggruppa le richieste di disponibilità mandate insieme (di solito a fine mese)
CREATE TABLE invii (
  id INTEGER PRIMARY KEY,
  creato_il TEXT NOT NULL DEFAULT (datetime('now')),
  creato_da INTEGER REFERENCES utenti(id)
);

ALTER TABLE richieste ADD COLUMN invio_id INTEGER REFERENCES invii(id) ON DELETE CASCADE;
ALTER TABLE richieste ADD COLUMN inviata_il TEXT;   -- quando il coordinatore ha aperto WhatsApp per l'istruttore
CREATE INDEX richieste_invio ON richieste(invio_id);
