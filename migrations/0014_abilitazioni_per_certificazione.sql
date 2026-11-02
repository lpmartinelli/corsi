-- Si è istruttori o direttori di una disciplina dentro una certificazione: BLSD IRC e BLSD IRCcom sono separati.
CREATE TABLE istruttori_abilitazioni_nuova (
  istruttore_id INTEGER NOT NULL REFERENCES istruttori(id) ON DELETE CASCADE,
  abilitazione TEXT NOT NULL REFERENCES abilitazioni(codice),
  certificazione TEXT NOT NULL CHECK (certificazione IN ('irc', 'irccom')),
  direttore INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (istruttore_id, abilitazione, certificazione)
);

-- Le abilitazioni di oggi valgono per le certificazioni che l'istruttore ha (IRC se non ne ha nessuna): le schede vanno poi corrette a mano.
INSERT INTO istruttori_abilitazioni_nuova (istruttore_id, abilitazione, certificazione, direttore)
  SELECT ia.istruttore_id, ia.abilitazione, 'irc', ia.direttore
    FROM istruttori_abilitazioni ia JOIN istruttori i ON i.id = ia.istruttore_id
    WHERE i.irc > 0 OR i.irccom = 0
  UNION ALL
  SELECT ia.istruttore_id, ia.abilitazione, 'irccom', ia.direttore
    FROM istruttori_abilitazioni ia JOIN istruttori i ON i.id = ia.istruttore_id
    WHERE i.irccom > 0;

DROP TABLE istruttori_abilitazioni;
ALTER TABLE istruttori_abilitazioni_nuova RENAME TO istruttori_abilitazioni;

-- IRC e IRCcom tornano un sì/no: istruttore o direttore si indica per disciplina
UPDATE istruttori SET irc = 1 WHERE irc > 1;
UPDATE istruttori SET irccom = 1 WHERE irccom > 1;

-- Le abilitazioni si vedono solo sotto le certificazioni spuntate: chi non ne aveva nessuna diventa IRC
UPDATE istruttori SET irc = 1
  WHERE irc = 0 AND id IN (SELECT istruttore_id FROM istruttori_abilitazioni WHERE certificazione = 'irc');
