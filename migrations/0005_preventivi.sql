-- Preventivi per i committenti. Numero = progressivo/anno (es. 3/2026).
-- Le righe sono un array JSON di { descrizione, quantita, prezzo } (prezzo unitario, IVA esclusa).
CREATE TABLE preventivi (
  id INTEGER PRIMARY KEY,
  anno INTEGER NOT NULL,
  progressivo INTEGER NOT NULL,
  committente_id INTEGER REFERENCES committenti(id),
  data TEXT NOT NULL,              -- YYYY-MM-DD
  validita_giorni INTEGER NOT NULL DEFAULT 30,
  oggetto TEXT,
  righe TEXT NOT NULL DEFAULT '[]',
  iva REAL NOT NULL DEFAULT 22,    -- percentuale; 0 per le operazioni esenti (motivo nelle note)
  note TEXT,
  stato TEXT NOT NULL DEFAULT 'bozza'
    CHECK (stato IN ('bozza', 'inviato', 'accettato', 'rifiutato')),
  creato_da INTEGER REFERENCES utenti(id),
  creato_il TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (anno, progressivo)
);
