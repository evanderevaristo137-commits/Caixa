import { describe, expect, it } from 'vitest';
import { MAX_IMPORT_ROWS, parseCsv, parseImportKz, planImport, type SheetRow } from './import-products';
import type { Product } from './types';

const product = (p: Partial<Product> & Pick<Product, 'id' | 'name' | 'priceCents'>): Product => ({
  stock: 0,
  minStock: 0,
  createdAt: '',
  updatedAt: '',
  ...p,
});
const cellsOf = (rows: SheetRow[]) => rows.map((r) => r.cells);
const sheet = (...lines: string[]) => parseCsv(lines.join('\n'));
const HEADER = 'Produto;Categoria;Código de barras;Vende-se por;Preço (Kz);Preço de custo (Kz);Stock;Stock mínimo';

describe('reading CSV', () => {
  it('guesses the separator and handles quotes and the Excel BOM', () => {
    expect(cellsOf(parseCsv('﻿Produto;Preço (Kz)\r\n"Óleo; 1 L";1.850\r\n\r\nSal;300\r\n'))).toEqual([
      ['Produto', 'Preço (Kz)'],
      ['Óleo; 1 L', '1.850'],
      ['Sal', '300'],
    ]);
    expect(cellsOf(parseCsv('Produto,Preço\n"Diz ""olá""",1200.5'))).toEqual([
      ['Produto', 'Preço'],
      ['Diz "olá"', '1200.5'],
    ]);
    expect(cellsOf(parseCsv('Produto\tPreço\nPão\t150'))).toEqual([
      ['Produto', 'Preço'],
      ['Pão', '150'],
    ]);
  });

  it('keeps the line numbers of the file, with blank lines and line breaks inside a cell', () => {
    const rows = parseCsv('Produto;Preço\n\nPão;150\n"Bolo\nde milho";500\n;\nSal;300');
    expect(rows.map((r) => r.line)).toEqual([1, 3, 4, 7]);
    expect(rows[2]!.cells[0]).toBe('Bolo\nde milho');
  });

  it('reads prices written in Portuguese or English style', () => {
    expect(parseImportKz('1.200')).toBe(120_000);
    expect(parseImportKz('1 200,50 Kz')).toBe(120_050);
    expect(parseImportKz('1200.5')).toBe(120_050);
    expect(parseImportKz('1,200.50')).toBe(120_050);
    expect(parseImportKz('350')).toBe(35_000);
    expect(parseImportKz('abc')).toBeNull();
    expect(parseImportKz('')).toBeNull();
  });
});

describe('import plan', () => {
  const existing = [
    product({ id: 'arroz', name: 'Arroz 1 kg', priceCents: 120_000, barcode: '2000000000015', minStock: 5 }),
    product({ id: 'feijao', name: 'Feijão a granel', priceCents: 140_000, soldBy: 'weight', minStock: 5_000 }),
    product({ id: 'sal', name: 'Sal 1 kg', priceCents: 30_000, costCents: 22_000 }),
  ];

  it('says what is new, what changes and what is wrong, line by line', () => {
    const plan = planImport(
      sheet(
        HEADER,
        'Bolacha Maria;Mercearia;;un;500;350;24;6',
        'Arroz a granel;Granel;;kg;1.100;900;25;5',
        'arroz 1 KG;;;un;1.300;;99;',
        'Sal 1 kg;;;un;300;220;;',
        'Sumo 1 L;;4,00638E+12;un;1.200;;;',
        'Óleo;;;caixa;1.850;;;',
        'Feijão a granel;;;un;1.400;;;',
        ';;;;100;;;',
        'Bolacha Maria;;;un;600;;;',
        'Massa;;;un;seiscentos;;;',
        'Arroz agulha;;="2000000000015";un;1.250;;;',
      ),
      existing,
    );
    expect(plan.missingColumns).toEqual([]);
    expect(plan.rows.map((r) => [r.line, r.action, r.changes])).toEqual([
      [2, 'create', []],
      [3, 'create', []],
      [4, 'update', ['preço 1.200 Kz → 1.300 Kz']],
      [5, 'same', []],
    ]);
    expect(plan.rows[0]!.product).toEqual({
      name: 'Bolacha Maria',
      priceCents: 50_000,
      costCents: 35_000,
      barcode: undefined,
      soldBy: undefined,
      stock: 24,
      minStock: 6,
      category: 'Mercearia',
    });
    // Weighed products: stock and minimum typed in kg, kept in grams.
    expect(plan.rows[1]!.product).toMatchObject({ soldBy: 'weight', stock: 25_000, minStock: 5_000 });
    // Matched by name (accents and case ignored). The stock of existing products never changes, but the plan says so.
    expect(plan.rows[2]).toMatchObject({ productId: 'arroz', currentName: 'Arroz 1 kg', priceChanged: true });
    expect(plan.errors).toEqual([
      {
        line: 6,
        message: 'código de barras estragado pelo Excel («4,00638E+12»): formate a coluna como Texto e escreva o código outra vez',
      },
      { line: 7, message: '«Vende-se por» deve ser un ou kg (está «caixa»)' },
      { line: 8, message: '«Feijão a granel» já existe e vende-se ao quilo: isso não muda' },
      { line: 9, message: 'falta o nome do produto' },
      { line: 10, message: 'produto repetido (já está na linha 2)' },
      { line: 11, message: 'preço inválido («seiscentos»)' },
      // Same barcode as the rice of line 4: one product, two lines.
      { line: 12, message: '«Arroz 1 kg» já está na linha 4' },
    ]);
    expect([plan.created, plan.updated, plan.unchanged, plan.stockKept]).toEqual([2, 1, 1, 1]);
  });

  it('finds the header below a title and reads codes written with spaces', () => {
    const plan = planImport(sheet('Lista de preços do Fornecedor Exemplo;', '', 'Descrição;PVP;EAN', 'Leite 1 L;600;5 601234 567893'), []);
    expect(plan.errors).toEqual([]);
    expect(plan.rows).toMatchObject([
      { line: 4, action: 'create', product: { name: 'Leite 1 L', priceCents: 60_000, barcode: '5601234567893' } },
    ]);
  });

  it('asks for the name and price columns', () => {
    expect(planImport(sheet('Nome;Stock', 'Pão;3'), []).missingColumns).toEqual(['Preço (Kz)']);
    expect(planImport([], []).missingColumns).toEqual(['Produto', 'Preço (Kz)']);
  });

  it('refuses sheets that are too long', () => {
    const rows: SheetRow[] = [
      { line: 1, cells: ['Produto', 'Preço'] },
      ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => ({ line: i + 2, cells: [`Produto ${i}`, '100'] })),
    ];
    const plan = planImport(rows, []);
    expect(plan.tooMany).toBe(true);
    expect(plan.rows).toEqual([]);
  });
});
