import { rigaCorso, sezioni } from '/messaggio.js';

const app = document.getElementById('app');
const token = location.pathname.split('/')[2];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const RISPOSTE = [['si', 'Ci sono'], ['forse', 'Forse'], ['no', 'Non ci sono']];
const giorno = (iso) => new Date(iso + 'T12:00').toLocaleDateString('it-IT', { weekday: 'long' });

async function api(metodo, body) {
  const res = await fetch(`/api/pubblico/${token}`, {
    method: metodo,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const dati = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(dati.errore || `Errore ${res.status}`);
  return dati;
}

function statoCorso(c) {
  if (c.stato === 'annullato') return '<span class="etichetta no">Annullato</span>';
  if (!c.modificabile) return '<span class="etichetta neutro">Chiuso</span>';
  return '';
}

function disegna({ nome, scade_il, corsi }) {
  const scadenza = new Date(scade_il).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
  app.innerHTML = `
    <h1>Ciao ${esc(nome)}</h1>
    <p class="muted">Indica per ogni corso se ci sei. Le risposte si salvano subito e puoi cambiarle fino al ${esc(scadenza)}.</p>
    ${sezioni(corsi).map((s) => `
      <h2>${esc(s.titolo)}</h2>
      ${s.corsi.map((c) => `
        <div class="corso-disp" data-id="${c.id}">
          <div><strong>${esc(rigaCorso(c))}</strong> <span class="muted">${esc(giorno(c.data))}</span> ${statoCorso(c)}</div>
          <div class="scelte">${RISPOSTE.map(([v, t]) => `
            <button type="button" data-risposta="${v}" class="${c.risposta === v ? v + ' scelta' : ''}" ${c.modificabile ? '' : 'disabled'}>${t}</button>`).join('')}
          </div>
          <p class="esito muted" hidden></p>
        </div>`).join('')}`).join('')}`;

  app.querySelectorAll('[data-risposta]').forEach((b) => b.onclick = async () => {
    const riga = b.closest('.corso-disp');
    const esito = riga.querySelector('.esito');
    try {
      await api('PUT', { corso_id: Number(riga.dataset.id), risposta: b.dataset.risposta });
      riga.querySelectorAll('[data-risposta]').forEach((x) => x.className = x === b ? `${x.dataset.risposta} scelta` : '');
      esito.textContent = 'Salvato';
      esito.className = 'esito muted';
    } catch (e) {
      esito.textContent = e.message;
      esito.className = 'esito errore';
    }
    esito.hidden = false;
  });
}

api('GET').then(disegna, (e) => {
  app.innerHTML = `<h1>Link non disponibile</h1><p class="errore">${esc(e.message)}</p>
    <p class="muted">Chiedi al coordinatore di inviarti un nuovo link.</p>`;
});
