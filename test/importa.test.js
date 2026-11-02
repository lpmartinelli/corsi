import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODELLO_CSV, corsiDaCsv, leggiCsv } from '../public/importa.js';

const codici = ['BLSD', 'PBLSD', 'PTC'];

test('CSV con ; , virgolette e righe vuote', () => {
  assert.deepEqual(leggiCsv('﻿a;b\r\n"x;y";"di ""lui"""\r\n\r\n1;2'), [['a', 'b'], ['x;y', 'di "lui"'], ['1', '2']]);
  assert.deepEqual(leggiCsv('a,b\n1,2\n'), [['a', 'b'], ['1', '2']]);
});

test('il modello si importa senza errori', () => {
  const { righe, ignorate } = corsiDaCsv(MODELLO_CSV, codici);
  assert.deepEqual(ignorate, []);
  assert.deepEqual(righe.map((r) => r.errori), [[], []]);
  assert.deepEqual(righe[1].corso, {
    data: '2026-11-18', tipo: 'BLSD', retraining: true, categoria: 'ausl', circuito: null, certificazione: null,
    ora_inizio: '14:00', ora_fine: '18:00', istruttori_richiesti: 2, sede: 'Carpi', committente: null, note: 'Aula 2',
  });
  assert.equal(righe[0].corso.circuito, 'CoES');
  assert.equal(righe[0].corso.certificazione, 'irccom');
});

test('formati alternativi: orario unico, tipo con r, data breve', () => {
  const { righe } = corsiDaCsv('Giorno,Corso,Orario,Luogo\n3/11/26,BLSDr,8-13.30,Modena', codici);
  assert.deepEqual(righe[0].errori, []);
  assert.equal(righe[0].corso.data, '2026-11-03');
  assert.equal(righe[0].corso.tipo, 'BLSD');
  assert.equal(righe[0].corso.retraining, true);
  assert.equal(righe[0].corso.ora_inizio, '08:00');
  assert.equal(righe[0].corso.ora_fine, '13:30');
  assert.equal(righe[0].corso.categoria, 'volontari');
});

test('errori per riga, con il numero di riga del file', () => {
  const { righe, ignorate } = corsiDaCsv('Data;Tipo;Colore\n31/02/2026;XYZ;rosso\n;BLSD;', codici);
  assert.deepEqual(ignorate, ['Colore']);
  assert.equal(righe[0].riga, 2);
  assert.equal(righe[0].errori.length, 2);
  assert.deepEqual(righe[1].errori, ['manca la data']);
});

test('senza intestazione il file è rifiutato', () => {
  assert.throws(() => corsiDaCsv('15/11/2026;BLSD', codici), /Data e Tipo/);
});
