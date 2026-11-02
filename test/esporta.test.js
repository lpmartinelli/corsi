import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileExcel } from '../public/esporta.js';

const testo = (b) => new TextDecoder().decode(b);

test('il file Excel è uno zip con il foglio dentro', () => {
  const file = fileExcel('Istruttori', ['Cognome', 'Telefono', 'Giornate'], [['Desandré', '+39 333 1234567', 4], ['A & <B>', null, 0]]);
  assert.equal(testo(file.slice(0, 2)), 'PK');
  const contenuto = testo(file);
  assert.match(contenuto, /xl\/worksheets\/sheet1\.xml/);
  assert.match(contenuto, /<c r="A2" t="inlineStr"><is><t xml:space="preserve">Desandré<\/t>/);
  // Il telefono resta testo, i numeri restano numeri
  assert.match(contenuto, /<c r="B2" t="inlineStr"><is><t xml:space="preserve">\+39 333 1234567<\/t>/);
  assert.match(contenuto, /<c r="C3"><v>0<\/v><\/c>/);
  assert.match(contenuto, /A &amp; &lt;B&gt;/);
});
