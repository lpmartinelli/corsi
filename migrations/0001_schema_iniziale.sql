-- Utenti dell'app (login tramite Cloudflare Access, identificati per email)
CREATE TABLE utenti (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nome TEXT NOT NULL,
  ruolo TEXT NOT NULL CHECK (ruolo IN ('admin', 'coordinatore')),
  attivo INTEGER NOT NULL DEFAULT 1
);

-- Abilitazioni (BLSD, PBLSD, PTC...). Il tipo di un corso è un'abilitazione:
-- un corso BLSD richiede istruttori abilitati BLSD.
CREATE TABLE abilitazioni (
  codice TEXT PRIMARY KEY,
  descrizione TEXT NOT NULL
);

INSERT INTO abilitazioni (codice, descrizione) VALUES
  ('BLSD', 'Basic Life Support and Defibrillation'),
  ('PBLSD', 'Pediatric Basic Life Support and Defibrillation'),
  ('PTC', 'Prehospital Trauma Care');

CREATE TABLE istruttori (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  cognome TEXT NOT NULL,
  telefono TEXT,
  profilo TEXT NOT NULL CHECK (profilo IN ('sanitario', 'tecnico')),
  direttore INTEGER NOT NULL DEFAULT 0,
  attivo INTEGER NOT NULL DEFAULT 1,
  note TEXT
);

CREATE TABLE istruttori_abilitazioni (
  istruttore_id INTEGER NOT NULL REFERENCES istruttori(id) ON DELETE CASCADE,
  abilitazione TEXT NOT NULL REFERENCES abilitazioni(codice),
  PRIMARY KEY (istruttore_id, abilitazione)
);

CREATE TABLE committenti (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  referente TEXT,
  telefono TEXT,
  email TEXT,
  note TEXT
);

-- Un corso dura una giornata
CREATE TABLE corsi (
  id INTEGER PRIMARY KEY,
  committente_id INTEGER REFERENCES committenti(id),
  tipo TEXT NOT NULL REFERENCES abilitazioni(codice),
  data TEXT NOT NULL,              -- YYYY-MM-DD
  ora_inizio TEXT,                 -- HH:MM
  ora_fine TEXT,
  sede TEXT,
  istruttori_richiesti INTEGER NOT NULL DEFAULT 2,
  coordinatore_id INTEGER REFERENCES utenti(id),
  stato TEXT NOT NULL DEFAULT 'bozza'
    CHECK (stato IN ('bozza', 'richiesta', 'assegnato', 'svolto', 'annullato')),
  note TEXT
);
CREATE INDEX corsi_data ON corsi(data);

-- Richiesta di disponibilità inviata a un istruttore: il token è il suo link personale
CREATE TABLE richieste (
  id INTEGER PRIMARY KEY,
  istruttore_id INTEGER NOT NULL REFERENCES istruttori(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  creata_il TEXT NOT NULL DEFAULT (datetime('now')),
  scade_il TEXT NOT NULL,
  creata_da INTEGER REFERENCES utenti(id)
);

CREATE TABLE richieste_corsi (
  richiesta_id INTEGER NOT NULL REFERENCES richieste(id) ON DELETE CASCADE,
  corso_id INTEGER NOT NULL REFERENCES corsi(id) ON DELETE CASCADE,
  PRIMARY KEY (richiesta_id, corso_id)
);

CREATE TABLE disponibilita (
  corso_id INTEGER NOT NULL REFERENCES corsi(id) ON DELETE CASCADE,
  istruttore_id INTEGER NOT NULL REFERENCES istruttori(id) ON DELETE CASCADE,
  risposta TEXT NOT NULL CHECK (risposta IN ('si', 'no', 'forse')),
  fonte TEXT NOT NULL CHECK (fonte IN ('link', 'manuale')),
  aggiornata_il TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (corso_id, istruttore_id)
);

-- Le regole di composizione non bloccano mai: gli avvisi ignorati restano tracciati qui
CREATE TABLE assegnazioni (
  corso_id INTEGER NOT NULL REFERENCES corsi(id) ON DELETE CASCADE,
  istruttore_id INTEGER NOT NULL REFERENCES istruttori(id),
  ruolo TEXT NOT NULL CHECK (ruolo IN ('direttore', 'istruttore')),
  avvisi_ignorati TEXT,            -- JSON con gli avvisi presenti al momento dell'assegnazione
  assegnata_da INTEGER REFERENCES utenti(id),
  assegnata_il TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (corso_id, istruttore_id)
);
CREATE INDEX assegnazioni_istruttore ON assegnazioni(istruttore_id);
