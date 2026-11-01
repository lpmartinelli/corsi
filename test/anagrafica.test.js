import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codiceFiscaleValido, emailValida, normalizzaCodiceFiscale } from '../src/anagrafica.js';

test('codice fiscale: carattere di controllo', () => {
  assert.ok(codiceFiscaleValido('RSSMRA85T10A562S'));
  assert.ok(!codiceFiscaleValido('RSSMRA85T10A562T'));
  assert.ok(!codiceFiscaleValido('RSSMRA85T10A562'));
});

test('codice fiscale omocodico', () => {
  // 562 → 5N2: cambia anche il carattere di controllo
  assert.ok(codiceFiscaleValido('RSSMRA85T10A5N2Z'));
});

test('codice fiscale scritto minuscolo e con spazi', () => {
  assert.equal(normalizzaCodiceFiscale(' rssmra 85t10 a562s '), 'RSSMRA85T10A562S');
});

test('email', () => {
  assert.ok(emailValida('mario.rossi@example.it'));
  assert.ok(!emailValida('mario.rossi@example'));
  assert.ok(!emailValida('mario rossi@example.it'));
});
