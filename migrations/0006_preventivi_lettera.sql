-- Preventivi stampati come lettera: premessa e condizioni, IVA facoltativa (NULL = "+ iva se dovuta"), niente validità.
-- SQLite non toglie un NOT NULL con ALTER: si ricrea la tabella. Le vecchie note erano stampate, quindi diventano le condizioni.
CREATE TABLE preventivi_lettera (
  id INTEGER PRIMARY KEY,
  anno INTEGER NOT NULL,
  progressivo INTEGER NOT NULL,
  committente_id INTEGER REFERENCES committenti(id),
  data TEXT NOT NULL,              -- YYYY-MM-DD
  oggetto TEXT,
  premessa TEXT,                   -- testo prima delle voci
  righe TEXT NOT NULL DEFAULT '[]',
  iva REAL,                        -- percentuale; NULL = "+ iva se dovuta"
  condizioni TEXT,                 -- testo dopo le voci: sede, attestati, saluti
  note TEXT,                       -- interne, non stampate
  stato TEXT NOT NULL DEFAULT 'bozza'
    CHECK (stato IN ('bozza', 'inviato', 'accettato', 'rifiutato')),
  creato_da INTEGER REFERENCES utenti(id),
  creato_il TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (anno, progressivo)
);

INSERT INTO preventivi_lettera (id, anno, progressivo, committente_id, data, oggetto, righe, iva, condizioni, stato, creato_da, creato_il)
  SELECT id, anno, progressivo, committente_id, data, oggetto, righe, iva, note, stato, creato_da, creato_il FROM preventivi;

DROP TABLE preventivi;
ALTER TABLE preventivi_lettera RENAME TO preventivi;
