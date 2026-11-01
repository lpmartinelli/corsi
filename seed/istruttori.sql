-- Elenco iniziale degli istruttori. Si può rieseguire: chi c'è già (stesso nome e cognome) viene saltato.
-- npx wrangler d1 execute corsi --local --file seed/istruttori.sql   (oppure --remote)
WITH nuovi (cognome, nome, profilo) AS (VALUES
  ('Martinelli', 'Luca', 'sanitario'),
  ('Ronc', 'Gemma', 'sanitario'),
  ('Ronc', 'Michela', 'sanitario'),
  ('Berriat', 'Igor', 'tecnico'),
  ('Cheillon', 'Alessia', 'sanitario'),
  ('Desandré', 'Cristina', 'sanitario'),
  ('De Dea', 'Chiara', 'sanitario'),
  ('Blanchod', 'Mathieu', 'tecnico'),
  ('Boch', 'Cesare', 'sanitario'),
  ('Juglair', 'Michel', 'tecnico'),
  ('Mondet', 'Stefania', 'sanitario'),
  ('Nicco', 'Giorgio', 'tecnico'),
  ('Lamanna', 'Gianluca', 'sanitario'),
  ('Lemma', 'Maria Laura', 'sanitario'),
  ('Munari', 'Michael', 'tecnico'),
  ('Mortara', 'Monja', 'sanitario'),
  ('Moretti', 'Daniela', 'sanitario'),
  ('Musso', 'Elisabetta', 'sanitario'),
  ('Tropiano', 'Simone', 'tecnico'),
  ('Trapani', 'Alessia', 'sanitario'),
  ('Miorini', 'Lorella', 'sanitario')
)
INSERT INTO istruttori (cognome, nome, profilo)
SELECT n.cognome, n.nome, n.profilo FROM nuovi n
WHERE NOT EXISTS (
  SELECT 1 FROM istruttori i
  WHERE i.cognome = n.cognome COLLATE NOCASE AND i.nome = n.nome COLLATE NOCASE
);
