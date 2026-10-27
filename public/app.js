const app = document.getElementById('app');
const dialogo = document.getElementById('dialogo');
const dialogoForm = document.getElementById('dialogo-form');

let io = null;
let abilitazioni = [];

// ---------- Utilità ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function api(metodo, percorso, body) {
  const res = await fetch('/api' + percorso, {
    method: metodo,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const dati = await res.json().catch(() => ({}));
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
  dialogo.returnValue = '';
  dialogo.showModal();
  return new Promise((resolve) => {
    dialogo.onclose = () => {
      if (dialogo.returnValue !== 'ok') return resolve(null);
      const dati = {};
      for (const c of campi) {
        if (c.tipo === 'checkbox') dati[c.nome] = dialogoForm.elements[c.nome].checked;
        else if (c.tipo === 'checks') dati[c.nome] = [...dialogoForm.querySelectorAll(`[name="${c.nome}"]:checked`)].map((e) => e.value);
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
  if (c.tipo === 'select') {
    return `<label>${esc(c.etichetta)}<select name="${c.nome}" ${req}>${c.opzioni.map(([v, t]) =>
      `<option value="${esc(v)}" ${String(v) === String(valore ?? '') ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  }
  if (c.tipo === 'textarea') {
    return `<label>${esc(c.etichetta)}<textarea name="${c.nome}" rows="3">${esc(valore)}</textarea></label>`;
  }
  return `<label>${esc(c.etichetta)}<input type="${c.tipo || 'text'}" name="${c.nome}" value="${esc(valore)}" ${req} ${c.extra || ''}></label>`;
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

const STATI = [['bozza', 'Bozza'], ['richiesta', 'Richiesta inviata'], ['assegnato', 'Assegnato'], ['svolto', 'Svolto'], ['annullato', 'Annullato']];

async function campiCorso() {
  const [committenti, utenti] = await Promise.all([api('GET', '/committenti'), api('GET', '/utenti')]);
  return [
    { nome: 'data', etichetta: 'Data', tipo: 'date', obbligatorio: true },
    { nome: 'tipo', etichetta: 'Tipo di corso', tipo: 'select', opzioni: abilitazioni.map((a) => [a.codice, a.codice]) },
    { nome: 'ora_inizio', etichetta: 'Ora inizio', tipo: 'time' },
    { nome: 'ora_fine', etichetta: 'Ora fine', tipo: 'time' },
    { nome: 'sede', etichetta: 'Sede' },
    { nome: 'committente_id', etichetta: 'Committente', tipo: 'select', opzioni: [['', '—'], ...committenti.map((c) => [c.id, c.nome])] },
    { nome: 'istruttori_richiesti', etichetta: 'Istruttori richiesti (direttore incluso)', tipo: 'number', extra: 'min="1"' },
    { nome: 'coordinatore_id', etichetta: 'Coordinato da', tipo: 'select', opzioni: [['', '—'], ...utenti.filter((u) => u.attivo).map((u) => [u.id, u.nome])] },
    { nome: 'stato', etichetta: 'Stato', tipo: 'select', opzioni: STATI },
    { nome: 'note', etichetta: 'Note', tipo: 'textarea' },
  ];
}

async function paginaCorsi() {
  const oggi = new Date().toISOString().slice(0, 10);
  const passati = location.hash.includes('passati');
  const corsi = await api('GET', passati ? `/corsi?a=${oggi}` : `/corsi?da=${oggi}`);
  if (passati) corsi.reverse();

  app.innerHTML = `
    <div class="barra">
      <h1>Corsi</h1>
      <div>
        <a class="bottone" href="${passati ? '#/corsi' : '#/corsi/passati'}">${passati ? 'Prossimi' : 'Passati'}</a>
        <button class="primario" id="nuovo">Nuovo corso</button>
      </div>
    </div>
    <div class="tabella"><table>
      <thead><tr><th>Data</th><th>Tipo</th><th>Orario</th><th>Sede</th><th>Committente</th><th>Squadra</th><th>Disponibili</th><th>Stato</th></tr></thead>
      <tbody>${corsi.map((c) => `
        <tr class="cliccabile ${c.stato === 'annullato' ? 'spento' : ''}" data-id="${c.id}">
          <td>${formatoData(c.data)}</td><td>${esc(c.tipo)}</td>
          <td>${esc(c.ora_inizio || '')}${c.ora_fine ? '–' + esc(c.ora_fine) : ''}</td>
          <td>${esc(c.sede)}</td><td>${esc(c.committente)}</td>
          <td><span class="etichetta ${c.assegnati >= c.istruttori_richiesti ? 'si' : 'neutro'}">${c.assegnati}/${c.istruttori_richiesti}</span></td>
          <td>${c.disponibili}</td>
          <td>${esc(STATI.find(([v]) => v === c.stato)[1])}</td>
        </tr>`).join('') || `<tr><td colspan="8" class="muted">Nessun corso</td></tr>`}
      </tbody>
    </table></div>`;

  app.querySelectorAll('tr[data-id]').forEach((tr) => tr.onclick = () => location.hash = `#/corso/${tr.dataset.id}`);
  document.getElementById('nuovo').onclick = async () => {
    let nuovoId;
    const ok = await moduloESalva('Nuovo corso', await campiCorso(), { istruttori_richiesti: 2, stato: 'bozza', coordinatore_id: io.id },
      async (d) => ({ id: nuovoId } = await api('POST', '/corsi', d)));
    if (ok) location.hash = `#/corso/${nuovoId}`;
  };
}

// ---------- Dettaglio corso: disponibilità e assegnazioni ----------

async function paginaCorso(id) {
  disegnaCorso(await api('GET', `/corsi/${id}`));
}

function disegnaCorso({ corso, candidati, avvisi }) {
  const squadra = candidati.filter((c) => c.ruolo);
  app.innerHTML = `
    <div class="barra">
      <h1>${esc(corso.tipo)} · ${formatoData(corso.data)}</h1>
      <div><button id="modifica">Modifica</button> <button id="elimina">Elimina</button></div>
    </div>
    <div class="scheda">
      <div><span>Orario</span>${esc(corso.ora_inizio || '—')}${corso.ora_fine ? '–' + esc(corso.ora_fine) : ''}</div>
      <div><span>Sede</span>${esc(corso.sede || '—')}</div>
      <div><span>Committente</span>${esc(corso.committente || '—')}</div>
      <div><span>Squadra</span>${squadra.length}/${corso.istruttori_richiesti}</div>
      <div><span>Stato</span>${esc(STATI.find(([v]) => v === corso.stato)[1])}</div>
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
          <td>${esc(nomeCompleto(c))}${c.direttore ? ' <span class="etichetta neutro">Dir</span>' : ''}${c.altri_stesso_giorno ? ' <span class="etichetta no">Già impegnato</span>' : ''}</td>
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
  if (!c.abilitato) p.push(`non abilitato ${corso.tipo}`);
  if (ruolo === 'direttore' && !c.direttore) p.push('non ha la qualifica di direttore');
  if (!c.disponibilita) p.push('non ha dato disponibilità');
  else if (c.disponibilita !== 'si') p.push(`ha risposto ${ETICHETTE_RISPOSTA[c.disponibilita].toUpperCase()}`);
  if (c.altri_stesso_giorno) p.push('già assegnato a un altro corso lo stesso giorno');
  return p;
}

// ---------- Istruttori ----------

function campiIstruttore() {
  return [
    { nome: 'nome', etichetta: 'Nome', obbligatorio: true },
    { nome: 'cognome', etichetta: 'Cognome', obbligatorio: true },
    { nome: 'telefono', etichetta: 'Telefono (WhatsApp)', tipo: 'tel', extra: 'placeholder="+39 333 1234567"' },
    { nome: 'profilo', etichetta: 'Profilo', tipo: 'select', opzioni: [['sanitario', 'Sanitario'], ['tecnico', 'Tecnico']] },
    { nome: 'direttore', etichetta: 'Qualifica di direttore', tipo: 'checkbox' },
    { nome: 'abilitazioni', etichetta: 'Abilitazioni', tipo: 'checks', opzioni: abilitazioni.map((a) => [a.codice, a.codice]) },
    { nome: 'attivo', etichetta: 'Attivo', tipo: 'checkbox' },
    { nome: 'note', etichetta: 'Note', tipo: 'textarea' },
  ];
}

async function paginaIstruttori() {
  const istruttori = await api('GET', '/istruttori');
  app.innerHTML = `
    <div class="barra"><h1>Istruttori</h1><button class="primario" id="nuovo">Nuovo istruttore</button></div>
    <div class="tabella"><table>
      <thead><tr><th>Nome</th><th>Telefono</th><th>Profilo</th><th>Direttore</th><th>Abilitazioni</th><th>Giornate 12 mesi</th></tr></thead>
      <tbody>${istruttori.map((i) => `
        <tr class="cliccabile ${i.attivo ? '' : 'spento'}" data-id="${i.id}">
          <td>${esc(nomeCompleto(i))}</td><td>${esc(i.telefono)}</td>
          <td>${i.profilo === 'sanitario' ? 'Sanitario' : 'Tecnico'}</td>
          <td>${i.direttore ? '✓' : ''}</td>
          <td>${i.abilitazioni.map((a) => `<span class="etichetta neutro">${esc(a)}</span>`).join(' ')}</td>
          <td>${i.giornate}</td>
        </tr>`).join('') || `<tr><td colspan="6" class="muted">Nessun istruttore</td></tr>`}
      </tbody>
    </table></div>`;

  document.getElementById('nuovo').onclick = async () => {
    if (await moduloESalva('Nuovo istruttore', campiIstruttore(), { attivo: true, profilo: 'sanitario' }, (d) => api('POST', '/istruttori', d))) paginaIstruttori();
  };
  app.querySelectorAll('tr[data-id]').forEach((tr) => tr.onclick = async () => {
    const i = istruttori.find((x) => x.id === Number(tr.dataset.id));
    if (await moduloESalva('Modifica istruttore', campiIstruttore(), i, (d) => api('PUT', `/istruttori/${i.id}`, d))) paginaIstruttori();
  });
}

// ---------- Committenti ----------

const CAMPI_COMMITTENTE = [
  { nome: 'nome', etichetta: 'Nome', obbligatorio: true },
  { nome: 'referente', etichetta: 'Referente' },
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
      <thead><tr><th>Nome</th><th>Email</th><th>Ruolo</th></tr></thead>
      <tbody>${utenti.map((u) => `
        <tr class="cliccabile ${u.attivo ? '' : 'spento'}" data-id="${u.id}"><td>${esc(u.nome)}</td><td>${esc(u.email)}</td>
        <td>${u.ruolo === 'admin' ? 'Amministratore' : 'Coordinatore'}</td></tr>`).join('')}
      </tbody>
    </table></div>`;

  document.getElementById('nuovo').onclick = async () => {
    if (await moduloESalva('Nuovo utente', CAMPI_UTENTE, { ruolo: 'coordinatore', attivo: true }, (d) => api('POST', '/utenti', d))) paginaUtenti();
  };
  app.querySelectorAll('tr[data-id]').forEach((tr) => tr.onclick = async () => {
    const u = utenti.find((x) => x.id === Number(tr.dataset.id));
    if (await moduloESalva('Modifica utente', CAMPI_UTENTE, u, (d) => api('PUT', `/utenti/${u.id}`, d))) paginaUtenti();
  });
}

// ---------- Navigazione ----------

async function naviga() {
  const percorso = location.hash.slice(1) || '/corsi';
  document.querySelectorAll('header nav a').forEach((a) => a.classList.toggle('attivo', percorso.startsWith(a.getAttribute('href').slice(1))));
  try {
    let m;
    if ((m = percorso.match(/^\/corso\/(\d+)$/))) await paginaCorso(Number(m[1]));
    else if (percorso.startsWith('/istruttori')) await paginaIstruttori();
    else if (percorso.startsWith('/committenti')) await paginaCommittenti();
    else if (percorso.startsWith('/utenti') && io.ruolo === 'admin') await paginaUtenti();
    else await paginaCorsi();
  } catch (e) {
    app.innerHTML = `<p class="errore">${esc(e.message)}</p>`;
  }
}

try {
  [io, abilitazioni] = await Promise.all([api('GET', '/me'), api('GET', '/abilitazioni')]);
  document.getElementById('utente').textContent = `${io.nome} · ${io.ruolo === 'admin' ? 'Amministratore' : 'Coordinatore'}`;
  document.getElementById('nav-utenti').hidden = io.ruolo !== 'admin';
  window.addEventListener('hashchange', naviga);
  naviga();
} catch (e) {
  app.innerHTML = `<p class="errore">${esc(e.message)}</p>`;
}
