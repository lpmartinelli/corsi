const app = document.getElementById('app');
const token = location.pathname.split('/')[2];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const QUALIFICHE = [['direttore', 'Ho la qualifica di direttore di corso'], ['albo_ausl', 'Sono iscritto/a all\'albo formatori AUSL'],
  ['irc', 'Sono istruttore IRC'], ['irccom', 'Sono istruttore IRCcom']];

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

function disegna({ abilitazioni }, dati = { profilo: 'sanitario', abilitazioni: [] }) {
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
      <label>Corsi per cui sei abilitato/a<span class="checks">
        ${abilitazioni.map((a) => spunta('abilitazioni', a, dati.abilitazioni.includes(a), `value="${esc(a)}"`)).join('')}
      </span></label>
      ${QUALIFICHE.map(([n, t]) => spunta(n, t, dati[n])).join('')}
      <p class="errore" id="errore" hidden></p>
      <button class="primario">Invia</button>
    </form>`;

  const form = document.getElementById('anagrafica');
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const inviati = {
      ...Object.fromEntries(['nome', 'cognome', 'codice_fiscale', 'telefono', 'email'].map((n) => [n, form.elements[n].value])),
      profilo: form.elements.profilo.value,
      abilitazioni: [...form.querySelectorAll('[name="abilitazioni"]:checked')].map((x) => x.value),
      ...Object.fromEntries(QUALIFICHE.map(([n]) => [n, form.elements[n].checked])),
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
