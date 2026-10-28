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

1. `npm run deploy`: pubblica il Worker (al primo giro crea anche il database D1), poi applica le migrazioni.
   Su Workers Builds: Build command vuoto, Deploy command `npm run deploy`.
2. Settings → Variables and Secrets: `ADMIN_EMAIL` (testo) e `ADMIN_SETUP_CODE` (secret, un codice lungo a piacere).
3. Apri il sito → "Primo accesso amministratore" → email, codice e la tua password.

## Accesso

Login con email e password gestito dall'app (stesso schema di EMSyShift): password con PBKDF2,
sessione di 7 giorni in un cookie httpOnly, nel database solo hash.

- L'amministratore crea gli utenti da "Utenti" e invia loro il **link di attivazione** (7 giorni, uso singolo)
  con cui scelgono la password. Lo stesso pulsante genera un link per reimpostare una password dimenticata.
- `ADMIN_SETUP_CODE` serve anche a recuperare l'accesso amministratore. Eliminando il secret, quella via si chiude.
