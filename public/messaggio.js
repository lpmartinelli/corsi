// Testo dei messaggi WhatsApp di richiesta disponibilità.
// Usato dall'app e dalla pagina dell'istruttore; nessuna dipendenza dal browser, così è testabile con node.

const SEZIONI = [
  ['ausl', 'Corsi AUSL'],
  ['formazione', 'Volontari del soccorso - formazione'],
  ['retraining', 'Volontari del soccorso - retraining'],
];

export function sezioneDi(corso) {
  if (corso.categoria === 'ausl') return 'ausl';
  return corso.retraining ? 'retraining' : 'formazione';
}

const ora = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':');
  return m === '00' ? h : `${h}:${m}`;
};

export const dataBreve = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function orario(corso) {
  if (!corso.ora_inizio) return '';
  return corso.ora_fine ? `${ora(corso.ora_inizio)}-${ora(corso.ora_fine)}` : ora(corso.ora_inizio);
}

/** Una riga nel formato in uso: "01/01 08-13 BLSD", "01/01 SEDE 08-17", "01/01 ASSOCIAZIONE/SEDE 19-23". */
export function rigaCorso(corso) {
  const parti = { ausl: [orario(corso), corso.tipo + (corso.retraining ? 'r' : '')],
    formazione: [corso.sede, orario(corso)],
    retraining: [[corso.committente, corso.sede].filter(Boolean).join('/'), orario(corso)] }[sezioneDi(corso)];
  return [dataBreve(corso.data), ...parti].filter(Boolean).join(' ');
}

/** Corsi raggruppati nelle tre sezioni, in ordine di data e ora; le sezioni vuote sono omesse. */
export function sezioni(corsi) {
  const ordinati = [...corsi].sort((a, b) => (a.data + (a.ora_inizio || '')).localeCompare(b.data + (b.ora_inizio || '')));
  return SEZIONI
    .map(([chiave, titolo]) => ({ chiave, titolo, corsi: ordinati.filter((c) => sezioneDi(c) === chiave) }))
    .filter((s) => s.corsi.length);
}

export function testoMessaggio(istruttore, corsi, link, scadenzaIso) {
  const blocchi = sezioni(corsi).map((s) => [s.titolo, ...s.corsi.map(rigaCorso)].join('\n'));
  return [
    `Ciao ${istruttore.nome}, raccolgo le disponibilità per questi corsi:`,
    ...blocchi,
    `Indica le tue disponibilità da qui (link personale, valido fino al ${dataBreve(scadenzaIso.slice(0, 10))}):\n${link}`,
  ].join('\n\n');
}

/** Numero in formato internazionale senza "+" (wa.me lo richiede così); i cellulari italiani senza prefisso diventano 39... */
export function numeroWhatsApp(telefono) {
  let n = (telefono || '').replace(/[^\d+]/g, '');
  if (n.startsWith('+')) n = n.slice(1);
  else if (n.startsWith('00')) n = n.slice(2);
  else if (n.startsWith('3') && n.length === 10) n = '39' + n;
  return n.length >= 8 ? n : null;
}

export function linkWhatsApp(telefono, testo) {
  const numero = numeroWhatsApp(telefono);
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(testo)}` : null;
}
