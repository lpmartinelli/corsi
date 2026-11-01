// Controlli sui dati anagrafici degli istruttori. Nessuna dipendenza dal Worker, così è testabile con node.

const PATTERN_CF = /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/;
// Valori dei caratteri in posizione dispari (1ª, 3ª...), per A-Z; le cifre 0-9 valgono come A-J
const DISPARI = [1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23];

export const normalizzaCodiceFiscale = (cf) => String(cf ?? '').replace(/\s+/g, '').toUpperCase();

/** Codice fiscale di persona fisica (anche omocodico), con il controllo dell'ultimo carattere. */
export function codiceFiscaleValido(cf) {
  if (!PATTERN_CF.test(cf)) return false;
  let somma = 0;
  for (let i = 0; i < 15; i++) {
    const c = cf[i];
    const indice = c >= '0' && c <= '9' ? Number(c) : c.charCodeAt(0) - 65;
    somma += i % 2 === 0 ? DISPARI[indice] : indice;
  }
  return String.fromCharCode(65 + (somma % 26)) === cf[15];
}

export const emailValida = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
