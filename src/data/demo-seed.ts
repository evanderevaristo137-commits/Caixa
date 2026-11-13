import type {
  Batch,
  CashClose,
  CreditPayment,
  Customer,
  Expense,
  InssContribution,
  InssPlan,
  PaymentMethod,
  Product,
  Purchase,
  Sale,
  SaleItem,
  StockMovement,
  Supplier,
  SupplierPayment,
} from '../domain/types';
import { tillPurchasesCents } from './store';
import { closeResult, drawer, summariseOutflows } from '../domain/cash';
import { CURRENCY, isElectronic, isProviderMethod } from '../domain/types';
import { openItems } from '../domain/credit';
import { addMonths, baseCents, dailyCents, INSS_RULES, monthlyCents, monthOf } from '../domain/inss';
import { lineTotalFor } from '../domain/quantity';
import { addDays, addDaysToDateString, startOfLocalDay, toLocalDateString } from '../lib/dates';
import { uuid } from '../lib/ids';
import { rebuildAccounts } from './accounts';
import { DEMO_PROFILES, isDemoKind, type DemoKind } from './demo-profiles';
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

export const DEMO_WHATSAPP_TEST_NUMBER = '955 502 264';
export const DEMO_STORE_NAME = DEMO_PROFILES.grocery.storeName;
/** Bump when the example data changes: phones showing the demo then renew it at once, not only the next day. */
export const DEMO_VERSION = 8;
/** The demo till starts each day with 5.000 Kz of change. */
export const DEMO_FLOAT_CENTS = 500_000;

export interface DemoData {
  kind: DemoKind;
  products: Product[];
  customers: Customer[];
  sales: Sale[];
  payments: CreditPayment[];
  movements: StockMovement[];
  expenses: Expense[];
  /** One end-of-day count for each past day (today is left open, to show closing in a visit). */
  closes: CashClose[];
  suppliers: Supplier[];
  purchases: Purchase[];
  supplierPayments: SupplierPayment[];
  /** Dona Teresa follows her INSS in the app: 45 years old, one minimum wage, paying for over a year. */
  inssPlan: InssPlan;
  inssContributions: InssContribution[];
  /** Some products follow their expiry dates (in the grocery, the milk): one lot about to expire, one expired. */
  batches: Batch[];
}

/** Builds two weeks of believable sales of one example shop, ending at `now`. Pure function (testable). */
export function buildDemoData(now: Date, kind: DemoKind = 'grocery'): DemoData {
  const profile = DEMO_PROFILES[kind];
  const placeOf = new Map(
    Object.entries(profile.places).flatMap(([category, subs]) =>
      Object.entries(subs).flatMap(([subcategory, names]) => names.map((n) => [n, { category, subcategory }] as const)),
    ),
  );
  const rand = mulberry32(20261106);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]!;
  const iso = (d: Date) => d.toISOString();
  const start = addDays(startOfLocalDay(now), -14);
  const createdAt = iso(addDays(start, -1));

  const products: Product[] = profile.products.map(([name, kz, costKz, minStock, , byWeight], i) => ({
    id: uuid(),
    name,
    priceCents: kz * 100,
    costCents: costKz * 100,
    ...(byWeight ? { soldBy: 'weight' as const } : {}),
    ...placeOf.get(name),
    // Loose goods are weighed, not scanned.
    barcode: byWeight ? undefined : demoBarcode(i),
    minStock,
    stock: 0,
    createdAt,
    updatedAt: createdAt,
  }));
  const customers: Customer[] = profile.customers.map((name) => ({
    id: uuid(),
    name,
    phone: DEMO_WHATSAPP_TEST_NUMBER,
    createdAt,
    updatedAt: createdAt,
  }));

  const sales: Sale[] = [];
  let number = 0;
  for (let day = 0; day <= 14; day++) {
    const dayStart = addDays(start, day);
    const count = profile.salesPerDay[0] + Math.floor(rand() * profile.salesPerDay[1]);
    const times = Array.from({ length: count }, () => 7 * 60 + Math.floor(rand() * 13 * 60)).sort((a, b) => a - b);
    for (const minute of times) {
      const at = new Date(dayStart);
      at.setMinutes(minute);
      if (at > now) break;
      const items: SaleItem[] = [];
      const lines = 1 + Math.floor(rand() * profile.maxLines);
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
      for (const [m, w] of profile.methodWeights) {
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
        paymentRef: isProviderMethod(method) ? `TESTE-${method}-${number}` : undefined,
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

  // The last electronic payment of today waits for its money, so a visit shows «Pagamentos por confirmar».
  const lastElectronic = [...sales].reverse().find((s) => toLocalDateString(new Date(s.createdAt)) === today && isElectronic(s.method));
  if (lastElectronic) {
    lastElectronic.pendingSince = lastElectronic.createdAt;
    delete lastElectronic.paymentRef; // the payment provider was never asked
  }

  // Suppliers and purchases: one on credit (due in 2 days, part already paid), two paid from the till.
  const suppliers: Supplier[] = profile.suppliers.map((name) => ({
    id: uuid(),
    name,
    phone: DEMO_WHATSAPP_TEST_NUMBER,
    createdAt,
    updatedAt: createdAt,
  }));
  products.forEach((p) => (p.supplierId = suppliers[profile.supplierOf(p.name)]!.id));
  const purchases: Purchase[] = [];
  profile.purchases.forEach(([dayIndex, s, payment, lines], i) => {
    const at = addDays(start, dayIndex);
    at.setHours(10, 0);
    const items = lines.map(([name, quantity]) => {
      const p = products.find((x) => x.name === name)!;
      return { productId: p.id, name, quantity, unitCostCents: p.costCents!, lineTotalCents: p.costCents! * quantity };
    });
    purchases.push({
      id: uuid(),
      number: i + 1,
      supplierId: suppliers[s]!.id,
      items,
      totalCents: items.reduce((a, it) => a + it.lineTotalCents, 0),
      payment,
      dueDate: payment === 'credit' ? addDaysToDateString(toLocalDateString(now), 2) : undefined,
      createdAt: iso(at),
      updatedAt: iso(at),
    });
  });
  const paidAt = addDays(start, 10);
  paidAt.setHours(11, 0);
  // Part of the purchase on credit already paid to its supplier.
  const onCredit = purchases.find((pu) => pu.payment === 'credit')!;
  const supplierPayments: SupplierPayment[] = [
    {
      id: uuid(),
      supplierId: onCredit.supplierId!,
      amountCents: 2_000_000,
      fromCash: false,
      createdAt: iso(paidAt),
      updatedAt: iso(paidAt),
    },
  ];

  // Money out: transport most mornings, generator fuel every 3 days, the rent once, the owner's weekly withdrawal.
  const expenses: Expense[] = [];
  const addExpense = (dayIndex: number, hour: number, category: Expense['category'], kz: number, fromCash: boolean, note?: string) => {
    const at = addDays(start, dayIndex);
    at.setHours(hour, 15);
    if (at > now) return;
    expenses.push({ id: uuid(), category, amountCents: kz * 100, fromCash, note, createdAt: iso(at), updatedAt: iso(at) });
  };
  for (let day = 0; day <= 14; day++) {
    if (rand() < 0.8) addExpense(day, 8, 'transport', pick([1_000, 1_500]), true, 'Táxi para o armazém');
    if (day % 3 === 1) addExpense(day, 18, 'energy', pick([3_000, 4_000, 5_000]), true, 'Gasóleo do gerador');
    if (day === 6 || day === 13) addExpense(day, 19, 'withdrawal', 20_000, true);
  }
  addExpense(2, 10, 'rent', 30_000, false, 'Renda do mês');

  // The owner's retirement: a little set aside every evening, and the INSS paid every month for over a year.
  // Until day 10 last month is still to pay (to show the reminder); after it, it was paid on the 8th.
  const inssPlan: InssPlan = { wages: 1, modality: 'normal', startMonth: addMonths(monthOf(now), -14), birthYear: now.getFullYear() - 45 };
  const monthly = monthlyCents(inssPlan);
  for (let day = 0; day <= 14; day++) addExpense(day, 19, 'inss', dailyCents(monthly) / 100, true);
  const lastPaid = addMonths(monthOf(now), now.getDate() > INSS_RULES.dueDay ? -1 : -2);
  const inssContributions: InssContribution[] = [];
  for (let m = inssPlan.startMonth; m <= lastPaid; m = addMonths(m, 1)) {
    const paidOn = `${addMonths(m, 1)}-08`;
    const at = iso(new Date(`${paidOn}T10:00:00`));
    inssContributions.push({
      id: uuid(),
      month: m,
      amountCents: monthly,
      baseCents: baseCents(inssPlan),
      paidOn,
      receipt: `TESTE-${m}`,
      savedUsedCents: 0,
      createdAt: at,
      updatedAt: at,
    });
  }

  // End-of-day counts for the past days: mostly right, sometimes a little over or short.
  const closes: CashClose[] = [];
  const differences = [0, 0, -20_000, 0, 10_000, 0, 0, -50_000, 0, 0, 0, 20_000, 0, -10_000];
  for (let day = 0; day < 14; day++) {
    const from = addDays(start, day).getTime();
    const to = addDays(start, day + 1).getTime();
    const inDay = (x: { createdAt: string }) => {
      const tm = new Date(x.createdAt).getTime();
      return tm >= from && tm < to;
    };
    const d = drawer({
      floatCents: DEMO_FLOAT_CENTS,
      cashSalesCents: sales.filter((s) => inDay(s) && s.method === 'cash').reduce((a, s) => a + s.totalCents, 0),
      cashCreditPaymentsCents: payments.filter((p) => inDay(p) && p.method === 'cash').reduce((a, p) => a + p.amountCents, 0),
      cashOutCents: summariseOutflows(expenses.filter(inDay)).cashOutCents,
      cashPurchasesCents: tillPurchasesCents(purchases.filter(inDay), supplierPayments.filter(inDay)),
    });
    const countedCents = d.expectedCents + differences[day]!;
    const at = addDays(start, day);
    at.setHours(20, 30);
    closes.push({
      id: uuid(),
      day: toLocalDateString(at),
      floatCents: DEMO_FLOAT_CENTS,
      expectedCents: d.expectedCents,
      countedCents,
      differenceCents: closeResult(d.expectedCents, countedCents).differenceCents,
      createdAt: iso(at),
      updatedAt: iso(at),
    });
  }

  // Stock: initial delivery + purchases − sales = the target left on the shelf today.
  const sold = new Map<string, number>();
  for (const s of sales) for (const it of s.items) sold.set(it.productId, (sold.get(it.productId) ?? 0) + it.quantity);
  const bought = new Map<string, number>();
  for (const pu of purchases) for (const it of pu.items) bought.set(it.productId, (bought.get(it.productId) ?? 0) + it.quantity);
  const movements: StockMovement[] = [];
  for (const pu of purchases) {
    for (const it of pu.items) {
      movements.push({
        id: uuid(),
        productId: it.productId,
        type: 'purchase',
        delta: it.quantity,
        purchaseId: pu.id,
        createdAt: pu.createdAt,
        updatedAt: pu.createdAt,
      });
    }
  }
  products.forEach((p, i) => {
    const target = profile.products[i]![4];
    const initial = Math.max(0, (sold.get(p.id) ?? 0) + target - (bought.get(p.id) ?? 0));
    movements.push({
      id: uuid(),
      productId: p.id,
      type: 'entry',
      delta: initial,
      reason: 'Stock inicial',
      createdAt,
      updatedAt: createdAt,
    });
    p.stock = initial + (bought.get(p.id) ?? 0) - (sold.get(p.id) ?? 0);
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

  // Expiry dates (optional, product by product): in the grocery, the milk follows them. Its stock on
  // the shelf gets dates, as a shop does when it starts: one lot about to expire, one expired, the rest fine.
  const batches: Batch[] = [];
  for (const [name, lots] of profile.dated) {
    const p = products.find((x) => x.name === name);
    if (!p) continue;
    p.tracksExpiry = true;
    let left = p.stock;
    for (const [quantity, days] of lots) {
      const q = Math.min(quantity, left);
      if (q <= 0) break;
      left -= q;
      batches.push({
        id: uuid(),
        productId: p.id,
        quantity: q,
        expiresOn: addDaysToDateString(today, days),
        source: 'shelf',
        createdAt,
        updatedAt: createdAt,
      });
    }
  }

  return {
    kind,
    products,
    customers,
    sales,
    payments,
    movements,
    expenses,
    closes,
    suppliers,
    purchases,
    supplierPayments,
    inssPlan,
    inssContributions,
    batches,
  };
}

/** The example shop the demo database holds now (the grocery until another is chosen). */
export async function demoKindOf(db: CaixaDB): Promise<DemoKind> {
  const row = await db.meta.get('demoKind');
  return isDemoKind(row?.value) ? row.value : 'grocery';
}

/**
 * Wipes the demo database and fills it again, with the example shop chosen (`kind`), or else the one
 * it already holds. Only ever called on the demo database.
 */
export async function seedDemo(db: CaixaDB, now = new Date(), kind?: DemoKind): Promise<void> {
  if (!db.name.endsWith('-demo') && !db.name.startsWith('test-')) {
    throw new Error('Demo data can only be written to the demo database');
  }
  const chosen = kind ?? (await demoKindOf(db));
  const data = buildDemoData(now, chosen);
  const profile = DEMO_PROFILES[chosen];
  const at = now.toISOString();
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    // A supplier raised a price and the shop did not change it yet (in the grocery, the sugar): the
    // cost price is now above the selling price (the sales already made keep the cost of their day).
    // The «Hoje» suggestions show it, so a visit can explain them.
    const { belowCost } = profile;
    await db.products.bulkAdd(data.products.map((p) => (p.name === belowCost.name ? { ...p, costCents: belowCost.costCents } : p)));
    await db.customers.bulkAdd(data.customers);
    await db.sales.bulkAdd(data.sales);
    await db.creditPayments.bulkAdd(data.payments);
    await rebuildAccounts(db);
    await db.stockMovements.bulkAdd(data.movements);
    await db.expenses.bulkAdd(data.expenses);
    await db.cashCloses.bulkAdd(data.closes);
    await db.suppliers.bulkAdd(data.suppliers);
    await db.purchases.bulkAdd(data.purchases);
    await db.supplierPayments.bulkAdd(data.supplierPayments);
    await db.inssContributions.bulkAdd(data.inssContributions);
    await db.batches.bulkAdd(data.batches);
    await db.meta.put({ key: 'purchaseNumber', value: data.purchases.length });
    await db.settings.put({
      id: SETTINGS_ID,
      storeName: profile.storeName,
      phone: '923 000 000',
      inss: data.inssPlan,
      creditTermDays: 15,
      creditLimitCents: profile.creditLimitCents,
      cashFloatCents: DEMO_FLOAT_CENTS,
      // Example of a credit-for-stock contract: at least 40% of receipts in digital payments.
      digitalMinShareBp: 4000,
      // Its kind of shop: its categories come first when choosing one.
      businessTypes: profile.businessTypes,
      createdAt: at,
      updatedAt: at,
    });
    await db.meta.put({ key: 'saleNumber', value: data.sales.length });
    // In-store codes made later in the demo start after the demo's own codes.
    await db.meta.put({ key: 'barcodeSeq', value: profile.products.length });
    await db.meta.put({ key: 'demoKind', value: chosen });
    await db.meta.put({ key: 'demoSeededAt', value: at });
    await db.meta.put({ key: 'demoVersion', value: DEMO_VERSION });
    await db.audit.add({ id: uuid(), entity: 'data', entityId: 'demo', action: 'reset', createdAt: at, updatedAt: at });
  });
}

/**
 * Re-seeds the demo when it was generated on another day, so "Hoje" always shows
 * today's sales during a visit, or by an older version of the app. Returns true when it re-seeded.
 */
export async function ensureFreshDemo(db: CaixaDB, now = new Date()): Promise<boolean> {
  const [row, version] = await Promise.all([db.meta.get('demoSeededAt'), db.meta.get('demoVersion')]);
  const seededAt = typeof row?.value === 'string' ? new Date(row.value) : null;
  const sameDay = seededAt !== null && startOfLocalDay(seededAt).getTime() === startOfLocalDay(now).getTime();
  if (sameDay && version?.value === DEMO_VERSION) return false;
  await seedDemo(db, now);
  return true;
}
