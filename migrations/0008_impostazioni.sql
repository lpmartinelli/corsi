-- Impostazioni modificabili dall'app (pagina Impostazioni, solo admin): intestazione, firma e piede dei preventivi,
-- logo (data URL) e testi predefiniti di un nuovo preventivo. Una riga per chiave.
CREATE TABLE impostazioni (
  chiave TEXT PRIMARY KEY,
  valore TEXT
);

INSERT INTO impostazioni (chiave, valore) VALUES
  ('nome', 'Co.E.S. Formazione'),
  ('sottotitolo', 'Associazione Conducenti di Emergenza Sanitaria'),
  ('citta', 'Aosta'),
  ('firma', 'Co.E.S Formazione
Marco Azzaroli'),
  ('piede', 'Co.E.S. Formazione - Centro di Formazione I.R.C
Fr. Bovet, 19 – 11020 Gressan (AO) Tel 347-7888157 miriampo@tinit P.IVA: 01178140073 C.F.: 01178140073'),
  ('logo', NULL),
  ('oggetto', 'proposta corsi di formazione BLSD'),
  ('premessa', 'In relazione alla richiesta pervenuta allo scrivente, in merito alla proposta di formazione ovvero sulla possibilità o meno di effettuare corsi di formazione del Vs. personale, si propone quanto segue:'),
  ('voce', 'Costo docenza previsto per 1 modulo fino a 18 allievi {tipo}'),
  ('prezzo', '750'),
  ('condizioni', 'Sedi del corso: sarà a cura dell''ente richiedente provvedere alla fornitura dell''aula attrezzata.

Al termine del corso, i partecipanti che avranno superato l''esame teorico-pratico riceveranno l''attestato di qualificazione.

Il nostro Centro di Formazione provvederà a comunicare all''AUSL della Valle d''Aosta l''avvenuto corso con relativo elenco del personale certificato ai fini dell''autorizzazione regionale.

A disposizione per ogni eventuale richiesta di chiarimenti e in attesa di un gradito riscontro alla presente, si porgono distinti saluti.');
