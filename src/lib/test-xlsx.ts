/**
 * Test helper, never imported by the app: builds small .xlsx files (a ZIP of XML files)
 * so the spreadsheet reader can be tested without binary fixtures. The CRC is left at 0:
 * the reader does not check it.
 */
const enc = new TextEncoder();

async function deflateRaw(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export async function zipFiles(files: Record<string, string>, compress = true): Promise<Uint8Array<ArrayBuffer>> {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = enc.encode(text);
    const data = compress ? await deflateRaw(raw) : raw;
    const nameBytes = enc.encode(name);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, compress ? 8 : 0, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    const entry = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(entry.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, compress ? 8 : 0, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    entry.set(nameBytes, 46);
    parts.push(local, data);
    central.push(entry);
    offset += local.length + data.length;
  }
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(
    12,
    central.reduce((n, c) => n + c.length, 0),
    true,
  );
  ev.setUint32(16, offset, true);
  return concat([...parts, ...central, end]);
}

export const SHEET_NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
export const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A one-sheet workbook: numbers stored as numbers, text as inline strings, '' as an empty cell. */
export function simpleXlsx(rows: (string | number)[][]): Promise<Uint8Array<ArrayBuffer>> {
  const sheetData = rows
    .map((row, i) => {
      const cells = row
        .map((v, j) => {
          const ref = `${String.fromCharCode(65 + j)}${i + 1}`;
          if (v === '') return '';
          return typeof v === 'number'
            ? `<c r="${ref}"><v>${v}</v></c>`
            : `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(v)}</t></is></c>`;
        })
        .join('');
      return `<row r="${i + 1}">${cells}</row>`;
    })
    .join('');
  return zipFiles({
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types/>',
    'xl/workbook.xml': `<workbook ${SHEET_NS} xmlns:r="${REL_NS}"><sheets><sheet name="Folha1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL_NS}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    'xl/worksheets/sheet1.xml': `<worksheet ${SHEET_NS}><sheetData>${sheetData}</sheetData></worksheet>`,
  });
}
