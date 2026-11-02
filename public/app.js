import { MODELLO_CSV, corsiDaCsv } from '/importa.js';
import { linkWhatsApp, rigaCorso, sezioni, testoMessaggio } from '/messaggio.js';

const app = document.getElementById('app');
const dialogo = document.getElementById('dialogo');
const dialogoForm = document.getElementById('dialogo-form');

let io = null;
let abilitazioni = [];
let stati = []; // stati dei corsi, modificabili dalle Impostazioni

// ---------- Utilità ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function api(metodo, percorso, body) {
  const res = await fetch('/api' + percorso, {
    method: metodo,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const dati = await res.json().catch(() => ({}));
  if (res.status === 401 && io) {
    // Sessione scaduta: si torna al login
    io = null;
    mostraIntestazione();
    naviga();
  }
  if (!res.ok) throw new Error(dati.errore || `Errore ${res.status}`);
  return dati;
}

const formatoData = (iso) => iso ? new Date(iso + 'T12:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '';
const nomeCompleto = (i) => `${i.cognome} ${i.nome}`;
const ETICHETTE_RISPOSTA = { si: 'Sì', forse: 'Forse', no: 'No' };
const etichettaRisposta = (r) => r ? `<span class="etichetta ${r}">${ETICHETTE_RISPOSTA[r]}</span>` : '<span class="etichetta neutro">—</span>';

/** Apre un modulo nel dialogo. Restituisce i valori inseriti, o null se annullato. */
function modulo(titolo, campi, valori = {}) {
  dialogoForm.innerHTML = `<h2>${esc(titolo)}</h2>` + campi.map((c) => campoHtml(c, valori[c.nome])).join('') +
    `<p class="errore" id="errore-modulo" hidden></p>
     <div class="azioni"><button value="annulla" formnovalidate>Annulla</button><button value="ok" class="primario">Salva</button></div>`;
  collegaLivelli(dialogoForm);
  if (campi.some((c) => c.nome === 'certificazioni')) {
    collegaCertificazioni(dialogoForm, (k) => dialogoForm.querySelector(`[name="certificazioni"][value="${k}"]`));
  }
  dialogo.returnValue = '';
  dialogo.showModal();
  return new Promise((resolve) => {
    dialogo.onclose = () => {
      if (dialogo.returnValue !== 'ok') return resolve(null);
      const dati = {};
      for (const c of campi) {
        if (c.tipo === 'checkbox') dati[c.nome] = dialogoForm.elements[c.nome].checked;
        else if (c.tipo === 'checks') dati[c.nome] = [...dialogoForm.querySelectorAll(`[name="${c.nome}"]:checked`)].map((e) => e.value);
        else if (c.tipo === 'livelli') {
          dati[c.nome] = Object.fromEntries(CERTIFICAZIONI.map(([k]) =>
            [k, Object.fromEntries(c.opzioni.map(([v]) => [v, livelloSpuntato(dialogoForm, `${c.nome}:${k}:${v}`)]))]));
        }
        else dati[c.nome] = dialogoForm.elements[c.nome].value;
      }
      resolve(dati);
    };
  });
}

function campoHtml(c, valore) {
  const req = c.obbligatorio ? 'required' : '';
  if (c.tipo === 'checkbox') {
    return `<label class="check"><input type="checkbox" name="${c.nome}" ${valore ? 'checked' : ''}> ${esc(c.etichetta)}</label>`;
  }
  if (c.tipo === 'checks') {
    return `<label>${esc(c.etichetta)}<span class="checks">${c.opzioni.map(([v, t]) =>
      `<label class="check"><input type="checkbox" name="${c.nome}" value="${esc(v)}" ${(valore || []).includes(v) ? 'checked' : ''}> ${esc(t)}</label>`).join('')}</span></label>`;
  }
  // Un livello per voce e certificazione (0 = no, 1 = istruttore, 2 = direttore); il valore è { irc: { voce: livello }, irccom: {...} }
  if (c.tipo === 'livelli') {
    return `<div class="campo">${esc(c.etichetta)}<table class="livelli">
      <thead><tr><th rowspan="2"></th>${CERTIFICAZIONI.map(([k, t]) => `<th colspan="2" class="gruppo" data-cert="${k}">${t}</th>`).join('')}</tr>
        <tr>${CERTIFICAZIONI.map(([k]) => `<th class="gruppo" data-cert="${k}">${LIVELLI[1]}</th><th data-cert="${k}">${LIVELLI[2]}</th>`).join('')}</tr></thead>
      <tbody>${c.opzioni.map(([v, t]) => `<tr><th>${esc(t)}</th>${CERTIFICAZIONI.map(([k, tk]) => [1, 2].map((n) => `
        <td class="${n === 1 ? 'gruppo' : ''}" data-cert="${k}"><input type="checkbox" name="${c.nome}:${k}:${esc(v)}:${n}"
          aria-label="${esc(t)} ${tk} ${LIVELLI[n].toLowerCase()}" ${(valore?.[k]?.[v] || 0) >= n ? 'checked' : ''}></td>`).join('')).join('')}</tr>`).join('')}
      </tbody></table></div>`;
  }
  if (c.tipo === 'select') {
    return `<label>${esc(c.etichetta)}<select name="${c.nome}" ${req}>${c.opzioni.map(([v, t]) =>
      `<option value="${esc(v)}" ${String(v) === String(valore ?? '') ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  }
  if (c.tipo === 'textarea') {
    return `<label>${esc(c.etichetta)}<textarea name="${c.nome}" rows="3">${esc(valore)}</textarea></label>`;
  }
  return `<label>${esc(c.etichetta)}<input type="${c.tipo || 'text'}" name="${c.nome}" value="${esc(valore)}" ${req} ${c.extra || ''}></label>`;
}

const livelloSpuntato = (form, nome) => (form.elements[`${nome}:2`].checked ? 2 : form.elements[`${nome}:1`].checked ? 1 : 0);

// Chi dirige una disciplina la insegna anche: Direttore spunta Istruttore, togliere Istruttore toglie Direttore
function collegaLivelli(radice) {
  radice.querySelectorAll('.livelli input').forEach((x) => x.onchange = () => {
    const [istruttore, direttore] = [1, 2].map((n) => radice.querySelector(`[name="${CSS.escape(`${x.name.slice(0, -2)}:${n}`)}"]`));
    if (x === direttore && direttore.checked) istruttore.checked = true;
    if (x === istruttore && !istruttore.checked) direttore.checked = false;
  });
}

// Nella tabella delle abilitazioni si vedono solo le certificazioni spuntate; senza certificazioni la tabella non c'è
function collegaCertificazioni(radice, casella) {
  const tabella = radice.querySelector('.livelli');
  if (!tabella) return;
  const aggiorna = () => {
    for (const [k] of CERTIFICAZIONI) tabella.querySelectorAll(`[data-cert="${k}"]`).forEach((el) => el.hidden = !casella(k).checked);
    tabella.closest('.campo').hidden = !CERTIFICAZIONI.some(([k]) => casella(k).checked);
  };
  CERTIFICAZIONI.forEach(([k]) => casella(k).addEventListener('change', aggiorna));
  aggiorna();
}

/** Ripete il modulo finché il salvataggio non riesce o l'utente annulla. */
async function moduloESalva(titolo, campi, valori, salva) {
  let dati = valori;
  while (true) {
    dati = await modulo(titolo, campi, dati);
    if (!dati) return false;
    try {
      await salva(dati);
      return true;
    } catch (e) {
      alert(e.message);
    }
  }
}

// ---------- Corsi ----------

const nomeStato = (codice) => stati.find((s) => s.codice === codice)?.etichetta || codice;
const CATEGORIE = [['volontari', 'Volontari del soccorso'], ['ausl', 'AUSL']];
const nomeTipo = (c) => c.tipo + (c.retraining ? 'r' : '');
const LIVELLI = ['—', 'Istruttore', 'Direttore'];
const CERTIFICAZIONI = [['irc', 'IRC'], ['irccom', 'IRCcom']];
const NOMI_CERTIFICAZIONI = Object.fromEntries(CERTIFICAZIONI);
const nomeCategoria = (c) => (c.categoria === 'ausl' ? 'AUSL' : 'Volontari') + (c.certificazione ? ` · ${NOMI_CERTIFICAZIONI[c.certificazione]}` : '')
  + (c.circuito ? ` · ${c.circuito}` : '') + (c.retraining ? ' · retraining' : '');
// Es. "BLSD IRCcom", o solo "BLSD" se il corso non indica la certificazione
const disciplina = (c) => c.tipo + (c.certificazione ? ` ${NOMI_CERTIFICAZIONI[c.certificazione]}` : '');
// Le abilitazioni valgono 0, 1 (istruttore) o 2 (direttore) per ogni certificazione
const conLivello = (nome, livello) => livello && nome + (livello === 2 ? ' dir.' : '');
const nomiCertificazioni = (i) => CERTIFICAZIONI.filter(([k]) => i[k]).map(([, t]) => t);
const certificazioni = (i) => nomiCertificazioni(i).join(' + ');
// Es. "BLSD IRC dir. / IRCcom"
const abilitazioniIstruttore = (i) => ordinaAbilitazioni(i.abilitazioni).map((a) =>
  `${a} ${CERTIFICAZIONI.filter(([k]) => i.livelli[k][a]).map(([k, t]) => conLivello(t, i.livelli[k][a])).join(' / ')}`);

async function campiCorso() {
  const [committenti, utenti] = await Promise.all([api('GET', '/committenti'), api('GET', '/utenti')]);
  return [
    { nome: 'data', etichetta: 'Data', tipo: 'date', obbligatorio: true },
    { nome: 'categoria', etichetta: 'Categoria', tipo: 'select', opzioni: CATEGORIE },
    { nome: 'certificazione', etichetta: 'IRC / IRCcom', tipo: 'select', opzioni: [['', '—'], ...CERTIFICAZIONI] },
    { nome: 'circuito', etichetta: 'CoES / VdA', tipo: 'select', opzioni: [['', '—'], ['CoES', 'CoES'], ['VdA', 'VdA']] },
    { nome: 'tipo', etichetta: 'Tipo di corso', tipo: 'select', opzioni: abilitazioni.map((a) => [a.codice, a.codice]) },
    { nome: 'retraining', etichetta: 'Retraining', tipo: 'checkbox' },
    { nome: 'ora_inizio', etichetta: 'Ora inizio', tipo: 'time' },
    { nome: 'ora_fine', etichetta: 'Ora fine', tipo: 'time' },
    { nome: 'sede', etichetta: 'Sede' },
    { nome: 'committente_id', etichetta: 'Committente', tipo: 'select', opzioni: [['', '—'], ...committenti.map((c) => [c.id, c.nome])] },
    { nome: 'istruttori_richiesti', etichetta: 'Istruttori richiesti (direttore incluso)', tipo: 'number', extra: 'min="1"' },
    { nome: 'coordinatore_id', etichetta: 'Coordinato da', tipo: 'select', opzioni: [['', '—'], ...utenti.filter((u) => u.attivo).map((u) => [u.id, u.nome])] },
    { nome: 'stato', etichetta: 'Stato', tipo: 'select', opzioni: stati.map((s) => [s.codice, s.etichetta]) },
    { nome: 'note', etichetta: 'Note', tipo: 'textarea' },
  ];
}

async function paginaCorsi() {
  const oggi = new Date().toISOString().slice(0, 10);
  const passati = location.hash.includes('passati');
  const corsi = await api('GET', passati ? `/corsi?a=${oggi}` : `/corsi?da=${oggi}`);
  if (passati) corsi.reverse();

  // Si seleziona per eliminare o, tra i corsi futuri da organizzare, per richiedere disponibilità; quelli in bozza sono preselezionati
  const richiedibile = (c) => !passati && ['bozza', 'richiesta'].includes(c.stato);
  app.innerHTML = `
    <div class="barra">
      <h1>Corsi</h1>
      <div>
        <a class="bottone" href="${passati ? '#/corsi' : '#/corsi/passati'}">${passati ? 'Prossimi' : 'Passati'}</a>
        ${passati ? '' : '<button id="richiedi">Richiedi disponibilità</button>'}
        <button id="modello">Scarica modello</button>
        <button id="importa">Importa da file</button><input type="file" id="file-import" accept=".csv,.txt,text/csv" hidden>
        <button class="primario" id="nuovo">Nuovo corso</button>
      </div>
    </div>
    <div class="tabella"><table>
      <thead><tr><th><input type="checkbox" id="sel-tutti" title="Seleziona tutti"></th><th>Data</th><th>Categoria</th><th>Tipo</th><th>Orario</th><th>Sede</th><th>Committente</th><th>Squadra</th><th>Disponibili</th><th>Stato</th></tr></thead>
      <tbody>${corsi.map((c) => `
        <tr class="cliccabile ${c.stato === 'annullato' ? 'spento' : ''}" data-id="${c.id}">
          <td><input type="checkbox" data-sel="${c.id}" ${richiedibile(c) && c.stato === 'bozza' ? 'checked' : ''}></td>
          <td>${formatoData(c.data)}</td><td>${esc(nomeCategoria(c))}</td><td>${esc(nomeTipo(c))}</td>
          <td>${esc(c.ora_inizio || '')}${c.ora_fine ? '–' + esc(c.ora_fine) : ''}</td>
          <td>${esc(c.sede)}</td><td>${esc(c.committente)}</td>
          <td><span class="etichetta ${c.assegnati >= c.istruttori_richiesti ? 'si' : 'neutro'}">${c.assegnati}/${c.istruttori_richiesti}</span></td>
          <td>${c.disponibili}</td>
          <td>${esc(nomeStato(c.stato))}</td>
        </tr>`).join('') || `<tr><td colspan="10" class="muted">Nessun corso</td></tr>`}
      </tbody>
    </table></div>
    <div class="azioni"><button id="elimina-sel">Elimina selezionati</button></div>`;

  const selezionati = () => corsi.filter((c) => app.querySelector(`[data-sel="${c.id}"]`).checked);
  const richiedi = document.getElementById('richiedi');
  const eliminaSel = document.getElementById('elimina-sel');
  const tutti = document.getElementById('sel-tutti');
  const aggiorna = () => {
    const sel = selezionati();
    const daRichiedere = sel.filter(richiedibile).length;
    if (richiedi) {
      richiedi.textContent = `Richiedi disponibilità (${daRichiedere})`;
      richiedi.disabled = !daRichiedere;
    }
    eliminaSel.textContent = `Elimina selezionati (${sel.length})`;
    eliminaSel.disabled = !sel.length;
    tutti.checked = corsi.length > 0 && sel.length === corsi.length;
  };
  aggiorna();
  app.querySelectorAll('[data-sel]').forEach((x) => {
    x.onclick = (ev) => ev.stopPropagation();
    x.onchange = aggiorna;
  });
  tutti.onchange = () => {
    app.querySelectorAll('[data-sel]').forEach((x) => x.checked = tutti.checked);
    aggiorna();
  };
  if (richiedi) richiedi.onclick = () => location.hash = `#/nuova-richiesta/${selezionati().filter(richiedibile).map((c) => c.id).join(',')}`;

  eliminaSel.onclick = async () => {
    const sel = selezionati();
    const organizzati = sel.filter((c) => c.assegnati || c.stato !== 'bozza').length;
    const elenco = sel.slice(0, 15).map((c) => `• ${formatoData(c.data)} ${nomeTipo(c)}${c.sede ? ' · ' + c.sede : ''}`).join('\n')
      + (sel.length > 15 ? `\n… e altri ${sel.length - 15}` : '');
    if (!confirm(`Eliminare ${sel.length} corsi?\n\n${elenco}\n\n`
      + (organizzati ? `${organizzati} non sono in bozza o hanno istruttori assegnati: si perdono anche disponibilità e assegnazioni.\n` : '')
      + 'Per un corso cancellato dal committente è meglio impostare lo stato "Annullato".')) return;
    try {
      await api('POST', '/corsi/elimina', { ids: sel.map((c) => c.id) });
    } catch (e) {
      alert(e.message);
    }
    paginaCorsi();
  };

  app.querySelectorAll('tr[data-id]').forEach((tr) => tr.onclick = () => location.hash = `#/corso/${tr.dataset.id}`);
  document.getElementById('nuovo').onclick = async () => {
    let nuovoId;
    const ok = await moduloESalva('Nuovo corso', await campiCorso(), { istruttori_richiesti: 2, stato: 'bozza', coordinatore_id: io.id },
      async (d) => ({ id: nuovoId } = await api('POST', '/corsi', d)));
    if (ok) location.hash = `#/corso/${nuovoId}`;
  };

  document.getElementById('modello').onclick = scaricaModello;
  const file = document.getElementById('file-import');
  document.getElementById('importa').onclick = () => file.click();
  file.onchange = async () => {
    if (!file.files[0]) return;
    const dati = await file.files[0].arrayBuffer();
    file.value = '';
    // Excel salva i CSV in UTF-8 solo se richiesto; altrimenti in Windows-1252
    let testo;
    try {
      testo = new TextDecoder('utf-8', { fatal: true }).decode(dati);
    } catch {
      testo = new TextDecoder('windows-1252').decode(dati);
    }
    await importaCorsi(testo);
    paginaCorsi();
  };
}

// ---------- Import dei corsi da file ----------

// Il BOM serve a Excel per aprire il file in UTF-8 senza rovinare gli accenti
function scaricaModello() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + MODELLO_CSV], { type: 'text/csv' }));
  a.download = 'modello-corsi.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importaCorsi(testo) {
  let letti;
  try {
    letti = corsiDaCsv(testo, abilitazioni.map((a) => a.codice));
  } catch (e) {
    return alert(`${e.message}.\n\nSe il file è un foglio Excel, salvalo come "CSV (delimitato dal separatore di elenco)".`);
  }
  const committenti = new Set((await api('GET', '/committenti')).map((c) => c.nome.toLowerCase()));
  const buone = letti.righe.filter((r) => !r.errori.length);
  const conErrori = letti.righe.length - buone.length;

  dialogoForm.innerHTML = `
    <h2>Importa corsi</h2>
    <p>${buone.length} corsi pronti da importare in bozza${conErrori ? `, <strong class="errore">${conErrori} righe con errori</strong> (non saranno importate)` : ''}.
      I corsi già presenti (stessa data, tipo, ora di inizio e sede) vengono saltati.</p>
    ${letti.ignorate.length ? `<p class="muted">Colonne ignorate: ${esc(letti.ignorate.join(', '))}</p>` : ''}
    <div class="tabella"><table>
      <thead><tr><th>Riga</th><th>Data</th><th>Categoria</th><th>Tipo</th><th>Orario</th><th>Sede</th><th>Committente</th><th>Istr.</th></tr></thead>
      <tbody>${letti.righe.map(({ riga, corso: c, errori }) => errori.length
        ? `<tr><td>${riga}</td><td colspan="7" class="errore">${esc(errori.join('; '))}</td></tr>`
        : `<tr><td>${riga}</td><td>${formatoData(c.data)}</td><td>${esc(nomeCategoria(c))}</td><td>${esc(nomeTipo(c))}</td>
            <td>${esc(c.ora_inizio || '')}${c.ora_fine ? '–' + esc(c.ora_fine) : ''}</td><td>${esc(c.sede)}</td>
            <td>${esc(c.committente)}${c.committente && !committenti.has(c.committente.toLowerCase()) ? ' <span class="etichetta forse">Nuovo</span>' : ''}</td>
            <td>${c.istruttori_richiesti}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Il file non contiene corsi</td></tr>'}
      </tbody>
    </table></div>
    <div class="azioni">
      <button type="button" id="modello">Scarica modello</button>
      <button value="annulla" formnovalidate>Annulla</button>
      <button value="ok" class="primario" ${buone.length ? '' : 'disabled'}>Importa ${buone.length} corsi</button>
    </div>`;
  dialogoForm.querySelector('#modello').onclick = scaricaModello;
  dialogo.classList.add('largo');
  dialogo.returnValue = '';
  dialogo.showModal();
  const conferma = await new Promise((resolve) => dialogo.onclose = () => resolve(dialogo.returnValue === 'ok'));
  dialogo.classList.remove('largo');
  if (!conferma) return;

  try {
    const esito = await api('POST', '/corsi/importa', { corsi: buone.map((r) => r.corso) });
    alert([`Corsi importati: ${esito.importati}`,
      esito.gia_presenti && `Già presenti, saltati: ${esito.gia_presenti}`,
      esito.nuovi_committenti && `Committenti creati: ${esito.nuovi_committenti}`].filter(Boolean).join('\n'));
  } catch (e) {
    alert(e.message);
  }
}

// ---------- Dettaglio corso: disponibilità e assegnazioni ----------

async function paginaCorso(id) {
  disegnaCorso(await api('GET', `/corsi/${id}`));
}

function disegnaCorso({ corso, candidati, avvisi }) {
  const squadra = candidati.filter((c) => c.ruolo);
  app.innerHTML = `
    <div class="barra">
      <h1>${esc(nomeTipo(corso))} · ${formatoData(corso.data)}</h1>
      <div><button id="modifica">Modifica</button> <button id="elimina">Elimina</button></div>
    </div>
    <div class="scheda">
      <div><span>Categoria</span>${esc(nomeCategoria(corso))}</div>
      <div><span>Orario</span>${esc(corso.ora_inizio || '—')}${corso.ora_fine ? '–' + esc(corso.ora_fine) : ''}</div>
      <div><span>Sede</span>${esc(corso.sede || '—')}</div>
      <div><span>Committente</span>${esc(corso.committente || '—')}</div>
      <div><span>Squadra</span>${squadra.length}/${corso.istruttori_richiesti}</div>
      <div><span>Stato</span>${esc(nomeStato(corso.stato))}</div>
      ${corso.note ? `<div><span>Note</span>${esc(corso.note)}</div>` : ''}
    </div>
    ${avvisi.length
      ? `<div class="avvisi"><strong>Da verificare</strong><ul>${avvisi.map((a) => `<li>${esc(a.messaggio)}</li>`).join('')}</ul></div>`
      : '<div class="tutto-ok">Squadra completa e regolare</div>'}
    <h2>Istruttori</h2>
    <p class="muted">Ordinati per disponibilità, abilitazione e giornate svolte negli ultimi 12 mesi (le meno, prima).</p>
    <div class="tabella"><table>
      <thead><tr><th>Istruttore</th><th>Profilo</th><th>Abilitato</th><th>Disponibilità</th><th>Giornate 12 mesi</th><th>Ultimo corso</th><th>Assegnazione</th></tr></thead>
      <tbody>${candidati.filter((c) => c.attivo || c.ruolo).map((c) => `
        <tr class="${c.ruolo ? 'assegnato' : ''}">
          <td>${esc(nomeCompleto(c))}${c.livello === 2 ? ' <span class="etichetta neutro">Dir</span>' : ''}${c.altri_stesso_giorno ? ' <span class="etichetta no">Già impegnato</span>' : ''}</td>
          <td>${c.profilo === 'sanitario' ? 'Sanitario' : 'Tecnico'}</td>
          <td>${c.abilitato ? '✓' : '<span class="etichetta no">No</span>'}</td>
          <td><select data-disp="${c.id}">${[['', '—'], ['si', 'Sì'], ['forse', 'Forse'], ['no', 'No']].map(([v, t]) =>
            `<option value="${v}" ${v === (c.disponibilita || '') ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
          <td>${c.giornate}</td>
          <td>${c.ultimo_corso ? formatoData(c.ultimo_corso) : '—'}</td>
          <td>${c.ruolo
            ? `<strong>${c.ruolo === 'direttore' ? 'Direttore' : 'Istruttore'}</strong> <button class="piccolo" data-rimuovi="${c.id}">Rimuovi</button>`
            : `<button class="piccolo" data-assegna="${c.id}" data-ruolo="direttore">Direttore</button>
               <button class="piccolo" data-assegna="${c.id}" data-ruolo="istruttore">Istruttore</button>`}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;

  document.getElementById('modifica').onclick = async () => {
    if (await moduloESalva('Modifica corso', await campiCorso(), corso, (d) => api('PUT', `/corsi/${corso.id}`, d))) paginaCorso(corso.id);
  };
  document.getElementById('elimina').onclick = async () => {
    if (!confirm('Eliminare il corso con le sue disponibilità e assegnazioni? Per un corso cancellato dal committente è meglio impostare lo stato "Annullato".')) return;
    await api('DELETE', `/corsi/${corso.id}`);
    location.hash = '#/corsi';
  };
  app.querySelectorAll('[data-disp]').forEach((sel) => sel.onchange = async () =>
    disegnaCorso(await api('PUT', `/corsi/${corso.id}/disponibilita`, { istruttore_id: Number(sel.dataset.disp), risposta: sel.value || null })));
  app.querySelectorAll('[data-rimuovi]').forEach((b) => b.onclick = async () =>
    disegnaCorso(await api('DELETE', `/corsi/${corso.id}/assegnazioni/${b.dataset.rimuovi}`)));
  app.querySelectorAll('[data-assegna]').forEach((b) => b.onclick = async () => {
    const c = candidati.find((x) => x.id === Number(b.dataset.assegna));
    const problemi = problemiCandidato(corso, c, b.dataset.ruolo);
    if (problemi.length && !confirm(`${nomeCompleto(c)}:\n• ${problemi.join('\n• ')}\n\nAssegnare comunque?`)) return;
    disegnaCorso(await api('POST', `/corsi/${corso.id}/assegnazioni`, { istruttore_id: c.id, ruolo: b.dataset.ruolo }));
  });
}

// Le regole complete sono sul server (src/regole.js); qui solo quelle sul singolo istruttore, per chiedere conferma prima
function problemiCandidato(corso, c, ruolo) {
  const p = [];
  // c.livello arriva dal server: 0, 1 (istruttore) o 2 (direttore), nella certificazione del corso se indicata
  if (c.livello < 1) p.push(`non abilitato ${disciplina(corso)}`);
  if (corso.categoria === 'ausl' && !c.albo_ausl) p.push('non iscritto all\'albo formatori AUSL');
  if (ruolo === 'direttore' && c.livello < 2) p.push(`non è direttore ${disciplina(corso)}`);
  if (!c.disponibilita) p.push('non ha dato disponibilità');
  else if (c.disponibilita !== 'si') p.push(`ha risposto ${ETICHETTE_RISPOSTA[c.disponibilita].toUpperCase()}`);
  if (c.altri_stesso_giorno) p.push('già assegnato a un altro corso lo stesso giorno');
  return p;
}

// ---------- Richieste di disponibilità (invii) ----------

async function paginaInvii() {
  const invii = await api('GET', '/invii');
  app.innerHTML = `
    <div class="barra"><h1>Richieste di disponibilità</h1></div>
    <p class="muted">Per una nuova richiesta seleziona i corsi nella pagina <a href="#/corsi">Corsi</a> e premi "Richiedi disponibilità".</p>
    <div class="tabella"><table>
      <thead><tr><th>Creata</th><th>Da</th><th>Corsi</th><th>Periodo</th><th>Messaggi inviati</th></tr></thead>
      <tbody>${invii.map((v) => `
        <tr class="cliccabile" data-id="${v.id}">
          <td>${formatoData(v.creato_il.slice(0, 10))}</td><td>${esc(v.creato_da)}</td><td>${v.corsi}</td>
          <td>${v.dal ? `${formatoData(v.dal)} – ${formatoData(v.al)}` : '—'}</td>
          <td><span class="etichetta ${v.inviate === v.richieste ? 'si' : 'neutro'}">${v.inviate}/${v.richieste}</span></td>
        </tr>`).join('') || `<tr><td colspan="5" class="muted">Nessuna richiesta</td></tr>`}
      </tbody>
    </table></div>`;
  app.querySelectorAll('tr[data-id]').forEach((tr) => tr.onclick = () => location.hash = `#/invio/${tr.dataset.id}`);
}

const FILTRI_IRC = [['', 'Tutti gli istruttori'], ['irc', 'IRC'], ['irccom', 'IRCcom'], ['entrambi', 'IRC e IRCcom (entrambi)']];
const FILTRI_CIRCUITO = [['', 'Tutti i corsi'], ['CoES', 'Solo CoES'], ['VdA', 'Solo VdA']];

/** Scelta dei destinatari: tabella istruttori × corsi, già spuntata con la proposta delle regole e modificabile a mano. */
async function paginaNuovaRichiesta(ids) {
  const { corsi, istruttori } = await api('GET', `/invii/anteprima?corsi=${ids.join(',')}`);
  if (!corsi.length) {
    app.innerHTML = '<p class="errore">Nessun corso valido selezionato.</p><p><a href="#/corsi">Torna ai corsi</a></p>';
    return;
  }
  const chiave = (i, c) => `${i.id}:${c.id}`;
  const idoneo = (i, c) => i.idonei.includes(c.id);
  const proposta = () => new Set(istruttori.flatMap((i) => corsi.filter((c) => idoneo(i, c)).map((c) => chiave(i, c))));
  const stato = { spunte: proposta(), irc: '', circuito: '' };

  const visibiliIstruttori = () => istruttori.filter((i) => ({
    '': true, irc: i.irc, irccom: i.irccom, entrambi: i.irc && i.irccom,
  })[stato.irc]);
  const visibiliCorsi = () => corsi.filter((c) => !stato.circuito || c.circuito === stato.circuito);
  const scelta = () => visibiliIstruttori()
    .map((i) => ({ istruttore: i, corsi: visibiliCorsi().filter((c) => stato.spunte.has(chiave(i, c))) }))
    .filter((d) => d.corsi.length);

  function disegna() {
    const righe = visibiliIstruttori();
    const colonne = visibiliCorsi();
    const destinatari = scelta();
    app.innerHTML = `
      <div class="barra">
        <h1>Nuova richiesta di disponibilità</h1>
        <button class="primario" id="crea" ${destinatari.length ? '' : 'disabled'}>Crea ${destinatari.length} messaggi</button>
      </div>
      <p class="muted">Le spunte propongono chi può tenere ogni corso (abilitazione, albo AUSL). Puoi toglierle o aggiungerne:
        ogni istruttore riceverà un messaggio con i soli corsi spuntati.</p>
      <div class="filtri">
        <select id="f-irc">${FILTRI_IRC.map(([v, t]) => `<option value="${v}" ${v === stato.irc ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <select id="f-circuito">${FILTRI_CIRCUITO.map(([v, t]) => `<option value="${v}" ${v === stato.circuito ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <button id="proposta">Ripristina proposta</button>
        <button id="svuota">Togli tutte le spunte</button>
      </div>
      <div class="tabella"><table class="matrice">
        <thead><tr><th>Istruttore</th>${colonne.map((c) => `
          <th><label class="check"><input type="checkbox" data-col="${c.id}" ${righe.every((i) => stato.spunte.has(chiave(i, c))) && righe.length ? 'checked' : ''}>
            ${esc(rigaCorso(c))}</label><span class="muted">${esc(nomeCategoria(c))}</span></th>`).join('')}</tr></thead>
        <tbody>${righe.map((i) => `
          <tr>
            <th><label class="check"><input type="checkbox" data-riga="${i.id}" ${colonne.every((c) => stato.spunte.has(chiave(i, c))) ? 'checked' : ''}>
              ${esc(nomeCompleto(i))}</label>
              <span class="muted">${esc([certificazioni(i), i.albo_ausl ? 'Albo AUSL' : '', i.abilitazioni.join(' ')].filter(Boolean).join(' · '))}
              · ${i.giornate} gg</span></th>
            ${colonne.map((c) => `<td class="${idoneo(i, c) ? '' : 'fuori'}" title="${idoneo(i, c) ? '' : 'Fuori dalle regole (abilitazione o albo AUSL)'}">
              <input type="checkbox" data-cella="${chiave(i, c)}" ${stato.spunte.has(chiave(i, c)) ? 'checked' : ''}></td>`).join('')}
          </tr>`).join('') || `<tr><td colspan="${colonne.length + 1}" class="muted">Nessun istruttore con questo filtro</td></tr>`}
        </tbody>
      </table></div>`;

    const imposta = (chiavi, valore) => {
      chiavi.forEach((k) => (valore ? stato.spunte.add(k) : stato.spunte.delete(k)));
      disegna();
    };
    document.getElementById('f-irc').onchange = (ev) => { stato.irc = ev.target.value; disegna(); };
    document.getElementById('f-circuito').onchange = (ev) => { stato.circuito = ev.target.value; disegna(); };
    document.getElementById('proposta').onclick = () => { stato.spunte = proposta(); disegna(); };
    document.getElementById('svuota').onclick = () => { stato.spunte.clear(); disegna(); };
    app.querySelectorAll('[data-cella]').forEach((x) => x.onchange = () => imposta([x.dataset.cella], x.checked));
    app.querySelectorAll('[data-riga]').forEach((x) => x.onchange = () =>
      imposta(colonne.map((c) => `${x.dataset.riga}:${c.id}`), x.checked));
    app.querySelectorAll('[data-col]').forEach((x) => x.onchange = () =>
      imposta(righe.map((i) => `${i.id}:${x.dataset.col}`), x.checked));

    document.getElementById('crea').onclick = async () => {
      const fuori = destinatari.flatMap((d) => d.corsi.filter((c) => !idoneo(d.istruttore, c)).map((c) => `${nomeCompleto(d.istruttore)}: ${rigaCorso(c)}`));
      if (fuori.length && !confirm(`Queste scelte sono fuori dalle regole (abilitazione o albo AUSL):\n• ${fuori.join('\n• ')}\n\nProcedere comunque?`)) return;
      try {
        const { invio } = await api('POST', '/invii', {
          destinatari: destinatari.map((d) => ({ istruttore_id: d.istruttore.id, corsi: d.corsi.map((c) => c.id) })),
        });
        location.hash = `#/invio/${invio.id}`;
      } catch (e) {
        alert(e.message);
      }
    };
  }
  disegna();
}

async function paginaInvio(id) {
  const { invio, corsi, richieste } = await api('GET', `/invii/${id}`);
  const perId = new Map(corsi.map((c) => [c.id, c]));
  const messaggio = (r) => testoMessaggio(r, r.corsi.map((cid) => perId.get(cid)), `${location.origin}/d/${r.token}`, r.scade_il);

  app.innerHTML = `
    <div class="barra">
      <h1>Richiesta del ${formatoData(invio.creato_il.slice(0, 10))}</h1>
      <button id="elimina">Elimina</button>
    </div>
    <div class="scheda" style="display:block">
      ${sezioni(corsi).map((s) => `<p><strong>${esc(s.titolo)}</strong><br>${s.corsi.map((c) => esc(rigaCorso(c))).join('<br>')}</p>`).join('')}
    </div>
    <h2>Messaggi</h2>
    <p class="muted">Premi WhatsApp per aprire la chat con il messaggio già scritto: resta solo da inviarlo. Ogni link vale 30 giorni.</p>
    <div class="tabella"><table>
      <thead><tr><th>Istruttore</th><th>Corsi</th><th>Risposte</th><th>Inviato</th><th></th></tr></thead>
      <tbody>${richieste.map((r) => `
        <tr>
          <td>${esc(nomeCompleto(r))}${r.telefono ? '' : ' <span class="etichetta forse">Senza telefono</span>'}</td>
          <td>${r.corsi.length}</td>
          <td><span class="etichetta ${r.risposte === r.corsi.length ? 'si' : 'neutro'}">${r.risposte}/${r.corsi.length}</span></td>
          <td>${r.inviata_il ? '✓' : ''}</td>
          <td>
            ${linkWhatsApp(r.telefono, '') ? `<button class="piccolo primario" data-wa="${r.id}">WhatsApp</button>` : ''}
            <button class="piccolo" data-copia="${r.id}">Copia messaggio</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;

  const richiesta = (el, attr) => richieste.find((r) => r.id === Number(el.dataset[attr]));
  const segnaInviata = async (r) => {
    if (!r.inviata_il) await api('POST', `/richieste/${r.id}/inviata`);
  };
  app.querySelectorAll('[data-wa]').forEach((b) => b.onclick = async () => {
    const r = richiesta(b, 'wa');
    window.open(linkWhatsApp(r.telefono, messaggio(r)), '_blank', 'noopener');
    await segnaInviata(r);
    paginaInvio(id);
  });
  app.querySelectorAll('[data-copia]').forEach((b) => b.onclick = async () => {
    const r = richiesta(b, 'copia');
    await navigator.clipboard.writeText(messaggio(r));
    await segnaInviata(r);
    b.textContent = 'Copiato';
    setTimeout(() => paginaInvio(id), 800);
  });
  document.getElementById('elimina').onclick = async () => {
    if (!confirm('Eliminare questa richiesta? I link smetteranno di funzionare; le disponibilità già date restano.')) return;
    await api('DELETE', `/invii/${id}`);
    location.hash = '#/richieste';
  };
}

// ---------- Istruttori ----------

function campiIstruttore() {
  return [
    { nome: 'nome', etichetta: 'Nome', obbligatorio: true },
    { nome: 'cognome', etichetta: 'Cognome', obbligatorio: true },
    { nome: 'codice_fiscale', etichetta: 'Codice fiscale', extra: 'maxlength="20" spellcheck="false" style="text-transform: uppercase"' },
    { nome: 'telefono', etichetta: 'Telefono (WhatsApp)', tipo: 'tel', extra: 'placeholder="+39 333 1234567"' },
    { nome: 'email', etichetta: 'Email', tipo: 'email' },
    { nome: 'profilo', etichetta: 'Profilo', tipo: 'select', opzioni: [['sanitario', 'Sanitario'], ['tecnico', 'Tecnico']] },
    { nome: 'albo_ausl', etichetta: 'Iscritto all\'albo formatori AUSL', tipo: 'checkbox' },
    { nome: 'certificazioni', etichetta: 'Certificazioni', tipo: 'checks', opzioni: CERTIFICAZIONI },
    { nome: 'livelli', etichetta: 'Abilitazioni', tipo: 'livelli', opzioni: abilitazioni.map((a) => [a.codice, a.codice]) },
    { nome: 'attivo', etichetta: 'Attivo', tipo: 'checkbox' },
    { nome: 'note', etichetta: 'Note', tipo: 'textarea' },
  ];
}

// Nel modulo istruttore le certificazioni sono un elenco; l'API usa irc e irccom
function inModulo(i) {
  return { ...i, certificazioni: CERTIFICAZIONI.map(([k]) => k).filter((k) => i[k]) };
}

function daModulo({ certificazioni, ...dati }) {
  return { ...dati, ...Object.fromEntries(CERTIFICAZIONI.map(([k]) => [k, certificazioni.includes(k)])) };
}

const eDirettore = (i) => i.direzioni.length > 0;

// Abilitazioni nell'ordine dell'elenco generale; quelle sconosciute in fondo, alfabetiche.
function ordinaAbilitazioni(codici) {
  const pos = (c) => { const p = abilitazioni.findIndex((a) => a.codice === c); return p < 0 ? Infinity : p; };
  return [...codici].sort((a, b) => pos(a) - pos(b) || a.localeCompare(b));
}

function gruppoEtichette(voci, classe) {
  return voci.length ? `<div class="etichette">${voci.map((v) => `<span class="etichetta ${classe}">${esc(v)}</span>`).join('')}</div>` : '';
}

const FILTRI_STATO_ISTRUTTORE = [['', 'Attivi e disattivati'], ['attivi', 'Solo attivi'], ['disattivati', 'Solo disattivati']];
const FILTRI_PROFILO = [['', 'Tutti i profili'], ['sanitario', 'Sanitari'], ['tecnico', 'Tecnici']];
const FILTRI_QUALIFICA = [['', 'Tutte le qualifiche'], ['direttore', 'Direttori'], ['albo_ausl', 'Albo AUSL'], ['irc', 'IRC'], ['irccom', 'IRCcom'],
  ['da_verificare', 'Da verificare']];

// Restano impostati tornando sulla pagina dopo una modifica
const filtriIstruttori = { testo: '', stato: '', profilo: '', qualifica: '', abilitazione: '' };

function istruttoreVisibile(i, f) {
  const testo = f.testo.trim().toLowerCase();
  if (testo && ![i.nome, i.cognome, i.telefono, i.email, i.codice_fiscale].some((v) => v && String(v).toLowerCase().includes(testo))) return false;
  if (f.stato === 'attivi' && !i.attivo) return false;
  if (f.stato === 'disattivati' && i.attivo) return false;
  if (f.profilo && i.profilo !== f.profilo) return false;
  if (f.qualifica && !(f.qualifica === 'direttore' ? eDirettore(i) : i[f.qualifica])) return false;
  if (f.abilitazione && !i.abilitazioni.includes(f.abilitazione)) return false;
  return true;
}

async function paginaIstruttori() {
  const istruttori = await api('GET', '/istruttori');
  const admin = io.ruolo === 'admin';
  const daVerificare = istruttori.filter((i) => i.da_verificare).length;
  const f = filtriIstruttori;
  const opzioni = (voci, valore) => voci.map(([v, t]) => `<option value="${esc(v)}" ${v === valore ? 'selected' : ''}>${esc(t)}</option>`).join('');
  app.innerHTML = `
    <div class="barra"><h1>Istruttori</h1><div>
      <button id="link-anagrafica">Link per l'anagrafica</button>
      <button class="primario" id="nuovo">Nuovo istruttore</button>
    </div></div>
    ${daVerificare ? `<p class="muted">${daVerificare} ${daVerificare === 1 ? 'scheda compilata' : 'schede compilate'} dagli istruttori
      da verificare: aprila, controlla e salva.</p>` : ''}
    <div class="filtri">
      <input type="search" id="f-testo" placeholder="Cerca nome, telefono, email…" value="${esc(f.testo)}">
      <select id="f-stato">${opzioni(FILTRI_STATO_ISTRUTTORE, f.stato)}</select>
      <select id="f-profilo">${opzioni(FILTRI_PROFILO, f.profilo)}</select>
      <select id="f-qualifica">${opzioni(FILTRI_QUALIFICA, f.qualifica)}</select>
      <select id="f-abilitazione">${opzioni([['', 'Tutte le abilitazioni'], ...abilitazioni.map((a) => [a.codice, a.codice])], f.abilitazione)}</select>
      <button id="f-azzera">Azzera filtri</button>
      <span class="muted" id="f-conteggio"></span>
    </div>
    <div class="tabella adatta"><table>
      <thead><tr><th>Istruttore</th><th>Contatti</th><th>Qualifiche e abilitazioni</th><th class="numero">Giornate 12 mesi</th><th></th></tr></thead>
      <tbody></tbody>
    </table></div>`;

  const istruttore = (el, attr) => istruttori.find((x) => x.id === Number(el.dataset[attr]));
  const tbody = app.querySelector('tbody');
  // Si ridisegnano solo le righe, così la casella di ricerca non perde il cursore
  function disegnaRighe() {
    const visibili = istruttori.filter((i) => istruttoreVisibile(i, f));
    document.getElementById('f-conteggio').textContent = visibili.length === istruttori.length ? '' : `${visibili.length} di ${istruttori.length}`;
    tbody.innerHTML = visibili.map((i) => `
        <tr class="cliccabile ${i.attivo ? '' : 'spento'}" data-id="${i.id}">
          <td class="nominativo"><strong>${esc(i.cognome)}</strong><div>${esc(i.nome)}</div>
            <div class="muted">${i.profilo === 'sanitario' ? 'Sanitario' : 'Tecnico'}${i.attivo ? '' : ' · disattivato'}</div>
            ${i.da_verificare ? '<span class="etichetta forse">Da verificare</span>' : ''}</td>
          <td class="contatti"><div>${esc(i.telefono || '—')}</div>${i.email ? `<div class="muted" title="${esc(i.email)}">${esc(i.email)}</div>` : ''}</td>
          <td class="qualifiche">${gruppoEtichette([i.albo_ausl && 'Albo AUSL', ...nomiCertificazioni(i)].filter(Boolean), 'si')}
            ${gruppoEtichette(abilitazioniIstruttore(i), 'neutro')}</td>
          <td class="numero" data-etichetta="Giornate 12 mesi">${i.giornate}</td>
          <td class="azioni-riga">
            <button class="piccolo" data-attivo="${i.id}">${i.attivo ? 'Disattiva' : 'Riattiva'}</button>
            <button class="piccolo" data-elimina="${i.id}" ${admin ? '' : 'disabled title="Solo l\'amministratore può eliminare: puoi disattivare"'}>Elimina</button>
          </td>
        </tr>`).join('') || `<tr><td colspan="5" class="muted">${istruttori.length ? 'Nessun istruttore con questi filtri' : 'Nessun istruttore'}</td></tr>`;

    tbody.querySelectorAll('tr[data-id]').forEach((tr) => tr.onclick = async () => {
      const i = istruttore(tr, 'id');
      if (await moduloESalva('Modifica istruttore', campiIstruttore(), inModulo(i), (d) => api('PUT', `/istruttori/${i.id}`, daModulo(d)))) paginaIstruttori();
    });
    tbody.querySelectorAll('[data-attivo]').forEach((b) => b.onclick = async (ev) => {
      ev.stopPropagation();
      const i = istruttore(b, 'attivo');
      await api('PUT', `/istruttori/${i.id}/attivo`, { attivo: !i.attivo });
      paginaIstruttori();
    });
    tbody.querySelectorAll('[data-elimina]').forEach((b) => b.onclick = async (ev) => {
      ev.stopPropagation();
      const i = istruttore(b, 'elimina');
      if (!confirm(`Eliminare definitivamente ${nomeCompleto(i)}? Si perdono anche le sue disponibilità e richieste.`
        + (i.assegnazioni_totali ? `\n\nHa ${i.assegnazioni_totali} assegnazioni ai corsi (anche passati): verranno tolte dalle squadre.` : '')
        + '\n\nPer chi non insegna più è meglio "Disattiva": resta nello storico.')) return;
      try {
        await api('DELETE', `/istruttori/${i.id}`);
      } catch (e) {
        alert(e.message);
      }
      paginaIstruttori();
    });
  }
  disegnaRighe();

  document.getElementById('f-testo').oninput = (ev) => { f.testo = ev.target.value; disegnaRighe(); };
  for (const campo of ['stato', 'profilo', 'qualifica', 'abilitazione']) {
    document.getElementById(`f-${campo}`).onchange = (ev) => { f[campo] = ev.target.value; disegnaRighe(); };
  }
  document.getElementById('f-azzera').onclick = () => {
    Object.keys(f).forEach((k) => f[k] = '');
    paginaIstruttori();
  };
  document.getElementById('link-anagrafica').onclick = mostraLinkAnagrafica;
  document.getElementById('nuovo').onclick = async () => {
    if (await moduloESalva('Nuovo istruttore', campiIstruttore(), { attivo: true, profilo: 'sanitario' }, (d) => api('POST', '/istruttori', daModulo(d)))) paginaIstruttori();
  };
}

/** Link condiviso da mandare nella chat degli istruttori: ognuno compila la sua scheda. */
async function mostraLinkAnagrafica() {
  let { token } = await api('GET', '/istruttori/link');
  const disegna = () => {
    const link = `${location.origin}/a/${token}`;
    const messaggio = `Ciao a tutti, per organizzare i corsi mi servono i vostri dati da istruttori (codice fiscale, cellulare, email, abilitazioni). `
      + `Compilate qui, ci vuole un minuto:\n${link}`;
    dialogoForm.innerHTML = `
      <h2>Link per l'anagrafica</h2>
      <p>Mandalo nella chat degli istruttori: ognuno apre il link e inserisce i suoi dati.
        Chi è già in elenco (stesso nome e cognome) aggiorna la sua scheda, gli altri vengono aggiunti.
        Le schede compilate restano "Da verificare" finché non le apri e salvi.</p>
      ${token ? `
        <div class="link-attivazione"><input readonly value="${esc(link)}"><button type="button" id="copia">Copia link</button></div>
        <div><button type="button" id="copia-messaggio">Copia messaggio per WhatsApp</button></div>
        <p class="muted">Il link vale finché non lo disattivi o ne generi uno nuovo: fallo quando la raccolta è finita.</p>`
        : '<p class="muted">Nessun link attivo.</p>'}
      <div class="azioni">
        ${token ? '<button type="button" id="disattiva">Disattiva link</button>' : ''}
        <button type="button" id="genera">${token ? 'Genera nuovo link' : 'Crea link'}</button>
        <button value="ok" class="primario">Chiudi</button>
      </div>`;
    const copia = (id, testo) => {
      const b = dialogoForm.querySelector(id);
      if (b) b.onclick = async () => {
        await navigator.clipboard.writeText(testo);
        b.textContent = 'Copiato';
      };
    };
    copia('#copia', link);
    copia('#copia-messaggio', messaggio);
    dialogoForm.querySelector('#genera').onclick = async () => {
      if (token && !confirm('Il link attuale smetterà di funzionare. Generarne uno nuovo?')) return;
      ({ token } = await api('POST', '/istruttori/link'));
      disegna();
    };
    const disattiva = dialogoForm.querySelector('#disattiva');
    if (disattiva) disattiva.onclick = async () => {
      if (!confirm('Disattivare il link? Chi lo apre non potrà più compilare la scheda.')) return;
      ({ token } = await api('DELETE', '/istruttori/link'));
      disegna();
    };
  };
  disegna();
  dialogo.onclose = () => paginaIstruttori();
  dialogo.returnValue = '';
  dialogo.showModal();
}

// ---------- Committenti ----------

const CAMPI_COMMITTENTE = [
  { nome: 'nome', etichetta: 'Nome', obbligatorio: true },
  { nome: 'referente', etichetta: 'Referente' },
  { nome: 'indirizzo', etichetta: 'Indirizzo (per i preventivi)', extra: 'placeholder="Via A. Crétier, n.2 - 11100 Aosta"' },
  { nome: 'telefono', etichetta: 'Telefono', tipo: 'tel' },
  { nome: 'email', etichetta: 'Email', tipo: 'email' },
  { nome: 'note', etichetta: 'Note', tipo: 'textarea' },
];

async function paginaCommittenti() {
  const committenti = await api('GET', '/committenti');
  app.innerHTML = `
    <div class="barra"><h1>Committenti</h1><button class="primario" id="nuovo">Nuovo committente</button></div>
    <div class="tabella"><table>
      <thead><tr><th>Nome</th><th>Referente</th><th>Telefono</th><th>Email</th></tr></thead>
      <tbody>${committenti.map((c) => `
        <tr class="cliccabile" data-id="${c.id}"><td>${esc(c.nome)}</td><td>${esc(c.referente)}</td><td>${esc(c.telefono)}</td><td>${esc(c.email)}</td></tr>`).join('')
        || `<tr><td colspan="4" class="muted">Nessun committente</td></tr>`}
      </tbody>
    </table></div>`;

  document.getElementById('nuovo').onclick = async () => {
    if (await moduloESalva('Nuovo committente', CAMPI_COMMITTENTE, {}, (d) => api('POST', '/committenti', d))) paginaCommittenti();
  };
  app.querySelectorAll('tr[data-id]').forEach((tr) => tr.onclick = async () => {
    const c = committenti.find((x) => x.id === Number(tr.dataset.id));
    if (await moduloESalva('Modifica committente', CAMPI_COMMITTENTE, c, (d) => api('PUT', `/committenti/${c.id}`, d))) paginaCommittenti();
  });
}

// ---------- Preventivi ----------

const STATI_PREVENTIVO = [['bozza', 'Bozza'], ['inviato', 'Inviato'], ['accettato', 'Accettato'], ['rifiutato', 'Rifiutato']];
const CLASSI_STATO_PREVENTIVO = { bozza: 'neutro', inviato: 'forse', accettato: 'si', rifiutato: 'no' };
// Simbolo davanti, come nelle lettere in uso: € 750,00
const euro = (n) => '€ ' + (Number(n) || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numeroPreventivo = (p) => `${p.progressivo}/${p.anno}`;
const centesimi = (n) => Math.round(n * 100) / 100;
const OPZIONI_IVA = [['', '+ iva se dovuta'], ['22', 'IVA 22%'], ['0', 'Esente IVA']];
const conIva = (p) => p.iva === null || p.iva === '';

// Intestazione, firma, piede, logo e testi predefiniti stanno nelle impostazioni (pagina Impostazioni)
// Nel modello della voce: {tipo} = tipo di corso, {moduli} = "1 modulo" / "2 moduli", {allievi} = allievi per modulo
function descrizioneVoce(imp, r) {
  const moduli = Number(r.quantita) || 0;
  return (imp.voce || '').replaceAll('{tipo}', r.tipo || '').replaceAll('{moduli}', `${moduli} ${moduli === 1 ? 'modulo' : 'moduli'}`)
    .replaceAll('{allievi}', r.allievi ?? '').replace(/\s+/g, ' ').trim();
}
const oggettoPer = (imp, tipo) => (imp.oggetto || '').replaceAll('{tipo}', tipo || '').replace(/\s+/g, ' ').trim();
const voceNuova = (imp, tipo) => {
  const r = { tipo, quantita: 1, allievi: imp.allievi ?? '', prezzo: imp.prezzo ?? '' };
  return { ...r, descrizione: descrizioneVoce(imp, r) };
};
const righeTesto = (s) => (s || '').split('\n').map(esc).join('<br>');

function totaliPreventivo(p) {
  const imponibile = centesimi(p.righe.reduce((s, r) => s + (Number(r.quantita) || 0) * (Number(r.prezzo) || 0), 0));
  const iva = centesimi(imponibile * (Number(p.iva) || 0) / 100);
  return { imponibile, iva, totale: centesimi(imponibile + iva) };
}

async function paginaPreventivi() {
  const preventivi = await api('GET', '/preventivi');
  app.innerHTML = `
    <div class="barra"><h1>Preventivi</h1><button class="primario" id="nuovo">Nuovo preventivo</button></div>
    <div class="tabella"><table>
      <thead><tr><th>Numero</th><th>Data</th><th>Committente</th><th>Oggetto</th><th>Totale</th><th>Stato</th></tr></thead>
      <tbody>${preventivi.map((p) => `
        <tr class="cliccabile ${p.stato === 'rifiutato' ? 'spento' : ''}" data-id="${p.id}">
          <td>${numeroPreventivo(p)}</td><td>${formatoData(p.data)}</td><td>${esc(p.committente)}</td><td>${esc(p.oggetto)}</td>
          <td>${conIva(p) ? `${euro(p.imponibile)} <span class="muted">+ iva</span>` : euro(centesimi(p.imponibile * (1 + p.iva / 100)))}</td>
          <td><span class="etichetta ${CLASSI_STATO_PREVENTIVO[p.stato]}">${STATI_PREVENTIVO.find(([v]) => v === p.stato)[1]}</span></td>
        </tr>`).join('') || `<tr><td colspan="6" class="muted">Nessun preventivo</td></tr>`}
      </tbody>
    </table></div>`;
  document.getElementById('nuovo').onclick = () => location.hash = '#/preventivo/nuovo';
  app.querySelectorAll('tr[data-id]').forEach((tr) => tr.onclick = () => location.hash = `#/preventivo/${tr.dataset.id}`);
}

/** Editor del preventivo: dati generali, voci con quantità e prezzo, totali aggiornati mentre si scrive. */
async function paginaPreventivo(id) {
  const [committenti, imp, salvato] = await Promise.all([api('GET', '/committenti'), api('GET', '/impostazioni'),
    id ? api('GET', `/preventivi/${id}`) : null]);
  const p = salvato || {
    data: new Date().toISOString().slice(0, 10), iva: '', stato: 'bozza', oggetto: oggettoPer(imp, abilitazioni[0]?.codice),
    premessa: imp.premessa, condizioni: imp.condizioni,
    righe: [voceNuova(imp, abilitazioni[0]?.codice || '')],
  };
  const righe = p.righe;
  const campi = [
    { nome: 'committente_id', etichetta: 'Committente', tipo: 'select', opzioni: [['', '—'], ...committenti.map((c) => [c.id, c.nome])] },
    { nome: 'data', etichetta: 'Data', tipo: 'date', obbligatorio: true },
    { nome: 'iva', etichetta: 'IVA', tipo: 'select', opzioni: OPZIONI_IVA },
    { nome: 'stato', etichetta: 'Stato', tipo: 'select', opzioni: STATI_PREVENTIVO },
    { nome: 'oggetto', etichetta: 'Oggetto' },
    { nome: 'premessa', etichetta: 'Premessa (prima delle voci)', tipo: 'textarea' },
  ];
  const campiFinali = [
    { nome: 'condizioni', etichetta: 'Condizioni e saluti (dopo le voci)', tipo: 'textarea' },
    { nome: 'note', etichetta: 'Note interne (non stampate)', tipo: 'textarea' },
  ];

  app.innerHTML = `
    <div class="barra">
      <h1>${salvato ? `Preventivo ${numeroPreventivo(p)}` : 'Nuovo preventivo'}</h1>
      <div>
        ${salvato ? '<button id="elimina">Elimina</button>' : ''}
        <button id="stampa">Stampa / PDF</button>
        <button class="primario" id="salva">Salva</button>
      </div>
    </div>
    <form id="preventivo" class="modulo-preventivo">${campi.map((c) => campoHtml(c, p[c.nome])).join('')}</form>
    <h2>Voci</h2>
    <div class="tabella"><table class="voci-preventivo">
      <thead><tr><th>Corso</th><th>Descrizione</th><th>Moduli / quantità</th><th>Allievi</th><th>Prezzo unitario (€)</th><th>Importo</th><th></th></tr></thead>
      <tbody id="voci"></tbody>
    </table></div>
    <p class="muted">Scegliendo il corso, moduli e allievi, la descrizione si scrive dal modello delle Impostazioni; poi si può ritoccare.
      Con "—" la voce è libera.</p>
    <div class="piede-preventivo"><button id="aggiungi">Aggiungi voce</button><div id="totali"></div></div>
    <form id="preventivo-fine" class="modulo-preventivo">${campiFinali.map((c) => campoHtml(c, p[c.nome])).join('')}</form>`;

  const form = document.getElementById('preventivo');
  const formFine = document.getElementById('preventivo-fine');
  const leggi = () => ({ ...Object.fromEntries(new FormData(form)), ...Object.fromEntries(new FormData(formFine)), righe });
  const aggiornaTotali = () => {
    const dati = leggi();
    const t = totaliPreventivo(dati);
    document.getElementById('totali').innerHTML = conIva(dati)
      ? `Costo complessivo <strong>${euro(t.imponibile)}</strong> + iva se dovuta`
      : `Imponibile <strong>${euro(t.imponibile)}</strong> · IVA <strong>${euro(t.iva)}</strong> · Totale <strong>${euro(t.totale)}</strong>`;
    righe.forEach((r, i) => app.querySelector(`[data-importo="${i}"]`).textContent = euro((Number(r.quantita) || 0) * (Number(r.prezzo) || 0)));
  };
  const disegnaVoci = () => {
    document.getElementById('voci').innerHTML = righe.map((r, i) => `
      <tr>
        <td><select data-voce="${i}" data-campo="tipo">${[['', '—'], ...abilitazioni.map((a) => [a.codice, a.codice])].map(([v, t]) =>
          `<option value="${esc(v)}" ${v === (r.tipo || '') ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></td>
        <td><input class="descrizione" data-voce="${i}" data-campo="descrizione" value="${esc(r.descrizione)}"></td>
        <td><input type="number" min="0" step="any" data-voce="${i}" data-campo="quantita" value="${esc(r.quantita)}"></td>
        <td><input type="number" min="0" step="1" data-voce="${i}" data-campo="allievi" value="${esc(r.allievi)}" ${r.tipo ? '' : 'disabled'}></td>
        <td><input type="number" min="0" step="0.01" data-voce="${i}" data-campo="prezzo" value="${esc(r.prezzo)}"></td>
        <td data-importo="${i}"></td>
        <td><button class="piccolo" data-togli="${i}" title="Togli voce">✕</button></td>
      </tr>`).join('') || '<tr><td colspan="7" class="muted">Nessuna voce</td></tr>';
    app.querySelectorAll('[data-voce]').forEach((x) => x.oninput = () => {
      const i = Number(x.dataset.voce);
      const r = righe[i];
      const tipoPrima = r.tipo;
      r[x.dataset.campo] = x.value;
      if (x.dataset.campo === 'tipo') {
        app.querySelector(`[data-voce="${i}"][data-campo="allievi"]`).disabled = !r.tipo;
        // L'oggetto segue il corso della prima voce finché non è stato scritto a mano
        if (i === 0 && form.elements.oggetto.value === oggettoPer(imp, tipoPrima)) form.elements.oggetto.value = oggettoPer(imp, r.tipo);
      }
      // Con un corso scelto, la descrizione si riscrive dal modello quando cambiano corso, moduli o allievi
      if (r.tipo && ['tipo', 'quantita', 'allievi'].includes(x.dataset.campo)) {
        r.descrizione = descrizioneVoce(imp, r);
        app.querySelector(`[data-voce="${i}"][data-campo="descrizione"]`).value = r.descrizione;
      }
      aggiornaTotali();
    });
    app.querySelectorAll('[data-togli]').forEach((b) => b.onclick = () => {
      righe.splice(Number(b.dataset.togli), 1);
      disegnaVoci();
    });
    aggiornaTotali();
  };
  disegnaVoci();
  form.oninput = aggiornaTotali;
  form.onsubmit = formFine.onsubmit = (ev) => ev.preventDefault();

  document.getElementById('aggiungi').onclick = () => {
    righe.push(voceNuova(imp, abilitazioni[0]?.codice || ''));
    disegnaVoci();
    app.querySelector(`[data-voce="${righe.length - 1}"][data-campo="tipo"]`).focus();
  };
  const salva = async () => {
    if (!form.reportValidity()) return null;
    try {
      return await api(salvato ? 'PUT' : 'POST', salvato ? `/preventivi/${salvato.id}` : '/preventivi', leggi());
    } catch (e) {
      alert(e.message);
      return null;
    }
  };
  document.getElementById('salva').onclick = async () => {
    const nuovo = await salva();
    if (!nuovo) return;
    if (salvato) paginaPreventivo(nuovo.id);
    else location.hash = `#/preventivo/${nuovo.id}`;
  };
  // Si salva prima di stampare: il numero lo assegna il server
  document.getElementById('stampa').onclick = async () => {
    const nuovo = await salva();
    if (!nuovo) return;
    await stampaPreventivo(nuovo, imp);
    if (salvato) paginaPreventivo(nuovo.id);
    else location.hash = `#/preventivo/${nuovo.id}`;
  };
  if (salvato) {
    document.getElementById('elimina').onclick = async () => {
      if (!confirm(`Eliminare il preventivo ${numeroPreventivo(p)}?`)) return;
      await api('DELETE', `/preventivi/${salvato.id}`);
      location.hash = '#/preventivi';
    };
  }
}

/** Documento da stampare (o salvare in PDF dal dialogo di stampa del browser). */
async function stampaPreventivo(p, imp) {
  const t = totaliPreventivo(p);
  // Con una sola voce da 1 basta la descrizione; altrimenti si mostra il conto di ogni voce
  const dettaglio = p.righe.length > 1 || p.righe.some((r) => r.quantita !== 1);
  const totale = conIva(p)
    ? `<strong>${euro(t.imponibile)} + iva</strong> se dovuta`
    : p.iva ? `<strong>${euro(t.imponibile)} + IVA ${p.iva.toLocaleString('it-IT')}% (${euro(t.iva)}) = ${euro(t.totale)}</strong>`
      : `<strong>${euro(t.imponibile)}</strong> esente IVA`;
  // Paragrafi separati da una riga vuota; "Etichetta: testo" diventa un punto dell'elenco, come "Sedi del corso:"
  const paragrafi = (p.condizioni || '').split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  const condizioni = paragrafi.map((s, i) => {
    const punto = s.match(/^([^:\n]{2,40}):\s*([\s\S]*)$/);
    if (punto) return `<ul class="elenco"><li><strong>${esc(punto[1])}:</strong> ${esc(punto[2])}</li></ul>`;
    return `<p class="${i === paragrafi.length - 1 ? 'saluti' : 'paragrafo'}">${esc(s)}</p>`;
  }).join('').replaceAll('</ul><ul class="elenco">', ''); // punti consecutivi in un solo elenco
  const dataLunga = new Date(p.data + 'T12:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  let foglio = document.getElementById('foglio-stampa');
  if (!foglio) {
    foglio = document.createElement('div');
    foglio.id = 'foglio-stampa';
    document.body.append(foglio);
  }
  const destinatario = [p.referente, p.committente].filter(Boolean);
  foglio.innerHTML = `
    <header class="mittente">
      <div><div class="nome">${esc(imp.nome)}</div><div>${esc(imp.sottotitolo)}</div></div>
      ${imp.logo ? `<img class="logo" src="${esc(imp.logo)}" alt="">` : ''}
    </header>
    ${destinatario.length ? `<div class="destinatario"><span class="spett">Spett.</span><div>
      ${destinatario.map((r, i) => `<div class="${i === destinatario.length - 1 ? 'ente' : 'persona'}">${esc(r)}</div>`).join('')}
      ${p.indirizzo ? `<div class="indirizzo">${esc(p.indirizzo)}</div>` : ''}</div></div>` : ''}
    ${p.oggetto ? `<p class="oggetto">Oggetto: ${esc(p.oggetto)}</p>` : ''}
    ${p.premessa ? `<p class="premessa">${esc(p.premessa)}</p>` : ''}
    <ul class="elenco voci">${p.righe.map((r, i) => `<li><strong>${esc(r.descrizione)}</strong>${dettaglio
      ? ` – ${r.quantita !== 1 ? `${r.quantita.toLocaleString('it-IT')} × ${euro(r.prezzo)} = ` : ''}${euro(r.quantita * r.prezzo)}` : ''}
      ${i === p.righe.length - 1 ? `<br><span class="sottolineato">Costo complessivo docenti:</span> ${totale}` : ''}</li>`).join('')}</ul>
    ${condizioni}
    <div class="chiusura"><span>${esc(imp.citta)} ${dataLunga}</span><span class="firma">${righeTesto(imp.firma)}</span></div>
    <footer>${righeTesto(imp.piede)}</footer>`;
  // Si stampa a logo caricato, altrimenti potrebbe mancare nel PDF
  const logo = foglio.querySelector('.logo');
  if (logo) await logo.decode().catch(() => logo.remove());
  window.print();
}

// ---------- Impostazioni (solo admin) ----------

const LATO_LOGO = 600; // px, il lato più lungo: basta per la stampa e tiene piccolo il dato salvato

/** Legge l'immagine scelta e la riduce in un PNG di al massimo LATO_LOGO px. */
async function logoDaFile(file) {
  const img = new Image();
  img.src = URL.createObjectURL(file);
  try {
    await img.decode();
  } catch {
    throw new Error('Il file scelto non è un\'immagine leggibile');
  } finally {
    URL.revokeObjectURL(img.src);
  }
  // Un SVG senza dimensioni proprie non si può ridimensionare
  if (!img.naturalWidth || !img.naturalHeight) throw new Error('Immagine senza dimensioni: usa un PNG o un JPEG');
  const scala = Math.min(1, LATO_LOGO / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scala);
  canvas.height = Math.round(img.naturalHeight * scala);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

const CAMPI_IMPOSTAZIONI = [
  ['Intestazione dei preventivi', [
    { nome: 'nome', etichetta: 'Nome' },
    { nome: 'sottotitolo', etichetta: 'Sottotitolo' },
    { nome: 'citta', etichetta: 'Città (accanto alla data, in fondo)' },
    { nome: 'firma', etichetta: 'Firma (una riga per riga)', tipo: 'textarea' },
    { nome: 'piede', etichetta: 'Piede di pagina (una riga per riga)', tipo: 'textarea' },
  ]],
  ['Testi predefiniti di un nuovo preventivo', [
    { nome: 'oggetto', etichetta: 'Oggetto ({tipo} = corso della prima voce)' },
    { nome: 'voce', etichetta: 'Modello della voce: {tipo} = corso, es. BLSD · {moduli} = "1 modulo" / "2 moduli" · {allievi} = allievi' },
    { nome: 'allievi', etichetta: 'Allievi per modulo', tipo: 'number', extra: 'min="0" step="1"' },
    { nome: 'prezzo', etichetta: 'Prezzo per modulo (€)', tipo: 'number', extra: 'min="0" step="0.01"' },
    { nome: 'premessa', etichetta: 'Premessa', tipo: 'textarea' },
    { nome: 'condizioni', etichetta: 'Condizioni e saluti ("Etichetta: testo" diventa un punto dell\'elenco)', tipo: 'textarea' },
  ]],
];

/** Tipi di corso e stati: si aggiungono e si tolgono subito, senza il pulsante Salva. */
function disegnaElenchiCorsi(contenitore) {
  const uso = (n, uno, molti) => (n ? `${n} ${n === 1 ? uno : molti}` : '');
  contenitore.innerHTML = `
    <h2>Tipi di corso</h2>
    <p class="muted">Sono anche le abilitazioni degli istruttori. Un tipo si può togliere solo se nessun corso lo usa.</p>
    <div class="tabella"><table>
      <thead><tr><th>Codice</th><th>Descrizione</th><th>Uso</th><th></th></tr></thead>
      <tbody>${abilitazioni.map((a) => `
        <tr><td><strong>${esc(a.codice)}</strong></td><td>${esc(a.descrizione)}</td>
          <td class="muted">${esc([uso(a.corsi, 'corso', 'corsi'), uso(a.istruttori, 'istruttore', 'istruttori')].filter(Boolean).join(' · ') || '—')}</td>
          <td class="azioni-riga"><button class="piccolo" data-togli-tipo="${esc(a.codice)}"
            ${a.corsi ? 'disabled title="Usato da corsi esistenti"' : ''}>Togli</button></td></tr>`).join('')
        || '<tr><td colspan="4" class="muted">Nessun tipo di corso</td></tr>'}
      </tbody>
    </table></div>
    <form class="filtri" id="nuovo-tipo">
      <input name="codice" placeholder="Codice, es. BLSD" required maxlength="20" spellcheck="false" style="text-transform: uppercase">
      <input name="descrizione" placeholder="Descrizione (facoltativa)" maxlength="120">
      <button class="primario">Aggiungi tipo</button>
    </form>

    <h2>Stati dei corsi</h2>
    <p class="muted">Bozza, Richiesta inviata e Annullato servono all'app e restano. Uno stato si può togliere solo se nessun corso lo usa.</p>
    <div class="tabella"><table>
      <thead><tr><th>Stato</th><th>Uso</th><th></th></tr></thead>
      <tbody>${stati.map((s) => `
        <tr><td><strong>${esc(s.etichetta)}</strong></td><td class="muted">${uso(s.corsi, 'corso', 'corsi') || '—'}</td>
          <td class="azioni-riga"><button class="piccolo" data-togli-stato="${esc(s.codice)}"
            ${s.sistema ? 'disabled title="Serve all\'app"' : s.corsi ? 'disabled title="Usato da corsi esistenti"' : ''}>Togli</button></td></tr>`).join('')}
      </tbody>
    </table></div>
    <form class="filtri" id="nuovo-stato">
      <input name="etichetta" placeholder="Nuovo stato, es. Da fatturare" required maxlength="40">
      <button class="primario">Aggiungi stato</button>
    </form>`;

  const esegui = async (azione) => {
    try {
      await azione();
      disegnaElenchiCorsi(contenitore);
    } catch (e) {
      alert(e.message);
    }
  };
  contenitore.querySelector('#nuovo-tipo').onsubmit = (ev) => {
    ev.preventDefault();
    esegui(async () => abilitazioni = await api('POST', '/abilitazioni', Object.fromEntries(new FormData(ev.target))));
  };
  contenitore.querySelector('#nuovo-stato').onsubmit = (ev) => {
    ev.preventDefault();
    esegui(async () => stati = await api('POST', '/stati', Object.fromEntries(new FormData(ev.target))));
  };
  contenitore.querySelectorAll('[data-togli-tipo]').forEach((b) => b.onclick = () => {
    const a = abilitazioni.find((x) => x.codice === b.dataset.togliTipo);
    if (!confirm(`Togliere il tipo di corso ${a.codice}?`
      + (a.istruttori ? `\n\n${a.istruttori} istruttori hanno questa abilitazione: verrà tolta dalle loro schede.` : ''))) return;
    esegui(async () => abilitazioni = await api('DELETE', `/abilitazioni/${encodeURIComponent(a.codice)}`));
  });
  contenitore.querySelectorAll('[data-togli-stato]').forEach((b) => b.onclick = () => {
    const s = stati.find((x) => x.codice === b.dataset.togliStato);
    if (!confirm(`Togliere lo stato "${s.etichetta}"?`)) return;
    esegui(async () => stati = await api('DELETE', `/stati/${encodeURIComponent(s.codice)}`));
  });
}

const SEZIONI_IMPOSTAZIONI = [['corsi', 'Corsi', '#/impostazioni'], ['preventivi', 'Preventivi', '#/impostazioni/preventivi']];

function schedeImpostazioni(attiva) {
  return `<nav class="schede">${SEZIONI_IMPOSTAZIONI.map(([v, t, href]) =>
    `<a href="${href}" class="${v === attiva ? 'attivo' : ''}">${t}</a>`).join('')}</nav>`;
}

async function paginaImpostazioni(sezione) {
  if (sezione === 'preventivi') return impostazioniPreventivi();
  // Aggiornati qui anche i conteggi d'uso, che servono a sapere cosa si può togliere
  [abilitazioni, stati] = await Promise.all([api('GET', '/abilitazioni'), api('GET', '/stati')]);
  app.innerHTML = `
    <div class="barra"><h1>Impostazioni</h1></div>
    ${schedeImpostazioni('corsi')}
    <div id="elenchi-corsi"></div>`;
  disegnaElenchiCorsi(document.getElementById('elenchi-corsi'));
}

async function impostazioniPreventivi() {
  const imp = await api('GET', '/impostazioni');
  let logo = imp.logo;
  app.innerHTML = `
    <div class="barra"><h1>Impostazioni</h1><button class="primario" id="salva">Salva</button></div>
    ${schedeImpostazioni('preventivi')}
    <h2>Logo</h2>
    <div class="logo-impostazioni">
      <div id="anteprima-logo"></div>
      <div>
        <button id="scegli-logo">Scegli immagine</button> <button id="togli-logo">Togli logo</button>
        <input type="file" id="file-logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>
        <p class="muted">Compare in alto a destra nei preventivi. Viene ridotto a ${LATO_LOGO} px e salvato con il pulsante Salva.</p>
      </div>
    </div>
    ${CAMPI_IMPOSTAZIONI.map(([titolo, campi]) => `<h2>${esc(titolo)}</h2>
      <form class="modulo-preventivo">${campi.map((c) => campoHtml(c, imp[c.nome])).join('')}</form>`).join('')}
    <p class="muted">Le modifiche valgono per le prossime stampe; i testi già inseriti nei preventivi esistenti restano com'erano.</p>`;

  const disegnaLogo = () => {
    document.getElementById('anteprima-logo').innerHTML = logo ? `<img src="${esc(logo)}" alt="Logo">` : '<span class="muted">Nessun logo</span>';
    document.getElementById('togli-logo').disabled = !logo;
  };
  disegnaLogo();
  const file = document.getElementById('file-logo');
  document.getElementById('scegli-logo').onclick = () => file.click();
  file.onchange = async () => {
    if (!file.files[0]) return;
    try {
      logo = await logoDaFile(file.files[0]);
      disegnaLogo();
    } catch (e) {
      alert(e.message);
    }
    file.value = '';
  };
  document.getElementById('togli-logo').onclick = () => {
    logo = null;
    disegnaLogo();
  };
  app.querySelectorAll('form').forEach((f) => f.onsubmit = (ev) => ev.preventDefault());
  document.getElementById('salva').onclick = async (ev) => {
    const dati = { logo };
    app.querySelectorAll('form').forEach((f) => Object.assign(dati, Object.fromEntries(new FormData(f))));
    try {
      await api('PUT', '/impostazioni', dati);
      ev.target.textContent = 'Salvato';
      setTimeout(() => ev.target.textContent = 'Salva', 1500);
    } catch (e) {
      alert(e.message);
    }
  };
}

// ---------- Utenti (solo admin) ----------

const CAMPI_UTENTE = [
  { nome: 'nome', etichetta: 'Nome', obbligatorio: true },
  { nome: 'email', etichetta: 'Email (quella usata per il login)', tipo: 'email', obbligatorio: true },
  { nome: 'ruolo', etichetta: 'Ruolo', tipo: 'select', opzioni: [['coordinatore', 'Coordinatore'], ['admin', 'Amministratore']] },
  { nome: 'attivo', etichetta: 'Attivo', tipo: 'checkbox' },
];

async function paginaUtenti() {
  const utenti = await api('GET', '/utenti');
  app.innerHTML = `
    <div class="barra"><h1>Utenti</h1><button class="primario" id="nuovo">Nuovo utente</button></div>
    <div class="tabella"><table>
      <thead><tr><th>Nome</th><th>Email</th><th>Ruolo</th><th>Accesso</th><th></th></tr></thead>
      <tbody>${utenti.map((u) => `
        <tr class="cliccabile ${u.attivo ? '' : 'spento'}" data-id="${u.id}"><td>${esc(u.nome)}</td><td>${esc(u.email)}</td>
        <td>${u.ruolo === 'admin' ? 'Amministratore' : 'Coordinatore'}</td>
        <td>${u.in_attesa ? '<span class="etichetta forse">Da attivare</span>' : '<span class="etichetta si">Attivo</span>'}</td>
        <td>${u.id === io.id ? '' : `<button class="piccolo" data-link="${u.id}">${u.in_attesa ? 'Link di attivazione' : 'Reimposta password'}</button>`}</td></tr>`).join('')}
      </tbody>
    </table></div>`;

  document.getElementById('nuovo').onclick = async () => {
    let creato;
    const ok = await moduloESalva('Nuovo utente', CAMPI_UTENTE, { ruolo: 'coordinatore', attivo: true },
      async (d) => creato = await api('POST', '/utenti', d));
    if (!ok) return;
    await paginaUtenti();
    mostraLinkAttivazione('Utente creato', creato.token);
  };
  app.querySelectorAll('[data-link]').forEach((b) => b.onclick = async (ev) => {
    ev.stopPropagation();
    const u = utenti.find((x) => x.id === Number(b.dataset.link));
    if (!u.in_attesa && !confirm(`Generare un link per reimpostare la password di ${u.nome}? Quella attuale resta valida finché non usa il link.`)) return;
    const { token } = await api('POST', `/utenti/${u.id}/attivazione`);
    mostraLinkAttivazione(`Link per ${u.nome}`, token);
  });
  app.querySelectorAll('tr[data-id]').forEach((tr) => tr.onclick = async () => {
    const u = utenti.find((x) => x.id === Number(tr.dataset.id));
    if (await moduloESalva('Modifica utente', CAMPI_UTENTE, u, (d) => api('PUT', `/utenti/${u.id}`, d))) paginaUtenti();
  });
}

function mostraLinkAttivazione(titolo, token) {
  const link = `${location.origin}/#/attiva/${token}`;
  dialogoForm.innerHTML = `
    <h2>${esc(titolo)}</h2>
    <p>Invia questo link alla persona: aprendolo sceglie la sua password. Vale 7 giorni e si usa una volta sola.</p>
    <div class="link-attivazione"><input readonly value="${esc(link)}"><button type="button" id="copia">Copia</button></div>
    <div class="azioni"><button value="ok" class="primario">Chiudi</button></div>`;
  dialogoForm.querySelector('#copia').onclick = async (ev) => {
    await navigator.clipboard.writeText(link);
    ev.target.textContent = 'Copiato';
  };
  dialogo.onclose = null;
  dialogo.showModal();
}

// ---------- Accesso ----------

function paginaAccesso(titolo, campi, invio, piede = '') {
  app.innerHTML = `
    <div class="accesso"><form id="accesso">
      <strong class="muted">Gestione corsi</strong>
      <h1>${esc(titolo)}</h1>
      ${campi.map((c) => campoHtml(c)).join('')}
      <p class="errore" id="errore-accesso" hidden></p>
      <button class="primario">Entra</button>
      ${piede}
    </form></div>`;
  const form = document.getElementById('accesso');
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const dati = Object.fromEntries(new FormData(form));
    const errore = document.getElementById('errore-accesso');
    try {
      if ('conferma' in dati && dati.password !== dati.conferma) throw new Error('Le due password non coincidono');
      entra(await invio(dati));
    } catch (e) {
      errore.textContent = e.message;
      errore.hidden = false;
    }
  };
}

const CAMPI_NUOVA_PASSWORD = [
  { nome: 'password', etichetta: 'Nuova password (almeno 8 caratteri)', tipo: 'password', obbligatorio: true, extra: 'minlength="8" autocomplete="new-password"' },
  { nome: 'conferma', etichetta: 'Ripeti la password', tipo: 'password', obbligatorio: true, extra: 'minlength="8" autocomplete="new-password"' },
];

function paginaLogin() {
  paginaAccesso('Accedi', [
    { nome: 'email', etichetta: 'Email', tipo: 'email', obbligatorio: true, extra: 'autocomplete="username"' },
    { nome: 'password', etichetta: 'Password', tipo: 'password', obbligatorio: true, extra: 'autocomplete="current-password"' },
  ], (d) => api('POST', '/auth/login', d),
  '<p class="muted">Password dimenticata? Chiedi all\'amministratore un nuovo link.<br><a href="#/primo-accesso">Primo accesso amministratore</a></p>');
}

function paginaPrimoAccesso() {
  paginaAccesso('Primo accesso amministratore', [
    { nome: 'email', etichetta: 'Email amministratore', tipo: 'email', obbligatorio: true, extra: 'autocomplete="username"' },
    { nome: 'codice', etichetta: 'Codice di attivazione (ADMIN_SETUP_CODE)', tipo: 'password', obbligatorio: true },
    ...CAMPI_NUOVA_PASSWORD,
  ], (d) => api('POST', '/auth/primo-accesso', d), '<p><a href="#/accesso">Torna al login</a></p>');
}

function paginaAttiva(token) {
  paginaAccesso('Scegli la tua password', CAMPI_NUOVA_PASSWORD, (d) => api('POST', '/auth/attiva', { ...d, token }));
}

async function cambiaPassword() {
  await moduloESalva('Cambia password', [
    { nome: 'attuale', etichetta: 'Password attuale', tipo: 'password', obbligatorio: true, extra: 'autocomplete="current-password"' },
    { nome: 'nuova', etichetta: 'Nuova password (almeno 8 caratteri)', tipo: 'password', obbligatorio: true, extra: 'minlength="8" autocomplete="new-password"' },
  ], {}, (d) => api('POST', '/auth/password', d));
}

function mostraIntestazione() {
  document.getElementById('intestazione').hidden = !io;
  if (!io) return;
  document.getElementById('utente-nome').textContent = `${io.nome} · ${io.ruolo === 'admin' ? 'Amministratore' : 'Coordinatore'}`;
  document.getElementById('nav-utenti').hidden = io.ruolo !== 'admin';
  document.getElementById('nav-impostazioni').hidden = io.ruolo !== 'admin';
}

async function entra(utente) {
  io = utente;
  [abilitazioni, stati] = await Promise.all([api('GET', '/abilitazioni'), api('GET', '/stati')]);
  mostraIntestazione();
  if (!location.hash.startsWith('#/corsi') && !location.hash.match(/^#\/(corso|invio|nuova-richiesta|richieste|istruttori|committenti|preventiv|utenti|impostazioni)/)) location.hash = '#/corsi';
  else naviga();
}

// ---------- Navigazione ----------

async function naviga() {
  const percorso = location.hash.slice(1) || '/corsi';
  let m;
  if ((m = percorso.match(/^\/attiva\/([0-9a-f]+)$/))) return paginaAttiva(m[1]);
  if (!io) return percorso === '/primo-accesso' ? paginaPrimoAccesso() : paginaLogin();

  document.querySelectorAll('header nav a').forEach((a) => a.classList.toggle('attivo', percorso.startsWith(a.getAttribute('href').slice(1))));
  try {
    if ((m = percorso.match(/^\/corso\/(\d+)$/))) await paginaCorso(Number(m[1]));
    else if ((m = percorso.match(/^\/invio\/(\d+)$/))) await paginaInvio(Number(m[1]));
    else if ((m = percorso.match(/^\/nuova-richiesta\/([\d,]+)$/))) await paginaNuovaRichiesta(m[1].split(',').map(Number));
    else if (percorso.startsWith('/richieste')) await paginaInvii();
    else if (percorso.startsWith('/istruttori')) await paginaIstruttori();
    else if (percorso.startsWith('/committenti')) await paginaCommittenti();
    else if ((m = percorso.match(/^\/preventivo\/(\d+|nuovo)$/))) await paginaPreventivo(m[1] === 'nuovo' ? null : Number(m[1]));
    else if (percorso.startsWith('/preventivi')) await paginaPreventivi();
    else if (percorso.startsWith('/utenti') && io.ruolo === 'admin') await paginaUtenti();
    else if ((m = percorso.match(/^\/impostazioni(?:\/(\w+))?$/)) && io.ruolo === 'admin') await paginaImpostazioni(m[1]);
    else await paginaCorsi();
  } catch (e) {
    if (io) app.innerHTML = `<p class="errore">${esc(e.message)}</p>`; // senza io è già stato mostrato il login
  }
}

window.addEventListener('hashchange', naviga);
document.getElementById('cambia-password').onclick = cambiaPassword;
document.getElementById('esci').onclick = async () => {
  await api('POST', '/auth/logout');
  io = null;
  mostraIntestazione();
  history.replaceState(null, '', '#/accesso');
  naviga();
};

// Il link di attivazione apre una sessione nuova: non serve sapere chi era già collegato
if (location.hash.startsWith('#/attiva/')) naviga();
else api('GET', '/me').then(entra, () => naviga());
