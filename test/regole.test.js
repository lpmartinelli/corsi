import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puoRicevere, verificaSquadra } from '../src/regole.js';

const corso = { tipo: 'BLSD', istruttori_richiesti: 2 };

function membro(id, profilo, { ruolo = 'istruttore', direttore = false, abilitazioni = ['BLSD'], disponibilita = 'si', altri = 0, attivo = true } = {}) {
  return {
    istruttore: { id, nome: 'N' + id, cognome: 'C' + id, profilo, direttore, attivo, abilitazioni },
    ruolo,
    disponibilita,
    altriCorsiStessoGiorno: altri,
  };
}

const codici = (avvisi) => avvisi.map((a) => a.codice).sort();

test('squadra regolare: nessun avviso', () => {
  const squadra = [
    membro(1, 'sanitario', { ruolo: 'direttore', direttore: true }),
    membro(2, 'tecnico'),
  ];
  assert.deepEqual(verificaSquadra(corso, squadra), []);
});

test('solo sanitari: nessun limite', () => {
  const squadra = [
    membro(1, 'sanitario', { ruolo: 'direttore', direttore: true }),
    membro(2, 'sanitario'),
    membro(3, 'sanitario'),
  ];
  assert.deepEqual(verificaSquadra(corso, squadra), []);
});

test('più tecnici che sanitari', () => {
  const squadra = [
    membro(1, 'sanitario', { ruolo: 'direttore', direttore: true }),
    membro(2, 'tecnico'),
    membro(3, 'tecnico'),
  ];
  assert.deepEqual(codici(verificaSquadra(corso, squadra)), ['TECNICI_SENZA_SANITARI']);
});

test('squadra vuota', () => {
  assert.deepEqual(codici(verificaSquadra(corso, [])), ['SENZA_DIRETTORE', 'SQUADRA_INCOMPLETA']);
});

test('avvisi sul singolo istruttore', () => {
  const squadra = [
    membro(1, 'sanitario', { ruolo: 'direttore', direttore: false, abilitazioni: ['PTC'], disponibilita: null }),
    membro(2, 'sanitario', { disponibilita: 'no', altri: 1, attivo: false }),
  ];
  assert.deepEqual(codici(verificaSquadra(corso, squadra)), [
    'DOPPIO_IMPEGNO', 'INATTIVO', 'NON_ABILITATO', 'NON_DIRETTORE', 'NON_DISPONIBILE', 'SENZA_RISPOSTA',
  ]);
});

test('corso AUSL: serve l\'albo formatori', () => {
  const corsoAusl = { ...corso, categoria: 'ausl' };
  const squadra = [
    membro(1, 'sanitario', { ruolo: 'direttore', direttore: true }),
    membro(2, 'sanitario'),
  ];
  squadra[1].istruttore.albo_ausl = 1;
  assert.deepEqual(codici(verificaSquadra(corsoAusl, squadra)), ['NON_ALBO']);
});

test('chi riceve la richiesta', () => {
  const i = { attivo: 1, albo_ausl: 0, abilitazioni: ['BLSD'] };
  assert.equal(puoRicevere(i, { tipo: 'BLSD', categoria: 'volontari' }), true);
  assert.equal(puoRicevere(i, { tipo: 'PTC', categoria: 'volontari' }), false);
  assert.equal(puoRicevere(i, { tipo: 'BLSD', categoria: 'ausl' }), false);
  assert.equal(puoRicevere({ ...i, albo_ausl: 1 }, { tipo: 'BLSD', categoria: 'ausl' }), true);
  assert.equal(puoRicevere({ ...i, attivo: 0 }, { tipo: 'BLSD', categoria: 'volontari' }), false);
});

test('un direttore può fare da istruttore senza avvisi', () => {
  const squadra = [
    membro(1, 'sanitario', { ruolo: 'direttore', direttore: true }),
    membro(2, 'sanitario', { direttore: true }),
  ];
  assert.deepEqual(verificaSquadra(corso, squadra), []);
});
