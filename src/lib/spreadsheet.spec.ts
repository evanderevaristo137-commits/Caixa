import { describe, expect, it } from 'vitest';
import { planImport } from '../domain/import-products';
import { decodeText, readSpreadsheet, SpreadsheetError } from './spreadsheet';

const enc = new TextEncoder();

async function deflateRaw(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** A minimal ZIP writer, enough to build test .xlsx files (the reader ignores the CRC). */
async function zip(files: Record<string, string>, compress: boolean): Promise<Uint8Array> {
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

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// As Excel writes them: shared strings, a hidden first sheet, numbers, a formula, rich text, sparse cells.
const excelFiles = {
  '[Content_Types].xml': '<?xml version="1.0"?><Types/>',
  'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook ${NS} xmlns:r="${REL}"><sheets><sheet name="Antiga" sheetId="2" state="hidden" r:id="rId2"/><sheet name="Produtos" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId3" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId2" Type="${REL}/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId1" Type="${REL}/worksheet" Target="/xl/worksheets/sheet1.xml"/></Relationships>`,
  'xl/sharedStrings.xml': `<sst ${NS} count="6" uniqueCount="6"><si><t>Produto</t></si><si><t>Preço (Kz)</t></si><si><t>Código de barras</t></si><si><r><t xml:space="preserve">Óleo </t></r><r><rPr><b/></rPr><t>&amp; vinagre</t></r></si><si><t>Arroz_x000A_agulha</t></si><si><t/></si></sst>`,
  'xl/worksheets/sheet2.xml': `<worksheet ${NS}><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Folha escondida</t></is></c></row></sheetData></worksheet>`,
  'xl/worksheets/sheet1.xml': `<worksheet ${NS}><dimension ref="A1:C8"/><cols><col min="1" max="1" width="30"/></cols><sheetData>
<row r="1" spans="1:3"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>
<row r="3" spans="1:3"><c r="A3" t="s"><v>3</v></c><c r="B3" s="1"><v>1850.5</v></c><c r="C3"><v>2000000000017</v></c></row>
<row r="4"><c r="A4" t="s"><v>4</v></c><c r="B4"><f>B3*0.6</f><v>1110.3000000000002</v></c></row>
<row r="5"><c r="A5" t="inlineStr"><is><t>Sumo</t></is></c><c r="B5" s="2"/><c r="C5" t="str"><f>"0012345678905"</f><v>0012345678905</v></c></row>
<row r="6" spans="1:3" ht="15"/>
<row r="7"><c t="inlineStr"><is><t>Pão</t></is></c><c><v>150</v></c></row>
<row r="8"><c r="A8" t="e"><v>#N/A</v></c><c r="B8" t="b"><v>1</v></c></row>
</sheetData></worksheet>`,
};

describe('reading Excel files (.xlsx)', () => {
  it('reads the first visible sheet as Excel writes it', async () => {
    const rows = await readSpreadsheet(await zip(excelFiles, true));
    expect(rows).toEqual([
      { line: 1, cells: ['Produto', 'Preço (Kz)', 'Código de barras'] },
      { line: 3, cells: ['Óleo & vinagre', '1850.5', '2000000000017'] },
      { line: 4, cells: ['Arroz\nagulha', '1110.3'] },
      { line: 5, cells: ['Sumo', '', '0012345678905'] },
      { line: 7, cells: ['Pão', '150'] },
    ]);
    // Straight into the import plan: numbers stay whole, barcodes keep their digits.
    const plan = planImport(rows, []);
    expect(plan.rows.map((r) => [r.line, r.product.name, r.product.priceCents, r.product.barcode])).toEqual([
      [3, 'Óleo & vinagre', 185_050, '2000000000017'],
      [4, 'Arroz\nagulha', 111_030, undefined],
      [7, 'Pão', 15_000, undefined],
    ]);
    expect(plan.errors).toEqual([{ line: 5, message: 'falta o preço' }]);
  });

  it('reads files without compression, with XML prefixes and without relationships', async () => {
    const files = {
      'xl/workbook.xml': `<x:workbook xmlns:x="m" xmlns:r="${REL}"><x:sheets><x:sheet name="Folha1" sheetId="1" r:id="rId1"/></x:sheets></x:workbook>`,
      'xl/worksheets/sheet1.xml': `<x:worksheet xmlns:x="m"><x:sheetData><x:row r="1"><x:c r="A1" t="inlineStr"><x:is><x:t>Produto</x:t></x:is></x:c><x:c r="B1" t="inlineStr"><x:is><x:t>Preço</x:t></x:is></x:c></x:row><x:row r="2"><x:c r="A2" t="inlineStr"><x:is><x:t>Sal</x:t></x:is></x:c><x:c r="B2"><x:v>300</x:v></x:c></x:row></x:sheetData></x:worksheet>`,
    };
    expect(await readSpreadsheet(await zip(files, false))).toEqual([
      { line: 1, cells: ['Produto', 'Preço'] },
      { line: 2, cells: ['Sal', '300'] },
    ]);
  });

  it('explains what it cannot read', async () => {
    const fail = (bytes: Uint8Array) =>
      readSpreadsheet(bytes).then(
        () => 'read',
        (e: unknown) => (e instanceof SpreadsheetError ? e.code : String(e)),
      );
    expect(await fail(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]))).toBe('old_excel');
    expect(await fail(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).toBe('unreadable');
    expect(await fail(await zip({ 'content.xml': '<office/>' }, true))).toBe('unreadable'); // LibreOffice (.ods)
    expect(await fail(new Uint8Array(10 * 1024 * 1024 + 1))).toBe('too_big');
  });
});

describe('reading CSV files', () => {
  it('reads UTF-8, the old Windows encoding and "Unicode text" from Excel', async () => {
    expect(decodeText(enc.encode('Preço;Pão'))).toBe('Preço;Pão');
    // "Preço" in Windows-1252: ç is a single byte (0xE7), not valid UTF-8.
    expect(decodeText(new Uint8Array([0x50, 0x72, 0x65, 0xe7, 0x6f]))).toBe('Preço');
    const utf16 = new Uint8Array([0xff, 0xfe, ...[...'Pão'].flatMap((ch) => [ch.charCodeAt(0), 0])]);
    expect(decodeText(utf16)).toBe('Pão');
    expect(await readSpreadsheet(enc.encode('Produto;Preço\nPão;150'))).toEqual([
      { line: 1, cells: ['Produto', 'Preço'] },
      { line: 2, cells: ['Pão', '150'] },
    ]);
  });
});
