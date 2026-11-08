import type { CreditPayment, Customer, PaymentMethod, Product, Sale, SaleItem, StockMovement } from '../domain/types';
import { CURRENCY } from '../domain/types';
import { openItems } from '../domain/credit';
import { lineTotalFor } from '../domain/quantity';
import { addDays, addDaysToDateString, startOfLocalDay, toLocalDateString } from '../lib/dates';
import { uuid } from '../lib/ids';
import type { CaixaDB } from './db';
import { SETTINGS_ID } from './store';

/** Small deterministic random generator, so the demo looks the same on every phone. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fictitious in-store barcode (prefix 200, valid EAN-13 check digit). */
function demoBarcode(i: number): string {
  const body = `200000${String(i + 1).padStart(6, '0')}`;
  const sum = [...body].reduce((acc, d, idx) => acc + Number(d) * (idx % 2 === 0 ? 1 : 3), 0);
  return body + String((10 - (sum % 10)) % 10);
}

// [name, price in Kz, cost price in Kz (both per kg when sold by weight), minimum stock, final stock target, sold by weight]
// Stock for weighed products is in grams. Prices and costs are fictitious but plausible.
const PRODUCTS: [string, number, number, number, number, boolean?][] = [
  ['Arroz 1 kg', 1_200, 1_000, 10, 34],
  ['Arroz 5 kg', 5_500, 4_700, 4, 9],
  ['Fuba de milho 1 kg', 800, 650, 10, 28],
  ['Fuba de bombó 1 kg', 900, 720, 8, 6],
  ['Feijão manteiga 1 kg', 1_500, 1_200, 8, 19],
  ['Açúcar 1 kg', 1_100, 900, 10, 25],
  ['Óleo vegetal 1 L', 1_850, 1_550, 8, 3],
  ['Óleo de palma 1 L', 2_000, 1_600, 4, 11],
  ['Sal 1 kg', 300, 220, 5, 22],
  ['Massa esparguete 500 g', 600, 470, 10, 31],
  ['Leite em pó 400 g', 3_200, 2_700, 4, 7],
  ['Leite UHT 1 L', 1_200, 980, 6, 14],
  ['Pão (unidade)', 150, 110, 20, 45],
  ['Ovos (dúzia)', 2_500, 2_050, 4, 2],
  ['Sardinha em lata', 650, 500, 10, 26],
  ['Atum em lata', 900, 720, 6, 13],
  ['Salsichas em lata', 800, 630, 6, 15],
  ['Massa de tomate 70 g', 350, 260, 10, 30],
  ['Cebola 1 kg', 800, 600, 5, 12],
  ['Batata 1 kg', 700, 520, 5, 16],
  ['Água 1,5 L', 300, 210, 12, 40],
  ['Gasosa 330 ml', 400, 290, 12, 36],
  ['Sumo 1 L', 1_200, 950, 6, 10],
  ['Cerveja 330 ml', 500, 370, 24, 60],
  ['Sabão em barra', 400, 300, 8, 21],
  ['Detergente em pó 500 g', 1_300, 1_050, 5, 4],
  ['Papel higiénico (4 rolos)', 1_200, 950, 5, 12],
  ['Pasta de dentes', 900, 700, 4, 9],
  ['Fósforos (caixa)', 100, 70, 10, 50],
  ['Carvão (saco)', 1_500, 1_100, 4, 8],
  ['Arroz a granel', 1_100, 900, 10_000, 25_000, true],
  ['Feijão a granel', 1_400, 1_100, 5_000, 3_500, true],
  ['Açúcar a granel', 1_000, 820, 5_000, 12_000, true],
];

// Fictitious customers. They all use the founder's WhatsApp test number, so reminders and
// receipts sent from the demo arrive on a phone we control (never on a stranger's phone).
export const DEMO_WHATSAPP_TEST_NUMBER = '955 502 264';
const CUSTOMERS: [string, string][] = [
  ['Joana Mateus', DEMO_WHATSAPP_TEST_NUMBER],
  ['António Kiala', DEMO_WHATSAPP_TEST_NUMBER],
  ['Esperança Domingos', DEMO_WHATSAPP_TEST_NUMBER],
  ['Manuel Sebastião', DEMO_WHATSAPP_TEST_NUMBER],
  ['Luísa Neto', DEMO_WHATSAPP_TEST_NUMBER],
];

const METHOD_WEIGHTS: [PaymentMethod, number][] = [
  ['cash', 0.46],
  ['multicaixa_express', 0.2],
  ['kwik', 0.08],
  ['unitel_money', 0.08],
  ['afrimoney', 0.04],
  ['paypay', 0.04],
  ['credit', 0.1],
];

export const DEMO_STORE_NAME = 'Mercearia da Dona Teresa';

export interface DemoData {
  products: Product[];
  customers: Customer[];
  sales: Sale[];
  payments: CreditPayment[];
  movements: StockMovement[];
}

/** Builds two weeks of believable sales ending at `now`. Pure function (testable). */
export function buildDemoData(now: Date): DemoData {
  const rand = mulberry32(20261106);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]!;
  const iso = (d: Date) => d.toISOString();
  const start = addDays(startOfLocalDay(now), -14);
  const createdAt = iso(addDays(start, -1));

  const products: Product[] = PRODUCTS.map(([name, kz, costKz, minStock, , byWeight], i) => ({
    id: uuid(),
    name,
    priceCents: kz * 100,
    costCents: costKz * 100,
    ...(byWeight ? { soldBy: 'weight' as const } : {}),
    // Loose goods are weighed, not scanned.
    barcode: byWeight ? undefined : demoBarcode(i),
    minStock,
    stock: 0,
    createdAt,
    updatedAt: createdAt,
  }));
  const customers: Customer[] = CUSTOMERS.map(([name, phone]) => ({ id: uuid(), name, phone, createdAt, updatedAt: createdAt }));

  const sales: Sale[] = [];
  let number = 0;
  for (let day = 0; day <= 14; day++) {
    const dayStart = addDays(start, day);
    const count = 14 + Math.floor(rand() * 12);
    const times = Array.from({ length: count }, () => 7 * 60 + Math.floor(rand() * 13 * 60)).sort((a, b) => a - b);
    for (const minute of times) {
      const at = new Date(dayStart);
      at.setMinutes(minute);
      if (at > now) break;
      const items: SaleItem[] = [];
      const lines = 1 + Math.floor(rand() * 4);
      for (let l = 0; l < lines; l++) {
        const p = pick(products);
        if (items.some((it) => it.productId === p.id)) continue;
        if (p.soldBy === 'weight') {
          const grams = pick([250, 500, 750, 1_000, 2_000]);
          items.push({
            productId: p.id,
            name: p.name,
            unitPriceCents: p.priceCents,
            quantity: grams,
            soldBy: 'weight',
            lineTotalCents: lineTotalFor(p.priceCents, grams, 'weight'),
            unitCostCents: p.costCents,
          });
          continue;
        }
        const quantity = 1 + Math.floor(rand() * (p.priceCents <= 50_000 ? 4 : 2));
        items.push({
          productId: p.id,
          name: p.name,
          unitPriceCents: p.priceCents,
          quantity,
          lineTotalCents: p.priceCents * quantity,
          unitCostCents: p.costCents,
        });
      }
      let r = rand();
      let method: PaymentMethod = 'cash';
      for (const [m, w] of METHOD_WEIGHTS) {
        if (r < w) {
          method = m;
          break;
        }
        r -= w;
      }
      const totalCents = items.reduce((a, it) => a + it.lineTotalCents, 0);
      number += 1;
      sales.push({
        id: uuid(),
        number,
        items,
        totalCents,
        currency: CURRENCY,
        method,
        customerId: method === 'credit' ? pick(customers).id : undefined,
        paymentRef: method !== 'cash' && method !== 'credit' ? `TESTE-${method}-${number}` : undefined,
        createdAt: iso(at),
        updatedAt: iso(at),
      });
    }
  }

  // Make sure each customer has an old fiado purchase so the list looks real.
  customers.forEach((c, i) => {
    const s = sales.find((x, idx) => idx > i * 25 && x.method === 'cash');
    if (s) {
      s.method = 'credit';
      s.customerId = c.id;
    }
  });

  // Partial payments: customers pay back part of what they owe, a few days after buying.
  const payments: CreditPayment[] = [];
  customers.forEach((c, i) => {
    const owed = sales.filter((s) => s.customerId === c.id).reduce((a, s) => a + s.totalCents, 0);
    const share = [0.6, 0.3, 0, 0.5, 0.2][i]!;
    const amountCents = Math.floor((owed * share) / 10_000) * 10_000;
    if (amountCents > 0) {
      const at = iso(addDays(start, 6 + i));
      payments.push({
        id: uuid(),
        customerId: c.id,
        amountCents,
        method: i % 2 ? 'multicaixa_express' : 'cash',
        createdAt: at,
        updatedAt: at,
      });
    }
  });

  // Payment terms: each credit sale gets 7 or 15 days. Then the oldest open purchase of each
  // customer is moved so the demo shows every situation: overdue, due today, due soon, later.
  for (const s of sales) {
    if (s.method === 'credit') s.dueDate = toLocalDateString(addDays(new Date(s.createdAt), rand() < 0.5 ? 7 : 15));
  }
  const today = toLocalDateString(now);
  const firstDueOffset = [-4, -9, 0, 2, 9]; // Joana, António: overdue · Esperança: today · Manuel: soon · Luísa: later
  customers.forEach((c, i) => {
    const open = openItems(c.id, sales, payments);
    if (open.length === 0) return;
    const firstSale = sales.find((s) => s.id === open[0]!.saleId)!;
    const bought = toLocalDateString(new Date(firstSale.createdAt));
    const wanted = addDaysToDateString(today, firstDueOffset[i]!);
    const target = wanted < bought ? bought : wanted;
    for (const item of open) {
      const sale = sales.find((s) => s.id === item.saleId)!;
      sale.dueDate = sale === firstSale || sale.dueDate! < target ? target : sale.dueDate;
    }
  });

  // Stock: initial delivery = what was sold + the target left on the shelf today.
  const sold = new Map<string, number>();
  for (const s of sales) for (const it of s.items) sold.set(it.productId, (sold.get(it.productId) ?? 0) + it.quantity);
  const movements: StockMovement[] = [];
  products.forEach((p, i) => {
    const target = PRODUCTS[i]![4];
    const initial = (sold.get(p.id) ?? 0) + target;
    movements.push({
      id: uuid(),
      productId: p.id,
      type: 'entry',
      delta: initial,
      reason: 'Stock inicial',
      createdAt,
      updatedAt: createdAt,
    });
    p.stock = target;
  });
  for (const s of sales) {
    for (const it of s.items) {
      movements.push({
        id: uuid(),
        productId: it.productId,
        type: 'sale',
        delta: -it.quantity,
        saleId: s.id,
        createdAt: s.createdAt,
        updatedAt: s.createdAt,
      });
    }
  }

  return { products, customers, sales, payments, movements };
}

/** Wipes the demo database and fills it again. Only ever called on the demo database. */
export async function seedDemo(db: CaixaDB, now = new Date()): Promise<void> {
  if (!db.name.endsWith('-demo') && !db.name.startsWith('test-')) {
    throw new Error('Demo data can only be written to the demo database');
  }
  const data = buildDemoData(now);
  const at = now.toISOString();
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await db.products.bulkAdd(data.products);
    await db.customers.bulkAdd(data.customers);
    await db.sales.bulkAdd(data.sales);
    await db.creditPayments.bulkAdd(data.payments);
    await db.stockMovements.bulkAdd(data.movements);
    await db.settings.put({
      id: SETTINGS_ID,
      storeName: DEMO_STORE_NAME,
      phone: '923 000 000',
      creditTermDays: 15,
      creditLimitCents: 3_000_000,
      createdAt: at,
      updatedAt: at,
    });
    await db.meta.put({ key: 'saleNumber', value: data.sales.length });
    // In-store codes made later in the demo start after the demo's own codes.
    await db.meta.put({ key: 'barcodeSeq', value: PRODUCTS.length });
    await db.meta.put({ key: 'demoSeededAt', value: at });
    await db.audit.add({ id: uuid(), entity: 'data', entityId: 'demo', action: 'reset', createdAt: at, updatedAt: at });
  });
}

/**
 * Re-seeds the demo when it was generated on another day, so "Hoje" always shows
 * today's sales during a visit. Returns true when it re-seeded.
 */
export async function ensureFreshDemo(db: CaixaDB, now = new Date()): Promise<boolean> {
  const row = await db.meta.get('demoSeededAt');
  const seededAt = typeof row?.value === 'string' ? new Date(row.value) : null;
  if (seededAt && startOfLocalDay(seededAt).getTime() === startOfLocalDay(now).getTime()) return false;
  await seedDemo(db, now);
  return true;
}
