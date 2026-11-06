// Import dei corsi da file CSV (anche salvato da Excel, con ; o , come separatore)

/** Righe e celle di un CSV. Il separatore si riconosce dalla prima riga; tra virgolette "" vale come virgoletta. */
export function leggiCsv(testo) {
  testo = testo.replace(/^﻿/, '');
  const prima = testo.split(/\r?\n/, 1)[0];
  const sep = [';', ',', '\t'].reduce((a, b) => (prima.split(b).length > prima.split(a).length ? b : a));
  const righe = [];
  let riga = [];
  let cella = '';
  let virgolette = false;
  for (let i = 0; i < testo.length; i++) {
    const ch = testo[i];
    if (virgolette) {
      if (ch === '"' && testo[i + 1] === '"') { cella += '"'; i++; }
      else if (ch === '"') virgolette = false;
      else cella += ch;
    } else if (ch === '"' && !cella.trim()) {
      virgolette = true;
      cella = '';
    } else if (ch === sep) {
      riga.push(cella);
      cella = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && testo[i + 1] === '\n') i++;
      riga.push(cella);
      righe.push(riga);
      riga = [];
      cella = '';
    } else cella += ch;
  }
  if (cella || riga.length) righe.push([...riga, cella]);
  return righe.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

// Nomi accettati per ogni colonna, dopo aver tolto maiuscole, accenti e punteggiatura
const COLONNE = {
  data: ['data', 'giorno'],
  numero: ['numero', 'numero_corso', 'numero_di_corso', 'n_corso', 'n_di_corso'],
  tipo: ['tipo', 'corso', 'tipo_corso', 'tipo_di_corso'],
  categoria: ['categoria'],
  circuito: ['circuito', 'coes_vda'],
  certificazione: ['certificazione', 'irc_irccom'],
  retraining: ['retraining'],
  orario: ['orario', 'ore'],
  ora_inizio: ['ora_inizio', 'inizio', 'dalle'],
  ora_fine: ['ora_fine', 'fine', 'alle'],
  sede: ['sede', 'luogo'],
  committente: ['committente', 'cliente'],
  istruttori_richiesti: ['istruttori', 'istruttori_richiesti', 'n_istruttori', 'istruttori_richiesti_direttore_incluso'],
  note: ['note'],
};

export const MODELLO_CSV = [
  'Data;Numero di corso;Categoria;IRC / IRCcom;CoES / VdA;Tipo;Retraining;Ora inizio;Ora fine;Sede;Committente;Istruttori;Note',
  '15/11/2026;12;Volontari;IRCcom;CoES;BLSD;;08:00;17:00;Modena;Croce Blu;3;',
  '18/11/2026;;AUSL;;;BLSD;sì;14:00;18:00;Carpi;;2;Aula 2',
].join('\r\n') + '\r\n';

const normalizza = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

function dataIso(v) {
  let m;
  if ((m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return giornoValido(m[1], m[2], m[3]);
  if ((m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/))) return giornoValido(m[3].length === 2 ? '20' + m[3] : m[3], m[2], m[1]);
  return null;
}

function giornoValido(anno, mese, giorno) {
  const d = new Date(Date.UTC(Number(anno), Number(mese) - 1, Number(giorno)));
  return d.getUTCMonth() === Number(mese) - 1 && d.getUTCDate() === Number(giorno) ? d.toISOString().slice(0, 10) : null;
}

/** "8", "8.30", "08:30", "08:30:00" → "08:30" */
function ora(v) {
  const m = v.match(/^(\d{1,2})(?:[:.](\d{2}))?(?::\d{2})?$/);
  if (!m || Number(m[1]) > 23 || Number(m[2] || 0) > 59) return null;
  return `${m[1].padStart(2, '0')}:${m[2] || '00'}`;
}

const vero = (v) => /^(s[iì]|x|1|true|vero|yes|r)$/i.test(v);

/** Il tipo può portare la r del retraining attaccata, come nei messaggi: "BLSDr", "BLSD retraining". */
function tipoCorso(v, codici) {
  const t = v.toUpperCase().replace(/\s+/g, '');
  if (codici.includes(t)) return { tipo: t, retraining: false };
  for (const coda of ['RETRAINING', 'R']) {
    if (t.endsWith(coda) && codici.includes(t.slice(0, -coda.length))) return { tipo: t.slice(0, -coda.length), retraining: true };
  }
  return null;
}

function corsoDaRiga(v, codici) {
  const errori = [];
  const corso = {};

  corso.data = dataIso(v.data || '');
  if (!corso.data) errori.push(v.data ? `data non valida: ${v.data}` : 'manca la data');

  const tipo = tipoCorso(v.tipo || '', codici);
  if (tipo) Object.assign(corso, tipo);
  else errori.push(v.tipo ? `tipo sconosciuto: ${v.tipo} (validi: ${codici.join(', ')})` : 'manca il tipo');
  if (v.retraining) corso.retraining = corso.retraining || vero(v.retraining);

  const cat = v.categoria || '';
  corso.categoria = !cat || /volont/i.test(cat) ? 'volontari' : /ausl/i.test(cat) ? 'ausl' : null;
  if (!corso.categoria) errori.push(`categoria non valida: ${cat} (AUSL o Volontari)`);

  const circ = (v.circuito || '').toLowerCase();
  corso.circuito = { '': null, coes: 'CoES', vda: 'VdA' }[circ];
  if (corso.circuito === undefined) errori.push(`CoES / VdA non valido: ${v.circuito}`);

  const cert = (v.certificazione || '').toLowerCase().replace(/\s+/g, '');
  corso.certificazione = { '': null, irc: 'irc', irccom: 'irccom' }[cert];
  if (corso.certificazione === undefined) errori.push(`IRC / IRCcom non valido: ${v.certificazione}`);

  let [inizio, fine] = [v.ora_inizio || '', v.ora_fine || ''];
  if (v.orario && !inizio && !fine) [inizio = '', fine = ''] = v.orario.split(/\s*[-–]\s*/);
  for (const [campo, valore] of [['ora_inizio', inizio], ['ora_fine', fine]]) {
    corso[campo] = valore ? ora(valore) : null;
    if (valore && !corso[campo]) errori.push(`orario non valido: ${valore}`);
  }

  const n = v.istruttori_richiesti ? Number(v.istruttori_richiesti) : 2;
  corso.istruttori_richiesti = Number.isInteger(n) && n >= 1 ? n : null;
  if (!corso.istruttori_richiesti) errori.push(`numero di istruttori non valido: ${v.istruttori_richiesti}`);

  corso.numero = v.numero || null;
  corso.sede = v.sede || null;
  corso.committente = v.committente || null;
  corso.note = v.note || null;
  return { corso, errori };
}

/**
 * Corsi letti da un CSV con riga di intestazione. Per ogni riga: il numero di riga nel file,
 * il corso pronto da salvare e gli errori (una riga con errori non si importa).
 */
export function corsiDaCsv(testo, codici) {
  const [intestazione, ...righe] = leggiCsv(testo);
  const indici = {};
  const ignorate = [];
  (intestazione || []).forEach((nome, i) => {
    const campo = Object.keys(COLONNE).find((k) => COLONNE[k].includes(normalizza(nome)));
    if (campo && !(campo in indici)) indici[campo] = i;
    else if (nome) ignorate.push(nome);
  });
  if (!('data' in indici) || !('tipo' in indici)) {
    throw new Error('La prima riga del file deve contenere i nomi delle colonne, almeno Data e Tipo');
  }
  return {
    ignorate,
    righe: righe.map((r, n) => ({
      riga: n + 2,
      ...corsoDaRiga(Object.fromEntries(Object.entries(indici).map(([k, i]) => [k, r[i] || ''])), codici),
    })),
  };
}
