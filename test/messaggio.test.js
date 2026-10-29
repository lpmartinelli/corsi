import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkWhatsApp, numeroWhatsApp, rigaCorso, testoMessaggio } from '../public/messaggio.js';

const ausl = { categoria: 'ausl', tipo: 'BLSD', retraining: 0, data: '2026-11-03', ora_inizio: '08:00', ora_fine: '13:00' };
const auslR = { ...ausl, retraining: 1, ora_inizio: '14:00', ora_fine: '18:00' };
const formazione = { categoria: 'volontari', tipo: 'BLSD', retraining: 0, data: '2026-11-01', sede: 'Modena', ora_inizio: '08:00', ora_fine: '17:00' };
const retraining = { ...formazione, retraining: 1, committente: 'Croce Blu', sede: 'Carpi', ora_inizio: '19:00', ora_fine: '23:30' };

test('righe nel formato in uso', () => {
  assert.equal(rigaCorso(ausl), '03/11 08-13 BLSD');
  assert.equal(rigaCorso(auslR), '03/11 14-18 BLSDr');
  assert.equal(rigaCorso(formazione), '01/11 Modena 08-17');
  assert.equal(rigaCorso(retraining), '01/11 Croce Blu/Carpi 19-23:30');
});

test('campi mancanti non lasciano spazi doppi', () => {
  assert.equal(rigaCorso({ ...formazione, sede: null, ora_inizio: null }), '01/11');
});

test('messaggio con sezioni ordinate e link', () => {
  const testo = testoMessaggio({ nome: 'Anna' }, [retraining, auslR, ausl], 'https://x/d/abc', '2026-11-28T10:00:00.000Z');
  assert.equal(testo, [
    'Ciao Anna, raccolgo le disponibilità per questi corsi:',
    'Corsi AUSL\n03/11 08-13 BLSD\n03/11 14-18 BLSDr',
    'Volontari del soccorso - retraining\n01/11 Croce Blu/Carpi 19-23:30',
    'Indica le tue disponibilità da qui (link personale, valido fino al 28/11):\nhttps://x/d/abc',
  ].join('\n\n'));
});

test('numeri WhatsApp', () => {
  assert.equal(numeroWhatsApp('333 123 4567'), '393331234567');
  assert.equal(numeroWhatsApp('+39 333-1234567'), '393331234567');
  assert.equal(numeroWhatsApp('0039 3331234567'), '393331234567');
  assert.equal(numeroWhatsApp(''), null);
  assert.equal(linkWhatsApp(null, 'x'), null);
  assert.equal(linkWhatsApp('3331234567', 'a b'), 'https://wa.me/393331234567?text=a%20b');
});
