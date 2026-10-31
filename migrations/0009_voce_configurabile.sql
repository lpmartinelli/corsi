-- Voce del preventivo da modello: corso, moduli e allievi si scelgono nel preventivo.
-- Si aggiornano solo i testi rimasti quelli iniziali, per non toccare quelli già cambiati da Impostazioni.
UPDATE impostazioni SET valore = 'Costo docenza previsto per {moduli} fino a {allievi} allievi {tipo}'
  WHERE chiave = 'voce' AND valore = 'Costo docenza previsto per 1 modulo fino a 18 allievi {tipo}';
UPDATE impostazioni SET valore = 'proposta corsi di formazione {tipo}'
  WHERE chiave = 'oggetto' AND valore = 'proposta corsi di formazione BLSD';
INSERT INTO impostazioni (chiave, valore) VALUES ('allievi', '18') ON CONFLICT (chiave) DO NOTHING;
