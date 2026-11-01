-- Scheda compilata dall'istruttore col link condiviso: resta da verificare finché un coordinatore non la salva.
-- Il link condiviso sta nelle impostazioni (chiave link_anagrafica): senza valore il link è disattivato.
ALTER TABLE istruttori ADD COLUMN da_verificare INTEGER NOT NULL DEFAULT 0;
