const app = document.getElementById('app');
const token = location.pathname.split('/')[2];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const CERTIFICAZIONI = [['irc', 'IRC'], ['irccom', 'IRCcom']];
const LIVELLI = ['—', 'Istruttore', 'Direttore'];

async function api(metodo, body) {
  const res = await fetch(`/api/anagrafica/${token}`, {
    method: metodo,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const dati = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(dati.errore || `Errore ${res.status}`);
  return dati;
}

const campo = (nome, etichetta, tipo, valore, extra = '') =>
  `<label>${etichetta}<input type="${tipo}" name="${nome}" value="${esc(valore)}" required ${extra}></label>`;
const spunta = (nome, etichetta, valore, attr = '') =>
  `<label class="check"><input type="checkbox" name="${nome}" ${attr} ${valore ? 'checked' : ''}> ${esc(etichetta)}</label>`;
// Per ogni abilitazione e certificazione: niente (0), istruttore (1) o direttore (2); livelli è { irc: { BLSD: 2 }, irccom: {...} }
const tabellaLivelli = (abilitazioni, livelli) => `<table class="livelli">
  <thead><tr><th rowspan="2"></th>${CERTIFICAZIONI.map(([k, t]) => `<th colspan="2" class="gruppo" data-cert="${k}">${t}</th>`).join('')}</tr>
    <tr>${CERTIFICAZIONI.map(([k]) => `<th class="gruppo" data-cert="${k}">${LIVELLI[1]}</th><th data-cert="${k}">${LIVELLI[2]}</th>`).join('')}</tr></thead>
  <tbody>${abilitazioni.map((a) => `<tr><th>${esc(a)}</th>${CERTIFICAZIONI.map(([k, t]) => [1, 2].map((n) => `
    <td class="${n === 1 ? 'gruppo' : ''}" data-cert="${k}"><input type="checkbox" name="${k}:${esc(a)}:${n}" aria-label="${esc(a)} ${t} ${LIVELLI[n].toLowerCase()}"
      ${(livelli[k]?.[a] || 0) >= n ? 'checked' : ''}></td>`).join('')).join('')}</tr>`).join('')}</tbody></table>`;

// Chi dirige una disciplina la insegna anche: Direttore spunta Istruttore, togliere Istruttore toglie Direttore
function collegaLivelli(radice) {
  radice.querySelectorAll('.livelli input').forEach((x) => x.onchange = () => {
    const [istruttore, direttore] = [1, 2].map((n) => radice.querySelector(`[name="${CSS.escape(`${x.name.slice(0, -2)}:${n}`)}"]`));
    if (x === direttore && direttore.checked) istruttore.checked = true;
    if (x === istruttore && !istruttore.checked) direttore.checked = false;
  });
}

// Nella tabella si vedono solo le certificazioni spuntate; senza certificazioni la tabella non c'è
function collegaCertificazioni(form) {
  const tabella = form.querySelector('.livelli');
  const aggiorna = () => {
    for (const [k] of CERTIFICAZIONI) tabella.querySelectorAll(`[data-cert="${k}"]`).forEach((el) => el.hidden = !form.elements[k].checked);
    tabella.closest('.campo').hidden = !CERTIFICAZIONI.some(([k]) => form.elements[k].checked);
  };
  CERTIFICAZIONI.forEach(([k]) => form.elements[k].addEventListener('change', aggiorna));
  aggiorna();
}

function disegna({ abilitazioni }, dati = { profilo: 'sanitario', livelli: {} }) {
  app.innerHTML = `
    <h1>I tuoi dati di istruttore</h1>
    <p class="muted">Servono per organizzare i corsi e mandarti le richieste di disponibilità su WhatsApp.
      Se sei già in elenco, i tuoi dati vengono aggiornati.</p>
    <form id="anagrafica" class="scheda-anagrafica">
      ${campo('nome', 'Nome', 'text', dati.nome, 'autocomplete="given-name" maxlength="60"')}
      ${campo('cognome', 'Cognome', 'text', dati.cognome, 'autocomplete="family-name" maxlength="60"')}
      ${campo('codice_fiscale', 'Codice fiscale', 'text', dati.codice_fiscale,
        'maxlength="20" autocapitalize="characters" autocomplete="off" spellcheck="false" style="text-transform: uppercase"')}
      ${campo('telefono', 'Cellulare (WhatsApp)', 'tel', dati.telefono, 'autocomplete="tel" placeholder="+39 333 1234567" maxlength="30"')}
      ${campo('email', 'Email', 'email', dati.email, 'autocomplete="email" maxlength="120"')}
      <label>Profilo<span class="checks">
        ${[['sanitario', 'Sanitario'], ['tecnico', 'Tecnico']].map(([v, t]) =>
          `<label class="check"><input type="radio" name="profilo" value="${v}" ${dati.profilo === v ? 'checked' : ''}> ${t}</label>`).join('')}
      </span></label>
      <label>Certificazioni<span class="checks">
        ${CERTIFICAZIONI.map(([n, t]) => spunta(n, t, dati[n])).join('')}
      </span></label>
      <div class="campo">Corsi per cui sei istruttore o direttore${tabellaLivelli(abilitazioni, dati.livelli)}</div>
      ${spunta('albo_ausl', 'Sono iscritto/a all\'albo formatori AUSL', dati.albo_ausl)}
      <p class="errore" id="errore" hidden></p>
      <button class="primario">Invia</button>
    </form>`;

  const form = document.getElementById('anagrafica');
  collegaLivelli(form);
  collegaCertificazioni(form);
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const livello = (nome) => (form.elements[`${nome}:2`].checked ? 2 : form.elements[`${nome}:1`].checked ? 1 : 0);
    const inviati = {
      ...Object.fromEntries(['nome', 'cognome', 'codice_fiscale', 'telefono', 'email'].map((n) => [n, form.elements[n].value])),
      profilo: form.elements.profilo.value,
      ...Object.fromEntries(CERTIFICAZIONI.map(([n]) => [n, form.elements[n].checked])),
      livelli: Object.fromEntries(CERTIFICAZIONI.map(([k]) => [k, Object.fromEntries(abilitazioni.map((a) => [a, livello(`${k}:${a}`)]))])),
      albo_ausl: form.elements.albo_ausl.checked,
    };
    const bottone = form.querySelector('button');
    bottone.disabled = true;
    try {
      await api('POST', inviati);
      app.innerHTML = `<h1>Grazie ${esc(inviati.nome)}!</h1>
        <p>I tuoi dati sono stati ricevuti. Il coordinatore li verificherà.</p>
        <p><button id="correggi">Correggi i dati</button></p>`;
      document.getElementById('correggi').onclick = () => disegna({ abilitazioni }, inviati);
    } catch (e) {
      const errore = document.getElementById('errore');
      errore.textContent = e.message;
      errore.hidden = false;
      bottone.disabled = false;
    }
  };
}

api('GET').then((info) => disegna(info), (e) => {
  app.innerHTML = `<h1>Link non disponibile</h1><p class="errore">${esc(e.message)}</p>
    <p class="muted">Chiedi al coordinatore il link aggiornato.</p>`;
});
