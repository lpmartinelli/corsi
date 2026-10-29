// Regole di composizione della squadra di un corso.
// Non bloccano mai un'assegnazione: producono avvisi che il coordinatore può ignorare.

const RISPOSTE = { no: 'ha risposto NO', forse: 'ha risposto FORSE' };

/** Chi riceve la richiesta di disponibilità per un corso: attivo, abilitato e, per i corsi AUSL, iscritto all'albo. */
export function puoRicevere(istruttore, corso) {
  return Boolean(istruttore.attivo)
    && istruttore.abilitazioni.includes(corso.tipo)
    && (corso.categoria !== 'ausl' || Boolean(istruttore.albo_ausl));
}

/**
 * @param corso   { tipo, categoria, istruttori_richiesti }
 * @param squadra [{ istruttore: { id, nome, cognome, profilo, direttore, attivo, albo_ausl, abilitazioni[] },
 *                   ruolo, disponibilita: 'si'|'no'|'forse'|null, altriCorsiStessoGiorno }]
 * @returns [{ codice, messaggio, istruttore_id? }]
 */
export function verificaSquadra(corso, squadra) {
  const avvisi = [];

  if (squadra.length < corso.istruttori_richiesti) {
    avvisi.push({
      codice: 'SQUADRA_INCOMPLETA',
      messaggio: `Assegnati ${squadra.length} su ${corso.istruttori_richiesti} richiesti`,
    });
  }

  const direttori = squadra.filter((m) => m.ruolo === 'direttore').length;
  if (direttori === 0) {
    avvisi.push({ codice: 'SENZA_DIRETTORE', messaggio: 'Nessun direttore assegnato' });
  } else if (direttori > 1) {
    avvisi.push({ codice: 'PIU_DIRETTORI', messaggio: `${direttori} direttori assegnati` });
  }

  const tecnici = squadra.filter((m) => m.istruttore.profilo === 'tecnico').length;
  const sanitari = squadra.length - tecnici;
  if (tecnici > sanitari) {
    avvisi.push({
      codice: 'TECNICI_SENZA_SANITARI',
      messaggio: `${tecnici} tecnici e ${sanitari} sanitari: serve un sanitario per ogni tecnico`,
    });
  }

  for (const m of squadra) {
    const i = m.istruttore;
    const chi = `${i.nome} ${i.cognome}`;
    const avviso = (codice, testo) =>
      avvisi.push({ codice, messaggio: `${chi}: ${testo}`, istruttore_id: i.id });

    if (!i.attivo) avviso('INATTIVO', 'istruttore non attivo');
    if (!i.abilitazioni.includes(corso.tipo)) avviso('NON_ABILITATO', `non abilitato ${corso.tipo}`);
    if (corso.categoria === 'ausl' && !i.albo_ausl) avviso('NON_ALBO', 'non iscritto all\'albo formatori AUSL');
    if (m.ruolo === 'direttore' && !i.direttore) avviso('NON_DIRETTORE', 'non ha la qualifica di direttore');
    if (m.disponibilita == null) avviso('SENZA_RISPOSTA', 'non ha dato disponibilità');
    else if (RISPOSTE[m.disponibilita]) avviso('NON_DISPONIBILE', RISPOSTE[m.disponibilita]);
    if (m.altriCorsiStessoGiorno > 0) avviso('DOPPIO_IMPEGNO', 'già assegnato a un altro corso lo stesso giorno');
  }

  return avvisi;
}
