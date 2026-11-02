// Export in Excel (.xlsx) senza librerie: un foglio solo, intestazione in grassetto e bloccata.
// Meglio di un CSV: Excel non scambia i telefoni "+39 …" per formule né li trasforma in numeri.

const enc = new TextEncoder();

const xml = (s) => String(s)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// A, B, … Z, AA, AB…
function colonna(n) {
  let s = '';
  for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function cella(valore, rif, stile) {
  const s = stile ? ` s="${stile}"` : '';
  if (valore === null || valore === undefined || valore === '') return '';
  if (typeof valore === 'number') return `<c r="${rif}"${s}><v>${valore}</v></c>`;
  return `<c r="${rif}"${s} t="inlineStr"><is><t xml:space="preserve">${xml(valore)}</t></is></c>`;
}

function foglio(intestazione, righe) {
  // Larghezza delle colonne dal testo più lungo, entro un massimo
  const larghezze = intestazione.map((t, c) => Math.min(60, Math.max(String(t).length,
    ...righe.map((r) => Math.max(...String(r[c] ?? '').split('\n').map((l) => l.length)))) + 2));
  const riga = (valori, n, stile) =>
    `<row r="${n}">${valori.map((v, c) => cella(v, colonna(c) + n, stile)).join('')}</row>`;
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    + `<cols>${larghezze.map((l, c) => `<col min="${c + 1}" max="${c + 1}" width="${l}" customWidth="1"/>`).join('')}</cols>`
    + `<sheetData>${riga(intestazione, 1, 1)}${righe.map((r, i) => riga(r, i + 2)).join('')}</sheetData>`
    + '</worksheet>';
}

const TIPO = 'application/vnd.openxmlformats-officedocument.spreadsheetml';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const fileFissi = (nomeFoglio) => ({
  '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + `<Override PartName="/xl/workbook.xml" ContentType="${TIPO}.sheet.main+xml"/>`
    + `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="${TIPO}.worksheet+xml"/>`
    + `<Override PartName="/xl/styles.xml" ContentType="${TIPO}.styles+xml"/>`
    + '</Types>',
  '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${REL}">`
    + `<sheets><sheet name="${xml(nomeFoglio)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + `<Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>`
    + `<Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
  // Stile 0 normale, 1 grassetto (intestazione)
  'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
    + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
    + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
    + '</styleSheet>',
});

const TABELLA_CRC = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xEDB88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});

function crc32(dati) {
  let c = 0xFFFFFFFF;
  for (const b of dati) c = TABELLA_CRC[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** Archivio ZIP senza compressione: per un foglio di poche centinaia di righe basta. */
function zip(file) {
  const parti = [];
  const centrale = [];
  let posizione = 0;
  for (const [nome, testo] of Object.entries(file)) {
    const n = enc.encode(nome);
    const dati = enc.encode(testo);
    const crc = crc32(dati);
    // Campi comuni a intestazione locale e centrale: versione, flag, metodo, ora, data, crc, dimensioni, lunghezza nome
    const comune = (v) => {
      v.setUint16(0, 20, true); v.setUint16(2, 0x0800, true); v.setUint16(4, 0, true);
      v.setUint16(6, 0, true); v.setUint16(8, 0x21, true); v.setUint32(10, crc, true);
      v.setUint32(14, dati.length, true); v.setUint32(18, dati.length, true); v.setUint16(22, n.length, true);
    };
    const locale = new Uint8Array(30 + n.length);
    const vl = new DataView(locale.buffer);
    vl.setUint32(0, 0x04034b50, true);
    comune(new DataView(locale.buffer, 4));
    locale.set(n, 30);

    const voce = new Uint8Array(46 + n.length);
    const vc = new DataView(voce.buffer);
    vc.setUint32(0, 0x02014b50, true);
    vc.setUint16(4, 20, true);
    comune(new DataView(voce.buffer, 6));
    vc.setUint32(42, posizione, true);
    voce.set(n, 46);

    parti.push(locale, dati);
    centrale.push(voce);
    posizione += locale.length + dati.length;
  }
  const dimensione = centrale.reduce((s, v) => s + v.length, 0);
  const fine = new Uint8Array(22);
  const vf = new DataView(fine.buffer);
  vf.setUint32(0, 0x06054b50, true);
  vf.setUint16(8, centrale.length, true);
  vf.setUint16(10, centrale.length, true);
  vf.setUint32(12, dimensione, true);
  vf.setUint32(16, posizione, true);

  const tutto = new Uint8Array(posizione + dimensione + fine.length);
  let p = 0;
  for (const parte of [...parti, ...centrale, fine]) { tutto.set(parte, p); p += parte.length; }
  return tutto;
}

/** File .xlsx con un foglio: intestazione e righe sono elenchi di valori (testo o numero). */
export function fileExcel(nomeFoglio, intestazione, righe) {
  return zip({ ...fileFissi(nomeFoglio), 'xl/worksheets/sheet1.xml': foglio(intestazione, righe) });
}

export const TIPO_EXCEL = `${TIPO}.sheet`;
