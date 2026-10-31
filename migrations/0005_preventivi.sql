-- Preventivi per i committenti, stampati come lettera. Numero = progressivo/anno (es. 3/2026).
-- Le righe sono un array JSON di { descrizione, quantita, prezzo } (prezzo unitario, IVA esclusa).
CREATE TABLE preventivi (
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
