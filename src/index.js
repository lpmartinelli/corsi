import { utenteCorrente } from './auth.js';
import { verificaSquadra } from './regole.js';

const json = (data, status = 200) => Response.json(data, { status });
const errore = (messaggio, status = 400) => json({ errore: messaggio }, status);

class ErroreRichiesta extends Error {
  constructor(messaggio, status = 400) {
    super(messaggio);
    this.status = status;
  }
}

function richiedi(body, campi) {
  for (const c of campi) {
    if (body[c] === undefined || body[c] === null || body[c] === '') throw new ErroreRichiesta(`Campo obbligatorio: ${c}`);
  }
}

// ---------- Istruttori ----------

async function listaIstruttori(env) {
  const { results } = await env.DB.prepare(`
    SELECT i.*, group_concat(ia.abilitazione) AS abilitazioni,
      (SELECT count(*) FROM assegnazioni a JOIN corsi c ON c.id = a.corso_id
        WHERE a.istruttore_id = i.id AND c.stato != 'annullato' AND c.data >= date('now', '-12 months')) AS giornate
    FROM istruttori i LEFT JOIN istruttori_abilitazioni ia ON ia.istruttore_id = i.id
    GROUP BY i.id ORDER BY i.cognome, i.nome`).all();
  return results.map(conAbilitazioni);
}

function conAbilitazioni(riga) {
  return { ...riga, abilitazioni: riga.abilitazioni ? riga.abilitazioni.split(',') : [] };
}

async function salvaIstruttore(env, id, body) {
  richiedi(body, ['nome', 'cognome', 'profilo']);
  const valori = [body.nome.trim(), body.cognome.trim(), body.telefono?.trim() || null, body.profilo,
    body.direttore ? 1 : 0, body.attivo === false ? 0 : 1, body.note || null];

  if (id) {
    await env.DB.prepare(`UPDATE istruttori SET nome=?, cognome=?, telefono=?, profilo=?, direttore=?, attivo=?, note=? WHERE id=?`)
      .bind(...valori, id).run();
  } else {
    ({ id } = await env.DB.prepare(`INSERT INTO istruttori (nome, cognome, telefono, profilo, direttore, attivo, note)
      VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`).bind(...valori).first());
  }

  await env.DB.batch([
    env.DB.prepare('DELETE FROM istruttori_abilitazioni WHERE istruttore_id = ?').bind(id),
    ...(body.abilitazioni || []).map((a) =>
      env.DB.prepare('INSERT INTO istruttori_abilitazioni (istruttore_id, abilitazione) VALUES (?, ?)').bind(id, a)),
  ]);
  return { id };
}

// ---------- Committenti ----------

async function salvaCommittente(env, id, body) {
  richiedi(body, ['nome']);
  const valori = [body.nome.trim(), body.referente || null, body.telefono || null, body.email || null, body.note || null];
  if (id) {
    await env.DB.prepare('UPDATE committenti SET nome=?, referente=?, telefono=?, email=?, note=? WHERE id=?').bind(...valori, id).run();
    return { id };
  }
  return env.DB.prepare('INSERT INTO committenti (nome, referente, telefono, email, note) VALUES (?, ?, ?, ?, ?) RETURNING id')
    .bind(...valori).first();
}

// ---------- Corsi ----------

async function listaCorsi(env, url) {
  const da = url.searchParams.get('da') || '0000-01-01';
  const a = url.searchParams.get('a') || '9999-12-31';
  const { results } = await env.DB.prepare(`
    SELECT c.*, cm.nome AS committente, u.nome AS coordinatore,
      (SELECT count(*) FROM assegnazioni WHERE corso_id = c.id) AS assegnati,
      (SELECT count(*) FROM disponibilita WHERE corso_id = c.id AND risposta = 'si') AS disponibili
    FROM corsi c
    LEFT JOIN committenti cm ON cm.id = c.committente_id
    LEFT JOIN utenti u ON u.id = c.coordinatore_id
    WHERE c.data BETWEEN ? AND ?
    ORDER BY c.data, c.ora_inizio`).bind(da, a).all();
  return results;
}

async function salvaCorso(env, id, body) {
  richiedi(body, ['tipo', 'data']);
  const valori = [body.committente_id || null, body.tipo, body.data, body.ora_inizio || null, body.ora_fine || null,
    body.sede || null, Number(body.istruttori_richiesti) || 2, body.coordinatore_id || null, body.stato || 'bozza', body.note || null];
  if (id) {
    await env.DB.prepare(`UPDATE corsi SET committente_id=?, tipo=?, data=?, ora_inizio=?, ora_fine=?, sede=?,
      istruttori_richiesti=?, coordinatore_id=?, stato=?, note=? WHERE id=?`).bind(...valori, id).run();
    return { id };
  }
  return env.DB.prepare(`INSERT INTO corsi (committente_id, tipo, data, ora_inizio, ora_fine, sede,
    istruttori_richiesti, coordinatore_id, stato, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
    .bind(...valori).first();
}

/**
 * Tutti gli istruttori visti rispetto a un corso: disponibilità, abilitazione,
 * giornate negli ultimi 12 mesi (equità), altri impegni lo stesso giorno, eventuale ruolo assegnato.
 */
async function candidati(env, corso) {
  const { results } = await env.DB.prepare(`
    SELECT i.*, group_concat(ia.abilitazione) AS abilitazioni,
      d.risposta AS disponibilita, a.ruolo,
      (SELECT count(*) FROM assegnazioni a2 JOIN corsi c2 ON c2.id = a2.corso_id
        WHERE a2.istruttore_id = i.id AND c2.id != ?1 AND c2.stato != 'annullato'
          AND c2.data >= date('now', '-12 months')) AS giornate,
      (SELECT max(c2.data) FROM assegnazioni a2 JOIN corsi c2 ON c2.id = a2.corso_id
        WHERE a2.istruttore_id = i.id AND c2.id != ?1 AND c2.stato != 'annullato' AND c2.data < ?2) AS ultimo_corso,
      (SELECT count(*) FROM assegnazioni a2 JOIN corsi c2 ON c2.id = a2.corso_id
        WHERE a2.istruttore_id = i.id AND c2.id != ?1 AND c2.stato != 'annullato' AND c2.data = ?2) AS altri_stesso_giorno
    FROM istruttori i
    LEFT JOIN istruttori_abilitazioni ia ON ia.istruttore_id = i.id
    LEFT JOIN disponibilita d ON d.istruttore_id = i.id AND d.corso_id = ?1
    LEFT JOIN assegnazioni a ON a.istruttore_id = i.id AND a.corso_id = ?1
    GROUP BY i.id`).bind(corso.id, corso.data).all();

  const ordineRisposta = { si: 0, forse: 1, null: 2, no: 3 };
  return results
    .map(conAbilitazioni)
    .map((c) => ({ ...c, abilitato: c.abilitazioni.includes(corso.tipo) }))
    .sort((x, y) =>
      ordineRisposta[x.disponibilita] - ordineRisposta[y.disponibilita]
      || Number(y.abilitato) - Number(x.abilitato)
      || x.giornate - y.giornate
      || (x.ultimo_corso || '').localeCompare(y.ultimo_corso || '')
      || x.cognome.localeCompare(y.cognome));
}

function squadraDa(lista) {
  return lista.filter((c) => c.ruolo).map((c) => ({
    istruttore: c,
    ruolo: c.ruolo,
    disponibilita: c.disponibilita,
    altriCorsiStessoGiorno: c.altri_stesso_giorno,
  }));
}

async function dettaglioCorso(env, id) {
  const corso = await env.DB.prepare(`SELECT c.*, cm.nome AS committente FROM corsi c
    LEFT JOIN committenti cm ON cm.id = c.committente_id WHERE c.id = ?`).bind(id).first();
  if (!corso) throw new ErroreRichiesta('Corso non trovato', 404);
  const lista = await candidati(env, corso);
  return { corso, candidati: lista, avvisi: verificaSquadra(corso, squadraDa(lista)) };
}

async function impostaDisponibilita(env, corsoId, body) {
  richiedi(body, ['istruttore_id']);
  if (!body.risposta) {
    await env.DB.prepare('DELETE FROM disponibilita WHERE corso_id = ? AND istruttore_id = ?').bind(corsoId, body.istruttore_id).run();
  } else {
    await env.DB.prepare(`INSERT INTO disponibilita (corso_id, istruttore_id, risposta, fonte) VALUES (?, ?, ?, 'manuale')
      ON CONFLICT (corso_id, istruttore_id) DO UPDATE SET risposta = excluded.risposta, fonte = 'manuale', aggiornata_il = datetime('now')`)
      .bind(corsoId, body.istruttore_id, body.risposta).run();
  }
  return dettaglioCorso(env, corsoId);
}

async function assegna(env, utente, corsoId, body) {
  richiedi(body, ['istruttore_id', 'ruolo']);
  // Si assegna sempre; gli avvisi della squadra risultante vengono salvati come "ignorati"
  await env.DB.prepare(`INSERT INTO assegnazioni (corso_id, istruttore_id, ruolo, assegnata_da) VALUES (?, ?, ?, ?)
    ON CONFLICT (corso_id, istruttore_id) DO UPDATE SET ruolo = excluded.ruolo, assegnata_da = excluded.assegnata_da,
    assegnata_il = datetime('now')`).bind(corsoId, body.istruttore_id, body.ruolo, utente.id).run();

  const dettaglio = await dettaglioCorso(env, corsoId);
  const suoi = dettaglio.avvisi.filter((a) => a.istruttore_id === Number(body.istruttore_id) || !a.istruttore_id);
  await env.DB.prepare('UPDATE assegnazioni SET avvisi_ignorati = ? WHERE corso_id = ? AND istruttore_id = ?')
    .bind(suoi.length ? JSON.stringify(suoi) : null, corsoId, body.istruttore_id).run();
  return dettaglio;
}

// ---------- Utenti (solo admin) ----------

async function salvaUtente(env, id, body) {
  richiedi(body, ['email', 'nome', 'ruolo']);
  const valori = [body.email.trim(), body.nome.trim(), body.ruolo, body.attivo === false ? 0 : 1];
  if (id) {
    await env.DB.prepare('UPDATE utenti SET email=?, nome=?, ruolo=?, attivo=? WHERE id=?').bind(...valori, id).run();
    return { id };
  }
  return env.DB.prepare('INSERT INTO utenti (email, nome, ruolo, attivo) VALUES (?, ?, ?, ?) RETURNING id').bind(...valori).first();
}

// ---------- Router ----------

const rotte = [
  ['GET', /^\/api\/me$/, (ctx) => ctx.utente],
  ['GET', /^\/api\/abilitazioni$/, async ({ env }) => (await env.DB.prepare('SELECT * FROM abilitazioni ORDER BY codice').all()).results],

  ['GET', /^\/api\/istruttori$/, ({ env }) => listaIstruttori(env)],
  ['POST', /^\/api\/istruttori$/, ({ env, body }) => salvaIstruttore(env, null, body)],
  ['PUT', /^\/api\/istruttori\/(\d+)$/, ({ env, body, p }) => salvaIstruttore(env, Number(p[1]), body)],

  ['GET', /^\/api\/committenti$/, async ({ env }) => (await env.DB.prepare('SELECT * FROM committenti ORDER BY nome').all()).results],
  ['POST', /^\/api\/committenti$/, ({ env, body }) => salvaCommittente(env, null, body)],
  ['PUT', /^\/api\/committenti\/(\d+)$/, ({ env, body, p }) => salvaCommittente(env, Number(p[1]), body)],

  ['GET', /^\/api\/corsi$/, ({ env, url }) => listaCorsi(env, url)],
  ['POST', /^\/api\/corsi$/, ({ env, body }) => salvaCorso(env, null, body)],
  ['GET', /^\/api\/corsi\/(\d+)$/, ({ env, p }) => dettaglioCorso(env, Number(p[1]))],
  ['PUT', /^\/api\/corsi\/(\d+)$/, ({ env, body, p }) => salvaCorso(env, Number(p[1]), body)],
  ['DELETE', /^\/api\/corsi\/(\d+)$/, async ({ env, p }) => {
    await env.DB.prepare('DELETE FROM corsi WHERE id = ?').bind(Number(p[1])).run();
    return { ok: true };
  }],
  ['PUT', /^\/api\/corsi\/(\d+)\/disponibilita$/, ({ env, body, p }) => impostaDisponibilita(env, Number(p[1]), body)],
  ['POST', /^\/api\/corsi\/(\d+)\/assegnazioni$/, ({ env, utente, body, p }) => assegna(env, utente, Number(p[1]), body)],
  ['DELETE', /^\/api\/corsi\/(\d+)\/assegnazioni\/(\d+)$/, async ({ env, p }) => {
    await env.DB.prepare('DELETE FROM assegnazioni WHERE corso_id = ? AND istruttore_id = ?').bind(Number(p[1]), Number(p[2])).run();
    return dettaglioCorso(env, Number(p[1]));
  }],

  ['GET', /^\/api\/utenti$/, async ({ env }) => (await env.DB.prepare('SELECT * FROM utenti ORDER BY nome').all()).results],
  ['POST', /^\/api\/utenti$/, ({ env, body }) => salvaUtente(env, null, body), 'admin'],
  ['PUT', /^\/api\/utenti\/(\d+)$/, ({ env, body, p }) => salvaUtente(env, Number(p[1]), body), 'admin'],
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      const utente = await utenteCorrente(request, env);
      if (!utente) return errore('Accesso non autorizzato', 403);

      for (const [metodo, regex, handler, ruolo] of rotte) {
        const p = url.pathname.match(regex);
        if (!p || request.method !== metodo) continue;
        if (ruolo && utente.ruolo !== ruolo) return errore('Operazione riservata all\'amministratore', 403);
        const body = ['POST', 'PUT'].includes(metodo) ? await request.json() : null;
        return json(await handler({ env, url, utente, body, p }));
      }
      return errore('Non trovato', 404);
    } catch (e) {
      if (e instanceof ErroreRichiesta) return errore(e.message, e.status);
      console.error(e);
      return errore('Errore interno', 500);
    }
  },
};
