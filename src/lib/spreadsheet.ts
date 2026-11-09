import { parseCsv, type SheetRow } from '../domain/import-products';

/**
 * Reads the first sheet of an Excel file (.xlsx) or a CSV file, without libraries:
 * an .xlsx is a ZIP of XML files, opened with the browser's own DecompressionStream.
 * Everything happens on the phone; the file is never sent anywhere.
 */

export type SpreadsheetErrorCode = 'old_excel' | 'unreadable' | 'too_big';

export class SpreadsheetError extends Error {
  constructor(readonly code: SpreadsheetErrorCode) {
    super(code);
  }
}

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Limit for the unzipped XML (a ZIP can hide a huge file in a small one). */
const MAX_UNZIPPED_BYTES = 40 * 1024 * 1024;
/** Cells beyond this column are ignored. */
const MAX_COLUMNS = 200;

const startsWith = (bytes: Uint8Array, sig: number[]) => sig.every((b, i) => bytes[i] === b);

export async function readSpreadsheet(bytes: Uint8Array): Promise<SheetRow[]> {
  if (bytes.length > MAX_FILE_BYTES) throw new SpreadsheetError('too_big');
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return readXlsx(bytes);
  // Old Excel (.xls) and other OLE documents.
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) throw new SpreadsheetError('old_excel');
  return parseCsv(decodeText(bytes));
}

/** CSV text from Excel: UTF-8, "Unicode text" (UTF-16) or the old Windows encoding (accents as in "Preço"). */
export function decodeText(bytes: Uint8Array): string {
  if (startsWith(bytes, [0xff, 0xfe])) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (startsWith(bytes, [0xfe, 0xff])) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

// ---------- ZIP ----------

interface ZipEntry {
  method: number;
  size: number;
  offset: number;
}

function zipEntries(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (at: number) => view.getUint16(at, true);
  const u32 = (at: number) => view.getUint32(at, true);
  // End of central directory: in the last 22 bytes, or before a comment of up to 64 KB.
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (u32(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new SpreadsheetError('unreadable');
  const entries = new Map<string, ZipEntry>();
  let at = u32(end + 16);
  for (let n = u16(end + 10); n > 0; n--) {
    if (at + 46 > bytes.length || u32(at) !== 0x02014b50) throw new SpreadsheetError('unreadable');
    const nameLength = u16(at + 28);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    entries.set(name, { method: u16(at + 10), size: u32(at + 20), offset: u32(at + 42) });
    at += 46 + nameLength + u16(at + 30) + u16(at + 32);
  }
  return entries;
}

async function zipRead(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const at = entry.offset;
  if (at + 30 > bytes.length || view.getUint32(at, true) !== 0x04034b50) throw new SpreadsheetError('unreadable');
  const start = at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true);
  if (start + entry.size > bytes.length) throw new SpreadsheetError('unreadable');
  const data = bytes.slice(start, start + entry.size);
  if (entry.method === 0) return data;
  if (entry.method !== 8 || typeof DecompressionStream === 'undefined') throw new SpreadsheetError('unreadable');
  return inflate(data);
}

async function inflate(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  let stream: DecompressionStream;
  try {
    stream = new DecompressionStream('deflate-raw');
  } catch {
    throw new SpreadsheetError('unreadable');
  }
  const writer = stream.writable.getWriter();
  writer
    .write(data)
    .then(() => writer.close())
    .catch(() => undefined);
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_UNZIPPED_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new SpreadsheetError('too_big');
      }
      chunks.push(value);
    }
  } catch (e) {
    throw e instanceof SpreadsheetError ? e : new SpreadsheetError('unreadable');
  }
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

// ---------- XML of the workbook ----------

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXml(s: string): string {
  return (
    s
      .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
        if (e[0] !== '#') return XML_ENTITIES[e.toLowerCase()] ?? '';
        const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
      })
      // Excel writes some characters (line breaks inside a cell) as _x000A_.
      .replace(/_x([0-9a-f]{4})_/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
  );
}

/** Text of a string item: plain <t> or rich-text runs, without the phonetic guides. */
function textOf(inner: string): string {
  let s = '';
  for (const m of inner
    .replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, '')
    .matchAll(/<(?:\w+:)?t\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?t>)/g)) {
    s += decodeXml(m[1] ?? '');
  }
  return s;
}

const attrPatterns = new Map<string, RegExp>();
function attr(attrs: string, name: string): string | undefined {
  let re = attrPatterns.get(name);
  if (!re) {
    re = new RegExp(`(?:^|\\s)${name}="([^"]*)"`);
    attrPatterns.set(name, re);
  }
  return re.exec(attrs)?.[1];
}

/** Numbers as Excel stores them: 2000000000017, 1200.5, 1200.0999999999999 (shown as 1200,1). */
function numberText(v: string): string {
  const n = Number(v);
  if (v.trim() === '' || !Number.isFinite(n)) return v;
  if (Number.isInteger(n)) return Math.abs(n) < 1e21 ? n.toFixed(0) : v;
  return String(Math.round(n * 1000) / 1000);
}

const columnIndex = (letters: string) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

function sheetRows(xml: string, shared: string[]): SheetRow[] {
  const rows: SheetRow[] = [];
  let line = 0;
  for (const r of xml.matchAll(/<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
    const number = Number(attr(r[1] ?? '', 'r'));
    line = Number.isInteger(number) && number > 0 ? number : line + 1;
    const cells: string[] = [];
    let col = -1;
    for (const c of (r[2] ?? '').matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const attrs = c[1] ?? '';
      const ref = /^([A-Z]{1,3})\d*$/.exec(attr(attrs, 'r') ?? '');
      col = ref ? columnIndex(ref[1]!) : col + 1;
      if (col >= MAX_COLUMNS) continue;
      const body = c[2] ?? '';
      const v = /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body)?.[1];
      const type = attr(attrs, 't') ?? 'n';
      let text = '';
      if (type === 's') text = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') text = textOf(/<(?:\w+:)?is\b[^>]*>([\s\S]*?)<\/(?:\w+:)?is>/.exec(body)?.[1] ?? '');
      else if (type === 'str' || type === 'd') text = decodeXml(v ?? '');
      else if (type === 'n') text = v === undefined ? '' : numberText(decodeXml(v));
      // Booleans and errors (#N/D) are not product data.
      while (cells.length < col) cells.push('');
      cells[col] = text.trim();
    }
    if (cells.some((c) => c !== '')) rows.push({ line, cells });
  }
  return rows;
}

/** Relationships file: id → path inside the ZIP, and the shared strings path. */
function relationships(xml: string): { byId: Map<string, string>; sharedStrings?: string } {
  const byId = new Map<string, string>();
  let sharedStrings: string | undefined;
  for (const m of xml.matchAll(/<(?:\w+:)?Relationship\b([^>]*?)\/?>/g)) {
    const attrs = m[1] ?? '';
    const id = attr(attrs, 'Id');
    const target = attr(attrs, 'Target');
    if (!id || !target) continue;
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    byId.set(id, path);
    if ((attr(attrs, 'Type') ?? '').endsWith('/sharedStrings')) sharedStrings = path;
  }
  return { byId, sharedStrings };
}

export async function readXlsx(bytes: Uint8Array): Promise<SheetRow[]> {
  const entries = zipEntries(bytes);
  const read = async (path: string) => {
    const entry = entries.get(path);
    return entry ? new TextDecoder().decode(await zipRead(bytes, entry)) : undefined;
  };
  const workbook = await read('xl/workbook.xml');
  if (workbook === undefined) throw new SpreadsheetError('unreadable');
  const rels = relationships((await read('xl/_rels/workbook.xml.rels')) ?? '');
  // The first visible sheet in the workbook's order (not necessarily sheet1.xml).
  const sheets = [...workbook.matchAll(/<(?:\w+:)?sheet\b([^>]*?)\/?>/g)].map((m) => m[1] ?? '');
  const firstSheet = sheets.find((a) => !/^(hidden|veryHidden)$/.test(attr(a, 'state') ?? '')) ?? sheets[0] ?? '';
  const relId = /\s(?:\w+:)?id="([^"]*)"/.exec(firstSheet)?.[1];
  const sheetPath = (relId && rels.byId.get(relId)) || 'xl/worksheets/sheet1.xml';
  const sheet = await read(sheetPath);
  if (sheet === undefined) throw new SpreadsheetError('unreadable');
  const sharedXml = (await read(rels.sharedStrings ?? 'xl/sharedStrings.xml')) ?? '';
  const shared = [...sharedXml.matchAll(/<(?:\w+:)?si\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?si>)/g)].map((m) => textOf(m[1] ?? ''));
  return sheetRows(sheet, shared);
}
