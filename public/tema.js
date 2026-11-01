// Tema chiaro/scuro scelto dall'utente; senza scelta segue il sistema.
// Script classico nel <head>: applica il tema prima del disegno della pagina.
(() => {
  const CHIAVE = 'tema';
  const TEMI = ['auto', 'chiaro', 'scuro'];
  const ETICHETTE = { auto: '◐ Automatico', chiaro: '☀ Chiaro', scuro: '☾ Scuro' };

  let attuale = 'auto';
  try { if (TEMI.includes(localStorage.getItem(CHIAVE))) attuale = localStorage.getItem(CHIAVE); } catch {}

  function applica(tema) {
    attuale = tema;
    if (tema === 'auto') document.documentElement.removeAttribute('data-tema');
    else document.documentElement.dataset.tema = tema;
    for (const b of document.querySelectorAll('[data-cambia-tema]')) {
      b.textContent = ETICHETTE[tema];
      b.title = 'Tema: ' + ETICHETTE[tema].slice(2).toLowerCase() + ' (clic per cambiare)';
    }
  }

  applica(attuale);

  document.addEventListener('DOMContentLoaded', () => {
    applica(attuale);
    document.addEventListener('click', (e) => {
      if (!e.target.closest('[data-cambia-tema]')) return;
      const tema = TEMI[(TEMI.indexOf(attuale) + 1) % TEMI.length];
      try { localStorage.setItem(CHIAVE, tema); } catch {}
      applica(tema);
    });
  });
})();
