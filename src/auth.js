// Login con email e password, sessioni in cookie httpOnly (stesso schema di EMSyShift).
// Il DB salva solo hash: PBKDF2 per le password, SHA-256 per i token di sessione e di attivazione.

const COOKIE = 'corsi_sessione';
const DURATA_SESSIONE_MS = 7 * 24 * 60 * 60 * 1000;
const DURATA_ATTIVAZIONE_MS = 7 * 24 * 60 * 60 * 1000;
const ITERAZIONI = 100_000;
export const PASSWORD_MINIMA = 8;

// ---------- Hash ----------

const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => Uint8Array.from(hex.match(/../g) || [], (h) => parseInt(h, 16));

async function pbkdf2(password, salt, iterazioni) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iterazioni, hash: 'SHA-256' }, key, 256);
  return new Uint8Array(bits);
}

function ugualiTempoCostante(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Formato salvato: "pbkdf2$<iterazioni>$<saltHex>$<hashHex>". */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERAZIONI}$${toHex(salt)}$${toHex(await pbkdf2(password, salt, ITERAZIONI))}`;
}

export async function verificaPassword(password, salvato) {
  const parti = salvato.split('$');
  if (parti.length !== 4 || parti[0] !== 'pbkdf2') return false; // include '' = in attesa di attivazione
  const [, iterazioni, salt, hash] = parti;
  return ugualiTempoCostante(await pbkdf2(password, fromHex(salt), Number(iterazioni)), fromHex(hash));
}

export const nuovoToken = () => toHex(crypto.getRandomValues(new Uint8Array(32)));

export async function hashToken(token) {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))));
}

export async function stringheUguali(a, b) {
  return ugualiTempoCostante(fromHex(await hashToken(a)), fromHex(await hashToken(b)));
}

// ---------- Sessioni ----------

export async function apriSessione(env, utenteId) {
  const token = nuovoToken();
  await env.DB.prepare('INSERT INTO sessioni (token_hash, utente_id, scadenza) VALUES (?, ?, ?)')
    .bind(await hashToken(token), utenteId, new Date(Date.now() + DURATA_SESSIONE_MS).toISOString()).run();
  return token;
}

export async function chiudiSessione(env, request) {
  const token = leggiCookie(request);
  if (token) await env.DB.prepare('DELETE FROM sessioni WHERE token_hash = ?').bind(await hashToken(token)).run();
}

function leggiCookie(request) {
  const header = request.headers.get('Cookie') || '';
  const trovato = header.split(';').map((c) => c.trim()).find((c) => c.startsWith(COOKIE + '='));
  return trovato ? trovato.slice(COOKIE.length + 1) : null;
}

export function cookieSessione(request, token) {
  // In locale (wrangler dev) si è su http: un cookie Secure verrebbe ignorato
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  const durata = token ? DURATA_SESSIONE_MS / 1000 : 0;
  return `${COOKIE}=${token || ''}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${durata}${secure}`;
}

/** Restituisce l'utente della sessione, se valida e se l'utente è attivo; altrimenti null. */
export async function utenteCorrente(env, request) {
  const token = leggiCookie(request);
  if (!token) return null;
  return env.DB.prepare(`SELECT u.* FROM sessioni s JOIN utenti u ON u.id = s.utente_id
    WHERE s.token_hash = ? AND s.scadenza > ? AND u.attivo = 1`)
    .bind(await hashToken(token), new Date().toISOString()).first();
}

// ---------- Link di attivazione ----------

/** Crea (o rigenera) il link di attivazione: serve sia al primo accesso sia per reimpostare la password. */
export async function creaAttivazione(env, utenteId) {
  const token = nuovoToken();
  await env.DB.prepare('UPDATE utenti SET attivazione_hash = ?, attivazione_scade = ? WHERE id = ?')
    .bind(await hashToken(token), new Date(Date.now() + DURATA_ATTIVAZIONE_MS).toISOString(), utenteId).run();
  return token;
}

/** Proiezione sicura dell'utente: gli hash non escono mai dal server. */
export function pubblico(u) {
  return { id: u.id, email: u.email, nome: u.nome, ruolo: u.ruolo, attivo: u.attivo, in_attesa: u.password_hash === '' };
}
