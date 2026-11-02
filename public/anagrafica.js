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
// Per ogni voce [nome del campo, etichetta, livello]: niente (0), istruttore (1) o direttore (2)
const livelli = (voci) => `<table class="livelli">
  <thead><tr><th></th><th>${LIVELLI[1]}</th><th>${LIVELLI[2]}</th></tr></thead>
  <tbody>${voci.map(([nome, etichetta, livello]) => `<tr><th>${esc(etichetta)}</th>${[1, 2].map((n) => `
    <td><input type="checkbox" name="${esc(nome)}:${n}" aria-label="${esc(etichetta)} ${LIVELLI[n].toLowerCase()}"
      ${(livello || 0) >= n ? 'checked' : ''}></td>`).join('')}</tr>`).join('')}</tbody></table>`;

// Chi dirige una disciplina la insegna anche: Direttore spunta Istruttore, togliere Istruttore toglie Direttore
function collegaLivelli(radice) {
  radice.querySelectorAll('.livelli input').forEach((x) => x.onchange = () => {
    const [istruttore, direttore] = x.closest('tr').querySelectorAll('input');
    if (x === direttore && direttore.checked) istruttore.checked = true;
    if (x === istruttore && !istruttore.checked) direttore.checked = false;
  });
}

function disegna({ abilitazioni }, dati = { profilo: 'sanitario', abilitazioni: [], direzioni: [] }) {
  const livelloCorso = (a) => (dati.direzioni.includes(a) ? 2 : dati.abilitazioni.includes(a) ? 1 : 0);
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
      <div class="campo">Corsi per cui sei istruttore o direttore${livelli(abilitazioni.map((a) => [`corso:${a}`, a, livelloCorso(a)]))}</div>
      <div class="campo">Certificazioni${livelli(CERTIFICAZIONI.map(([n, t]) => [n, t, dati[n]]))}</div>
      ${spunta('albo_ausl', 'Sono iscritto/a all\'albo formatori AUSL', dati.albo_ausl)}
      <p class="errore" id="errore" hidden></p>
      <button class="primario">Invia</button>
    </form>`;

  const form = document.getElementById('anagrafica');
  collegaLivelli(form);
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const livello = (nome) => (form.elements[`${nome}:2`].checked ? 2 : form.elements[`${nome}:1`].checked ? 1 : 0);
    const inviati = {
      ...Object.fromEntries(['nome', 'cognome', 'codice_fiscale', 'telefono', 'email'].map((n) => [n, form.elements[n].value])),
      profilo: form.elements.profilo.value,
      abilitazioni: abilitazioni.filter((a) => livello(`corso:${a}`) >= 1),
      direzioni: abilitazioni.filter((a) => livello(`corso:${a}`) === 2),
      ...Object.fromEntries(CERTIFICAZIONI.map(([n]) => [n, livello(n)])),
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
