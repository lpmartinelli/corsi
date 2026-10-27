# Corsi

Gestione dei corsi di formazione: corsi, istruttori, disponibilità e assegnazioni eque.
Cloudflare Worker + D1, frontend statico in `public/`.

## Sviluppo locale

```powershell
npm install
copy .dev.vars.example .dev.vars   # imposta la tua email
npm run db:migrate:local
npm run dev                        # http://localhost:8787
npm test                           # test delle regole di composizione
```

In locale l'utente è `DEV_USER_EMAIL`. Al primo accesso, l'email `ADMIN_EMAIL` diventa amministratore.

## Regole di composizione

Le regole in `src/regole.js` non bloccano mai un'assegnazione: producono avvisi.
Se il coordinatore assegna comunque, gli avvisi restano salvati in `assegnazioni.avvisi_ignorati`.

- un direttore per corso, con la qualifica di direttore
- squadra di almeno `istruttori_richiesti` persone (direttore incluso)
- per ogni tecnico serve un sanitario (solo sanitari: nessun limite)
- istruttori abilitati al tipo di corso, disponibili, attivi, non impegnati lo stesso giorno

Equità: si contano le giornate assegnate negli ultimi 12 mesi (anche quelle già programmate). A parità di giornate, viene prima chi ha l'ultimo corso più lontano.

## Pubblicazione

1. `npx wrangler deploy` (crea anche il database D1), poi `npm run db:migrate:remote`
2. Cloudflare Zero Trust → Access → proteggi il dominio del Worker con una policy sulle email di admin e coordinatori
3. Imposta le variabili `ACCESS_TEAM_DOMAIN` (es. `https://<team>.cloudflareaccess.com`), `ACCESS_AUD` e `ADMIN_EMAIL`
