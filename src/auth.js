// Identifica l'utente tramite Cloudflare Access (scheda "Access" del Worker in dashboard):
// quando Access ha autenticato la richiesta, il runtime espone ctx.access con l'identità verificata.
// In sviluppo locale, senza Access, usa DEV_USER_EMAIL da .dev.vars.

async function emailDaRichiesta(env, ctx) {
  if (ctx.access) {
    const identita = await ctx.access.getIdentity();
    return identita?.email || null;
  }
  return env.DEV_USER_EMAIL || null;
}

/** Restituisce l'utente attivo o null. Il primo accesso di ADMIN_EMAIL crea l'amministratore. */
export async function utenteCorrente(env, ctx) {
  const email = await emailDaRichiesta(env, ctx);
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
