// Identifica l'utente tramite Cloudflare Access.
// In produzione verifica il JWT firmato da Access (ACCESS_TEAM_DOMAIN + ACCESS_AUD).
// In sviluppo locale usa DEV_USER_EMAIL da .dev.vars.

let certsCache = { url: null, keys: null, scade: 0 };

async function chiaviAccess(teamDomain) {
  const url = `${teamDomain}/cdn-cgi/access/certs`;
  if (certsCache.url === url && certsCache.scade > Date.now()) return certsCache.keys;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Impossibile scaricare i certificati Access: ${res.status}`);
  const { keys } = await res.json();
  certsCache = { url, keys, scade: Date.now() + 60 * 60 * 1000 };
  return keys;
}

function base64url(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

async function verificaJwt(token, env) {
  const [h, p, s] = token.split('.');
  if (!s) return null;
  const header = JSON.parse(new TextDecoder().decode(base64url(h)));
  const payload = JSON.parse(new TextDecoder().decode(base64url(p)));

  const jwk = (await chiaviAccess(env.ACCESS_TEAM_DOMAIN)).find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valida = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, base64url(s), new TextEncoder().encode(`${h}.${p}`));
  if (!valida) return null;

  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.ACCESS_AUD)) return null;
  if (payload.exp * 1000 < Date.now()) return null;
  return payload.email;
}

async function emailDaRichiesta(request, env) {
  if (env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) {
    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    return token ? verificaJwt(token, env) : null;
  }
  return env.DEV_USER_EMAIL || null;
}

/** Restituisce l'utente attivo o null. Il primo accesso di ADMIN_EMAIL crea l'amministratore. */
export async function utenteCorrente(request, env) {
  const email = await emailDaRichiesta(request, env);
  if (!email) return null;

  const utente = await env.DB.prepare('SELECT * FROM utenti WHERE email = ? AND attivo = 1').bind(email).first();
  if (utente) return utente;

  if (env.ADMIN_EMAIL && email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase()) {
    return env.DB.prepare("INSERT INTO utenti (email, nome, ruolo) VALUES (?, ?, 'admin') RETURNING *")
      .bind(email, email.split('@')[0])
      .first();
  }
  return null;
}
