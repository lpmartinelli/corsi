import {
  PASSWORD_MINIMA, apriSessione, chiudiSessione, cookieSessione, creaAttivazione, hashPassword, hashToken,
  pubblico, stringheUguali, utenteCorrente, verificaPassword,
} from './auth.js';
import { puoRicevere, verificaSquadra } from './regole.js';

const VALIDITA_LINK_MS = 30 * 24 * 60 * 60 * 1000;

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
    body.direttore ? 1 : 0, body.albo_ausl ? 1 : 0, body.irc ? 1 : 0, body.irccom ? 1 : 0, body.attivo === false ? 0 : 1, body.note || null];

  if (id) {
    await env.DB.prepare(`UPDATE istruttori SET nome=?, cognome=?, telefono=?, profilo=?, direttore=?, albo_ausl=?, irc=?, irccom=?,
      attivo=?, note=? WHERE id=?`).bind(...valori, id).run();
  } else {
    ({ id } = await env.DB.prepare(`INSERT INTO istruttori (nome, cognome, telefono, profilo, direttore, albo_ausl, irc, irccom, attivo, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`).bind(...valori).first());
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
  const valori = [body.committente_id || null, body.categoria || 'volontari', body.circuito || null, body.tipo, body.retraining ? 1 : 0,
    body.data, body.ora_inizio || null, body.ora_fine || null, body.sede || null, Number(body.istruttori_richiesti) || 2,
    body.coordinatore_id || null, body.stato || 'bozza', body.note || null];
  if (id) {
    await env.DB.prepare(`UPDATE corsi SET committente_id=?, categoria=?, circuito=?, tipo=?, retraining=?, data=?, ora_inizio=?, ora_fine=?,
      sede=?, istruttori_richiesti=?, coordinatore_id=?, stato=?, note=? WHERE id=?`).bind(...valori, id).run();
    return { id };
  }
  return env.DB.prepare(`INSERT INTO corsi (committente_id, categoria, circuito, tipo, retraining, data, ora_inizio, ora_fine, sede,
    istruttori_richiesti, coordinatore_id, stato, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
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
    .map((c) => ({ ...c, abilitato: puoRicevere({ ...c, attivo: 1 }, corso) }))
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

// ---------- Richieste di disponibilità ----------

// 128 bit in base64url: 22 caratteri, abbastanza corto per un messaggio WhatsApp
function tokenLink() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function corsiValidi(env, ids) {
  const { results } = await env.DB.prepare(`SELECT c.*, cm.nome AS committente FROM corsi c
    LEFT JOIN committenti cm ON cm.id = c.committente_id
    WHERE c.id IN (SELECT value FROM json_each(?)) AND c.stato != 'annullato'
    ORDER BY c.data, c.ora_inizio`).bind(JSON.stringify(ids.map(Number))).all();
  return results;
}

/** Proposta di destinatari per i corsi scelti: per ogni istruttore attivo, i corsi che può ricevere secondo le regole. */
async function anteprimaInvio(env, url) {
  const corsi = await corsiValidi(env, (url.searchParams.get('corsi') || '').split(',').filter(Boolean));
  const istruttori = (await listaIstruttori(env)).filter((i) => i.attivo)
    .map((i) => ({ ...i, idonei: corsi.filter((c) => puoRicevere(i, c)).map((c) => c.id) }));
  return { corsi, istruttori };
}

/**
 * Crea un invio con i destinatari scelti dal coordinatore: per ognuno una richiesta con il suo link personale.
 * La scelta può scostarsi dalle regole (mai bloccanti). I corsi in bozza passano a "richiesta".
 * Le righe passano come un solo parametro JSON (json_each): D1 ha limiti su query per richiesta e parametri per query.
 */
async function creaInvio(env, utente, body) {
  const scelti = (body.destinatari || []).map((d) => ({ i: Number(d.istruttore_id), corsi: (d.corsi || []).map(Number) }));
  const corsi = await corsiValidi(env, [...new Set(scelti.flatMap((d) => d.corsi))]);
  const validi = new Set(corsi.map((c) => c.id));
  const attivi = new Set((await listaIstruttori(env)).filter((i) => i.attivo).map((i) => i.id));
  const destinatari = scelti
    .filter((d) => attivi.has(d.i))
    .map((d) => ({ i: d.i, t: tokenLink(), corsi: d.corsi.filter((c) => validi.has(c)) }))
    .filter((d) => d.corsi.length);
  if (!destinatari.length) throw new ErroreRichiesta('Nessun destinatario selezionato');

  const { id } = await env.DB.prepare('INSERT INTO invii (creato_da) VALUES (?) RETURNING id').bind(utente.id).first();
  const scade = new Date(Date.now() + VALIDITA_LINK_MS).toISOString();
  const coppie = destinatari.flatMap((d) => d.corsi.map((c) => ({ t: d.t, c })));
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO richieste (istruttore_id, token, scade_il, creata_da, invio_id)
      SELECT value ->> 'i', value ->> 't', ?2, ?3, ?4 FROM json_each(?1)`)
      .bind(JSON.stringify(destinatari.map(({ i, t }) => ({ i, t }))), scade, utente.id, id),
    env.DB.prepare(`INSERT INTO richieste_corsi (richiesta_id, corso_id)
      SELECT r.id, j.value ->> 'c' FROM json_each(?) j JOIN richieste r ON r.token = j.value ->> 't'`)
      .bind(JSON.stringify(coppie)),
    env.DB.prepare(`UPDATE corsi SET stato = 'richiesta' WHERE stato = 'bozza' AND id IN (SELECT value FROM json_each(?))`)
      .bind(JSON.stringify(corsi.map((c) => c.id))),
  ]);
  return dettaglioInvio(env, id);
}

async function listaInvii(env) {
  const corsiInvio = `FROM richieste r JOIN richieste_corsi rc ON rc.richiesta_id = r.id JOIN corsi c ON c.id = rc.corso_id WHERE r.invio_id = v.id`;
  const { results } = await env.DB.prepare(`
    SELECT v.id, v.creato_il, u.nome AS creato_da,
      (SELECT count(*) FROM richieste r WHERE r.invio_id = v.id) AS richieste,
      (SELECT count(*) FROM richieste r WHERE r.invio_id = v.id AND r.inviata_il IS NOT NULL) AS inviate,
      (SELECT count(DISTINCT c.id) ${corsiInvio}) AS corsi,
      (SELECT min(c.data) ${corsiInvio}) AS dal,
      (SELECT max(c.data) ${corsiInvio}) AS al
    FROM invii v LEFT JOIN utenti u ON u.id = v.creato_da
    ORDER BY v.id DESC`).all();
  return results;
}

async function dettaglioInvio(env, id) {
  const invio = await env.DB.prepare('SELECT * FROM invii WHERE id = ?').bind(id).first();
  if (!invio) throw new ErroreRichiesta('Invio non trovato', 404);
  const [{ results: corsi }, { results: richieste }] = await env.DB.batch([
    env.DB.prepare(`SELECT DISTINCT c.*, cm.nome AS committente FROM richieste r
      JOIN richieste_corsi rc ON rc.richiesta_id = r.id JOIN corsi c ON c.id = rc.corso_id
      LEFT JOIN committenti cm ON cm.id = c.committente_id
      WHERE r.invio_id = ? ORDER BY c.data, c.ora_inizio`).bind(id),
    env.DB.prepare(`SELECT r.id, r.token, r.scade_il, r.inviata_il, i.id AS istruttore_id, i.nome, i.cognome, i.telefono,
        group_concat(rc.corso_id) AS corsi,
        (SELECT count(*) FROM disponibilita d JOIN richieste_corsi rc2 ON rc2.corso_id = d.corso_id
          WHERE rc2.richiesta_id = r.id AND d.istruttore_id = r.istruttore_id) AS risposte
      FROM richieste r JOIN istruttori i ON i.id = r.istruttore_id
      JOIN richieste_corsi rc ON rc.richiesta_id = r.id
      WHERE r.invio_id = ? GROUP BY r.id ORDER BY i.cognome, i.nome`).bind(id),
  ]);
  return { invio, corsi, richieste: richieste.map((r) => ({ ...r, corsi: r.corsi.split(',').map(Number) })) };
}

// ---------- Pagina pubblica dell'istruttore (accesso col solo link) ----------

async function richiestaDaToken(env, token) {
  const richiesta = await env.DB.prepare(`SELECT r.*, i.nome FROM richieste r JOIN istruttori i ON i.id = r.istruttore_id
    WHERE r.token = ? AND r.scade_il > ? AND i.attivo = 1`).bind(token, new Date().toISOString()).first();
  if (!richiesta) throw new ErroreRichiesta('Link non valido o scaduto', 404);
  return richiesta;
}

async function corsiDellaRichiesta(env, richiesta) {
  const oggi = new Date().toISOString().slice(0, 10);
  const { results } = await env.DB.prepare(`
    SELECT c.id, c.categoria, c.tipo, c.retraining, c.data, c.ora_inizio, c.ora_fine, c.sede, c.stato,
      cm.nome AS committente, d.risposta
    FROM richieste_corsi rc JOIN corsi c ON c.id = rc.corso_id
    LEFT JOIN committenti cm ON cm.id = c.committente_id
    LEFT JOIN disponibilita d ON d.corso_id = c.id AND d.istruttore_id = ?
    WHERE rc.richiesta_id = ? ORDER BY c.data, c.ora_inizio`).bind(richiesta.istruttore_id, richiesta.id).all();
  // Si risponde finché il corso è da organizzare; dopo l'assegnazione la risposta non serve più
  return results.map((c) => ({ ...c, modificabile: ['bozza', 'richiesta'].includes(c.stato) && c.data >= oggi }));
}

async function paginaRichiesta(env, token) {
  const richiesta = await richiestaDaToken(env, token);
  return { nome: richiesta.nome, scade_il: richiesta.scade_il, corsi: await corsiDellaRichiesta(env, richiesta) };
}

async function rispondi(env, token, body) {
  if (!['si', 'no', 'forse'].includes(body.risposta)) throw new ErroreRichiesta('Risposta non valida');
  const richiesta = await richiestaDaToken(env, token);
  const corso = (await corsiDellaRichiesta(env, richiesta)).find((c) => c.id === Number(body.corso_id));
  if (!corso) throw new ErroreRichiesta('Corso non trovato', 404);
  if (!corso.modificabile) throw new ErroreRichiesta('Per questo corso non si raccolgono più disponibilità');
  await env.DB.prepare(`INSERT INTO disponibilita (corso_id, istruttore_id, risposta, fonte) VALUES (?, ?, ?, 'link')
    ON CONFLICT (corso_id, istruttore_id) DO UPDATE SET risposta = excluded.risposta, fonte = 'link', aggiornata_il = datetime('now')`)
    .bind(corso.id, richiesta.istruttore_id, body.risposta).run();
  return { ok: true };
}

async function servePaginaRichiesta(env, url) {
  const pagina = await env.ASSETS.fetch(new URL('/disponibilita', url));
  const risposta = new Response(pagina.body, pagina);
  // Il token è nell'URL: non deve finire nei referrer né nei motori di ricerca
  risposta.headers.set('Referrer-Policy', 'no-referrer');
  risposta.headers.set('X-Robots-Tag', 'noindex');
  return risposta;
}

// ---------- Utenti (solo admin) ----------

async function salvaUtente(env, id, body) {
  richiedi(body, ['email', 'nome', 'ruolo']);
  const valori = [body.email.trim(), body.nome.trim(), body.ruolo, body.attivo === false ? 0 : 1];
  if (id) {
    await env.DB.prepare('UPDATE utenti SET email=?, nome=?, ruolo=?, attivo=? WHERE id=?').bind(...valori, id).run();
    if (body.attivo === false) await env.DB.prepare('DELETE FROM sessioni WHERE utente_id = ?').bind(id).run();
    return { id };
  }
  ({ id } = await env.DB.prepare('INSERT INTO utenti (email, nome, ruolo, attivo) VALUES (?, ?, ?, ?) RETURNING id').bind(...valori).first());
  return { id, token: await creaAttivazione(env, id) };
}

// ---------- Accesso ----------

function controllaPassword(password) {
  if (!password || password.length < PASSWORD_MINIMA) throw new ErroreRichiesta(`La password deve avere almeno ${PASSWORD_MINIMA} caratteri`);
}

async function rispostaConSessione(env, request, utente) {
  const token = await apriSessione(env, utente.id);
  return Response.json(pubblico(utente), { headers: { 'Set-Cookie': cookieSessione(request, token) } });
}

async function login(env, request, body) {
  richiedi(body, ['email', 'password']);
  const utente = await env.DB.prepare('SELECT * FROM utenti WHERE email = ? AND attivo = 1').bind(body.email.trim()).first();
  // Stesso messaggio per email inesistente e password errata: non si possono enumerare gli account
  if (!utente || !(await verificaPassword(body.password, utente.password_hash))) {
    throw new ErroreRichiesta('Email o password non corretti', 401);
  }
  return rispostaConSessione(env, request, utente);
}

/** Imposta la password tramite link di attivazione (primo accesso o reimpostazione) ed entra. */
async function attiva(env, request, body) {
  richiedi(body, ['token', 'password']);
  controllaPassword(body.password);
  const utente = await env.DB.prepare('SELECT * FROM utenti WHERE attivazione_hash = ? AND attivazione_scade > ? AND attivo = 1')
    .bind(await hashToken(body.token), new Date().toISOString()).first();
  if (!utente) throw new ErroreRichiesta('Link non valido o scaduto: chiedi all\'amministratore di generarne uno nuovo', 400);
  const hash = await hashPassword(body.password);
  await env.DB.batch([
    env.DB.prepare('UPDATE utenti SET password_hash = ?, attivazione_hash = NULL, attivazione_scade = NULL WHERE id = ?').bind(hash, utente.id),
    env.DB.prepare('DELETE FROM sessioni WHERE utente_id = ?').bind(utente.id),
  ]);
  return rispostaConSessione(env, request, { ...utente, password_hash: hash });
}

/**
 * Primo accesso (o recupero) dell'amministratore: richiede ADMIN_EMAIL e il codice segreto ADMIN_SETUP_CODE,
 * impostati in dashboard. Eliminando il secret, questa via d'accesso si chiude.
 */
async function primoAccesso(env, request, body) {
  richiedi(body, ['email', 'codice', 'password']);
  controllaPassword(body.password);
  const ok = env.ADMIN_EMAIL && env.ADMIN_SETUP_CODE
    && body.email.trim().toLowerCase() === env.ADMIN_EMAIL.toLowerCase()
    && (await stringheUguali(body.codice, env.ADMIN_SETUP_CODE));
  if (!ok) throw new ErroreRichiesta('Email o codice non corretti', 401);

  const hash = await hashPassword(body.password);
  const utente = await env.DB.prepare(`INSERT INTO utenti (email, nome, ruolo, password_hash) VALUES (?, ?, 'admin', ?)
    ON CONFLICT (email) DO UPDATE SET ruolo = 'admin', attivo = 1, password_hash = excluded.password_hash
    RETURNING *`).bind(env.ADMIN_EMAIL, env.ADMIN_EMAIL.split('@')[0], hash).first();
  await env.DB.prepare('DELETE FROM sessioni WHERE utente_id = ?').bind(utente.id).run();
  return rispostaConSessione(env, request, utente);
}

async function cambiaPassword(env, utente, body) {
  richiedi(body, ['attuale', 'nuova']);
  controllaPassword(body.nuova);
  if (!(await verificaPassword(body.attuale, utente.password_hash))) throw new ErroreRichiesta('Password attuale non corretta');
  await env.DB.prepare('UPDATE utenti SET password_hash = ? WHERE id = ?').bind(await hashPassword(body.nuova), utente.id).run();
  return { ok: true };
}

// ---------- Router ----------

// Accessibili senza sessione
const rottePubbliche = [
  ['POST', /^\/api\/auth\/login$/, ({ env, request, body }) => login(env, request, body)],
  ['POST', /^\/api\/auth\/attiva$/, ({ env, request, body }) => attiva(env, request, body)],
  ['POST', /^\/api\/auth\/primo-accesso$/, ({ env, request, body }) => primoAccesso(env, request, body)],
  ['GET', /^\/api\/pubblico\/([\w-]+)$/, ({ env, p }) => paginaRichiesta(env, p[1])],
  ['PUT', /^\/api\/pubblico\/([\w-]+)$/, ({ env, body, p }) => rispondi(env, p[1], body)],
  ['POST', /^\/api\/auth\/logout$/, async ({ env, request }) => {
    await chiudiSessione(env, request);
    return Response.json({ ok: true }, { headers: { 'Set-Cookie': cookieSessione(request, null) } });
  }],
];

const rotte = [
  ['GET', /^\/api\/me$/, ({ utente }) => pubblico(utente)],
  ['POST', /^\/api\/auth\/password$/, ({ env, utente, body }) => cambiaPassword(env, utente, body)],
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

  ['GET', /^\/api\/invii$/, ({ env }) => listaInvii(env)],
  ['POST', /^\/api\/invii$/, ({ env, utente, body }) => creaInvio(env, utente, body)],
  ['GET', /^\/api\/invii\/anteprima$/, ({ env, url }) => anteprimaInvio(env, url)],
  ['GET', /^\/api\/invii\/(\d+)$/, ({ env, p }) => dettaglioInvio(env, Number(p[1]))],
  ['DELETE', /^\/api\/invii\/(\d+)$/, async ({ env, p }) => {
    // Le disponibilità già date restano: si eliminano solo i link
    await env.DB.prepare('DELETE FROM invii WHERE id = ?').bind(Number(p[1])).run();
    return { ok: true };
  }],
  ['POST', /^\/api\/richieste\/(\d+)\/inviata$/, async ({ env, p }) => {
    await env.DB.prepare("UPDATE richieste SET inviata_il = datetime('now') WHERE id = ?").bind(Number(p[1])).run();
    return { ok: true };
  }],

  ['GET', /^\/api\/utenti$/, async ({ env }) => (await env.DB.prepare('SELECT * FROM utenti ORDER BY nome').all()).results.map(pubblico)],
  ['POST', /^\/api\/utenti$/, ({ env, body }) => salvaUtente(env, null, body), 'admin'],
  ['PUT', /^\/api\/utenti\/(\d+)$/, ({ env, body, p }) => salvaUtente(env, Number(p[1]), body), 'admin'],
  ['POST', /^\/api\/utenti\/(\d+)\/attivazione$/, async ({ env, p }) => ({ token: await creaAttivazione(env, Number(p[1])) }), 'admin'],
];

function trova(elenco, request, url) {
  for (const [metodo, regex, handler, ruolo] of elenco) {
    const p = url.pathname.match(regex);
    if (p && request.method === metodo) return { handler, ruolo, p };
  }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/d/')) return servePaginaRichiesta(env, url);
    try {
      const body = ['POST', 'PUT'].includes(request.method) ? await request.json().catch(() => ({})) : null;
      let utente = null;
      let rotta = trova(rottePubbliche, request, url);
      if (!rotta) {
        utente = await utenteCorrente(env, request);
        if (!utente) return errore('Accesso richiesto', 401);
        rotta = trova(rotte, request, url);
        if (!rotta) return errore('Non trovato', 404);
        if (rotta.ruolo && utente.ruolo !== rotta.ruolo) return errore('Operazione riservata all\'amministratore', 403);
      }
      const risultato = await rotta.handler({ env, request, url, utente, body, p: rotta.p });
      return risultato instanceof Response ? risultato : json(risultato);
    } catch (e) {
      if (e instanceof ErroreRichiesta) return errore(e.message, e.status);
      console.error(e);
      return errore('Errore interno', 500);
    }
  },
};
