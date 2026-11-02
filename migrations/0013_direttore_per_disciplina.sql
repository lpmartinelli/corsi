-- Si è direttori di una disciplina, non in generale: si può dirigere PBLSD ed essere solo istruttore BLSD.
ALTER TABLE istruttori_abilitazioni ADD COLUMN direttore INTEGER NOT NULL DEFAULT 0;

-- Chi aveva la qualifica di direttore la tiene su tutte le sue abilitazioni: le schede vanno poi corrette a mano.
UPDATE istruttori_abilitazioni SET direttore = 1
  WHERE istruttore_id IN (SELECT id FROM istruttori WHERE direttore = 1);

ALTER TABLE istruttori DROP COLUMN direttore;

-- IRC e IRCcom diventano un livello: 0 = no, 1 = istruttore, 2 = direttore. Gli istruttori di oggi restano 1.
