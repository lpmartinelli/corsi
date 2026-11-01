-- Stati dei corsi modificabili dalle Impostazioni. Bozza, Richiesta inviata e Annullato li usa l'app: non si possono togliere.
CREATE TABLE stati_corso (
  codice TEXT PRIMARY KEY,
  etichetta TEXT NOT NULL,
  ordine INTEGER NOT NULL DEFAULT 0,
  sistema INTEGER NOT NULL DEFAULT 0
);

INSERT INTO stati_corso (codice, etichetta, ordine, sistema) VALUES
  ('bozza', 'Bozza', 1, 1),
  ('richiesta', 'Richiesta inviata', 2, 1),
  ('assegnato', 'Assegnato', 3, 0),
  ('svolto', 'Svolto', 4, 0),
  ('annullato', 'Annullato', 5, 1);

-- SQLite non toglie un CHECK con ALTER: si ricrea la tabella dei corsi.
-- Il DROP cancellerebbe a cascata disponibilità, assegnazioni e richieste dei corsi: si copiano prima e si rimettono dopo.
PRAGMA defer_foreign_keys = true;

CREATE TABLE copia_disponibilita AS SELECT * FROM disponibilita;
CREATE TABLE copia_assegnazioni AS SELECT * FROM assegnazioni;
CREATE TABLE copia_richieste_corsi AS SELECT * FROM richieste_corsi;

CREATE TABLE corsi_nuovi (
  id INTEGER PRIMARY KEY,
  committente_id INTEGER REFERENCES committenti(id),
  tipo TEXT NOT NULL REFERENCES abilitazioni(codice),
  data TEXT NOT NULL,              -- YYYY-MM-DD
  ora_inizio TEXT,                 -- HH:MM
  ora_fine TEXT,
  sede TEXT,
  istruttori_richiesti INTEGER NOT NULL DEFAULT 2,
  coordinatore_id INTEGER REFERENCES utenti(id),
  stato TEXT NOT NULL DEFAULT 'bozza' REFERENCES stati_corso(codice),
  note TEXT,
  categoria TEXT NOT NULL DEFAULT 'volontari' CHECK (categoria IN ('ausl', 'volontari')),
  retraining INTEGER NOT NULL DEFAULT 0,
  circuito TEXT CHECK (circuito IN ('CoES', 'VdA'))
);

INSERT INTO corsi_nuovi (id, committente_id, tipo, data, ora_inizio, ora_fine, sede, istruttori_richiesti, coordinatore_id, stato, note,
    categoria, retraining, circuito)
  SELECT id, committente_id, tipo, data, ora_inizio, ora_fine, sede, istruttori_richiesti, coordinatore_id, stato, note,
    categoria, retraining, circuito FROM corsi;

DROP TABLE corsi;
ALTER TABLE corsi_nuovi RENAME TO corsi;
CREATE INDEX corsi_data ON corsi(data);

DELETE FROM disponibilita;
INSERT INTO disponibilita SELECT * FROM copia_disponibilita;
DELETE FROM assegnazioni;
INSERT INTO assegnazioni SELECT * FROM copia_assegnazioni;
DELETE FROM richieste_corsi;
INSERT INTO richieste_corsi SELECT * FROM copia_richieste_corsi;

DROP TABLE copia_disponibilita;
DROP TABLE copia_assegnazioni;
DROP TABLE copia_richieste_corsi;
