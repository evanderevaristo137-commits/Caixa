import { t } from '../i18n/pt-AO';
import { formatKz } from '../lib/money';
import { formatQuantity, parseWeight } from './quantity';
import type { Cents, Product } from './types';

/**
 * Importing a product list from Excel (.xlsx, read by src/lib/spreadsheet.ts) or CSV. Pure functions:
 * the screen shows the plan (new, to update, unchanged, errors) and only then the store saves it, all at once.
 * The columns are the ones of the app's own "Produtos" export, so a list can be changed in Excel and
 * imported back, or moved from one phone to another.
 */

/** One line of the sheet: its number as Excel shows it, and its cells. */
export interface SheetRow {
  line: number;
  cells: string[];
}

/** At most this many products per file (a small shop has far fewer). */
export const MAX_IMPORT_ROWS = 5000;

/** Reads CSV text: separator ";" "," or tab (guessed from the first line), quotes, Excel's BOM. Blank lines are skipped. */
export function parseCsv(text: string): SheetRow[] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r\n|\r|\n/).find((l) => l.trim() !== '') ?? '';
  const count = (sep: string) => firstLine.split(sep).length - 1;
  const sep = [';', '\t', ','].reduce((best, s) => (count(s) > count(best) ? s : best), ';');

  const rows: SheetRow[] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1; // physical line being read
  let rowLine = 1; // line where the current row started
  const endRow = () => {
    row.push(cell.trim());
    if (row.some((c) => c !== '')) rows.push({ line: rowLine, cells: row });
    row = [];
    cell = '';
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else {
        if (ch === '\n') line++;
        cell += ch;
      }
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (ch === sep) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      endRow();
      line++;
      rowLine = line;
    } else cell += ch;
  }
  endRow();
  return rows;
}

type Field = 'name' | 'barcode' | 'soldBy' | 'price' | 'cost' | 'stock' | 'minStock' | 'category';

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[:*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const ALIASES: Record<Field, string[]> = {
  name: ['produto', 'nome', 'nome do produto', 'artigo', 'descricao', 'designacao'],
  barcode: ['codigo de barras', 'codigo', 'codigo barras', 'ean'],
  soldBy: ['vende-se por', 'vende se por', 'venda por', 'unidade de venda'],
  price: ['preco', 'preco de venda', 'pvp', 'preco venda'],
  cost: ['preco de custo', 'custo', 'custo unitario'],
  stock: ['stock', 'stock inicial', 'quantidade', 'qtd', 'existencias'],
  minStock: ['stock minimo', 'minimo', 'stock min'],
  category: ['categoria', 'familia', 'grupo'],
};

/** The columns of the template and of the "Produtos" export, in this order. */
export const TEMPLATE_HEADER = [
  'Produto',
  'Categoria',
  'Código de barras',
  'Vende-se por',
  'Preço (Kz)',
  'Preço de custo (Kz)',
  'Stock',
  'Stock mínimo',
];

/** What one line of the file asks for. Quantities are units, or grams when sold by weight. */
export interface ImportedProduct {
  name: string;
  priceCents: Cents;
  costCents?: Cents;
  barcode?: string;
  soldBy?: 'weight';
  stock?: number;
  minStock?: number;
  category?: string;
}

export interface PlanRow {
  /** Line in the file, as Excel shows it. */
  line: number;
  action: 'create' | 'update' | 'same';
  product: ImportedProduct;
  /** The product it updates, and its name in the app. */
  productId?: string;
  currentName?: string;
  /** Plain-language changes of an update ("preço 1.200 Kz → 1.300 Kz"). */
  changes: string[];
  priceChanged: boolean;
}

export interface ImportPlan {
  rows: PlanRow[];
  errors: { line: number; message: string }[];
  /** Columns the file must have and does not. */
  missingColumns: string[];
  /** More than MAX_IMPORT_ROWS lines: nothing is planned. */
  tooMany: boolean;
  created: number;
  updated: number;
  unchanged: number;
  /** Existing products whose stock in the file is different (the import never changes stock). */
  stockKept: number;
}

/** "1.200", "1200", "1 200,50", "1200.5", "1.200 Kz" → cêntimos (null when not a price). */
export function parseImportKz(text: string): Cents | null {
  const s = text.replace(/kz/gi, '').replace(/[\s ]/g, '');
  if (s === '') return null;
  let whole: string;
  let dec = '';
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s) || /^\d+(,\d{1,2})?$/.test(s)) {
    [whole, dec = ''] = s.replace(/\./g, '').split(',') as [string, string?];
  } else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s) || /^\d+\.\d{1,2}$/.test(s)) {
    // Excel in English: "1,200.50" or "1200.5".
    [whole, dec = ''] = s.replace(/,/g, '').split('.') as [string, string?];
  } else return null;
  const cents = Number(whole) * 100 + Number(dec.padEnd(2, '0') || '0');
  return Number.isSafeInteger(cents) ? cents : null;
}

/** `="2000000000017"` (how the export keeps long codes as text in Excel) → 2000000000017. */
const unwrapExcelText = (s: string) => /^="(.*)"$/s.exec(s)?.[1]?.replace(/""/g, '"') ?? s;

function columnsOf(cells: string[]): Partial<Record<Field, number>> {
  const header = cells.map(norm);
  const col: Partial<Record<Field, number>> = {};
  for (const field of Object.keys(ALIASES) as Field[]) {
    const i = header.findIndex((h) => ALIASES[field].includes(h));
    if (i >= 0) col[field] = i;
  }
  return col;
}

/** Builds the import plan from the sheet and the products already in the shop. */
export function planImport(sheet: SheetRow[], existing: Product[]): ImportPlan {
  const plan: ImportPlan = {
    rows: [],
    errors: [],
    missingColumns: [],
    tooMany: false,
    created: 0,
    updated: 0,
    unchanged: 0,
    stockKept: 0,
  };
  // The header is the first line with the name and price columns (a title above it is fine).
  const headerAt = sheet.slice(0, 10).findIndex((r) => {
    const c = columnsOf(r.cells);
    return c.name !== undefined && c.price !== undefined;
  });
  if (headerAt < 0) {
    const first = columnsOf(sheet[0]?.cells ?? []);
    if (first.name === undefined) plan.missingColumns.push('Produto');
    if (first.price === undefined) plan.missingColumns.push('Preço (Kz)');
    return plan;
  }
  const col = columnsOf(sheet[headerAt]!.cells);
  const body = sheet.slice(headerAt + 1);
  if (body.length > MAX_IMPORT_ROWS) {
    plan.tooMany = true;
    return plan;
  }

  const e = t.importProducts.err;
  const live = existing.filter((p) => !p.archivedAt);
  const byBarcode = new Map(live.filter((p) => p.barcode).map((p) => [p.barcode!, p]));
  const byName = new Map(live.map((p) => [norm(p.name), p]));
  const seenNames = new Map<string, number>();
  const seenCodes = new Map<string, number>();
  const seenProducts = new Map<string, number>();

  for (const { line, cells } of body) {
    const get = (f: Field) => (col[f] === undefined ? '' : unwrapExcelText((cells[col[f]!] ?? '').trim()).trim());
    const fail = (message: string) => void plan.errors.push({ line, message });

    const name = get('name').slice(0, 80);
    if (!name) {
      fail(e.noName);
      continue;
    }
    const soldByText = norm(get('soldBy'));
    let soldBy: 'weight' | undefined;
    if (['kg', 'quilo', 'quilos', 'ao quilo', 'peso', 'kilo'].includes(soldByText)) soldBy = 'weight';
    else if (!['', 'un', 'un.', 'unidade', 'unid', 'unidades'].includes(soldByText)) {
      fail(e.soldBy(get('soldBy')));
      continue;
    }

    const priceCents = parseImportKz(get('price'));
    if (priceCents === null) {
      fail(get('price') ? e.price(get('price')) : e.noPrice);
      continue;
    }
    const costText = get('cost');
    const costCents = costText ? parseImportKz(costText) : undefined;
    if (costCents === null) {
      fail(e.cost(costText));
      continue;
    }

    const quantity = (text: string, min: boolean): number | undefined | null => {
      if (!text) return undefined;
      const n = soldBy === 'weight' ? parseWeight(text) : /^\d{1,9}$/.test(text) ? Number(text) : null;
      if (n === null) fail(e.quantity(min, text, soldBy === 'weight'));
      return n;
    };
    const stock = quantity(get('stock'), false);
    if (stock === null) continue;
    const minStock = quantity(get('minStock'), true);
    if (minStock === null) continue;

    const barcode = get('barcode').replace(/\s/g, '') || undefined;
    if (barcode && /^\d+([.,]\d+)?e\+?\d+$/i.test(barcode)) {
      fail(e.excelCode(get('barcode')));
      continue;
    }
    if (barcode && barcode.length > 30) {
      fail(e.longCode);
      continue;
    }
    const category = get('category').slice(0, 40) || undefined;

    const nameKey = norm(name);
    const sameName = seenNames.get(nameKey);
    if (sameName !== undefined) {
      fail(e.repeated(sameName));
      continue;
    }
    const sameCode = barcode === undefined ? undefined : seenCodes.get(barcode);
    if (sameCode !== undefined) {
      fail(e.repeatedCode(sameCode));
      continue;
    }
    seenNames.set(nameKey, line);
    if (barcode) seenCodes.set(barcode, line);

    const product: ImportedProduct = { name, priceCents, costCents, barcode, soldBy, stock, minStock, category };
    // The same product in the app: same barcode first, then same name (accents and case ignored).
    const match = (barcode && byBarcode.get(barcode)) || byName.get(nameKey);
    if (!match) {
      plan.rows.push({ line, action: 'create', product, changes: [], priceChanged: false });
      plan.created += 1;
      continue;
    }
    const sameProduct = seenProducts.get(match.id);
    if (sameProduct !== undefined) {
      fail(e.sameProduct(match.name, sameProduct));
      continue;
    }
    if ((match.soldBy ?? 'unit') !== (soldBy ?? 'unit')) {
      fail(e.soldByFixed(match.name, match.soldBy === 'weight'));
      continue;
    }
    seenProducts.set(match.id, line);

    const c = t.importProducts.change;
    const changes: string[] = [];
    if (priceCents !== match.priceCents) changes.push(c.price(formatKz(match.priceCents), formatKz(priceCents)));
    if (costCents !== undefined && costCents !== match.costCents) {
      changes.push(c.cost(match.costCents === undefined ? '—' : formatKz(match.costCents), formatKz(costCents)));
    }
    if (minStock !== undefined && minStock !== match.minStock) {
      changes.push(c.min(formatQuantity(match.minStock, match.soldBy), formatQuantity(minStock, match.soldBy)));
    }
    if (barcode && barcode !== match.barcode) changes.push(c.barcode);
    if (category && category !== match.category) changes.push(c.category(category));
    if (stock !== undefined && stock !== match.stock) plan.stockKept += 1;
    plan.rows.push({
      line,
      action: changes.length ? 'update' : 'same',
      product,
      productId: match.id,
      currentName: match.name,
      changes,
      priceChanged: priceCents !== match.priceCents,
    });
    if (changes.length) plan.updated += 1;
    else plan.unchanged += 1;
  }
  return plan;
}
