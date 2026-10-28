-- Login con email e password gestito dall'app (come in EMSyShift).
-- password_hash = '' significa "account in attesa di attivazione": nessuna password è accettata.
ALTER TABLE utenti ADD COLUMN password_hash TEXT NOT NULL DEFAULT '';

-- Link di attivazione / reimpostazione password: nel DB solo l'hash del token
ALTER TABLE utenti ADD COLUMN attivazione_hash TEXT;
ALTER TABLE utenti ADD COLUMN attivazione_scade TEXT;

CREATE TABLE sessioni (
  token_hash TEXT PRIMARY KEY,
  utente_id INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
  scadenza TEXT NOT NULL
);
CREATE INDEX sessioni_utente ON sessioni(utente_id);
