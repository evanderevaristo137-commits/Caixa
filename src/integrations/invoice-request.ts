/**
 * What Caixa will send to an AGT-certified invoicing partner (phase 3).
 * Caixa never issues invoices: it only prepares the data. Formats are documented in docs/INTEGRACOES.md.
 */
import { isPaymentPending, type Customer, type PaymentMethod, type Sale, type Settings, type VatRegime } from '../domain/types';
import { compareText } from '../domain/ranking';

export const INVOICE_REQUEST_SCHEMA = 'caixa.invoice-request/1';
export const FINAL_CONSUMER = 'Consumidor final';

export interface InvoiceParty {
  name: string;
  nif?: string;
  address?: string;
  phone?: string;
}

export interface InvoiceLine {
  lineNumber: number;
  /** Barcode when there is one; otherwise the app's product id. */
  productCode: string;
  description: string;
  /** Units, or kg with up to 3 decimals for products sold by weight. */
  quantity: number;
  unit: string;
  /** Price charged per unit (or per kg), IVA included, in cêntimos. */
  unitPriceCents: number;
  lineTotalCents: number;
  /** IVA in basis points (1400 = 14%). Missing = not filled in the app; the partner/accountant decides. */
  taxRateBp?: number;
  taxExemption?: string;
}

interface DocumentBase {
  schema: typeof INVOICE_REQUEST_SCHEMA;
  /** Same requestId = same document: the partner must never issue it twice. */
  requestId: string;
  issueDate: string;
  currency: 'AOA';
  /** Retail prices in the shop already include IVA. */
  pricesIncludeTax: true;
  seller: InvoiceParty & { vatRegime?: VatRegime };
  buyer: InvoiceParty;
  lines: InvoiceLine[];
  totalCents: number;
  source: { app: 'caixa'; saleId: string; saleNumber: number; deviceId?: string };
}

export interface InvoiceRequest extends DocumentBase {
  kind: 'invoice';
  /**
   * Only a suggestion (paid now → FR, invoice-receipt; credit, or an electronic payment the shop has
   * not seen arrive yet → FT, invoice). The certified partner decides.
   */
  suggestedDocumentType: 'FR' | 'FT';
  /** `awaitingConfirmation`: the money of this electronic payment had not arrived when the sale was recorded. */
  payment: { method: PaymentMethod; dueDate?: string; reference?: string; providerRef?: string; awaitingConfirmation?: true };
}

export interface CreditNoteRequest extends DocumentBase {
  kind: 'credit_note';
  reason: string;
  original: { requestId: string; documentNumber?: string };
}

function seller(settings: Settings): DocumentBase['seller'] {
  return { name: settings.storeName, nif: settings.nif, address: settings.address, phone: settings.phone, vatRegime: settings.vatRegime };
}

/** Customer's name and NIF only (no phone: the partner does not need it). */
function buyer(customer?: Customer): InvoiceParty {
  return customer ? { name: customer.name, nif: customer.nif } : { name: FINAL_CONSUMER };
}

function lines(sale: Sale): InvoiceLine[] {
  return sale.items.map((item, i) => ({
    lineNumber: i + 1,
    productCode: item.barcode ?? item.productId,
    description: item.name,
    // Weighed products: grams become kg (e.g. 750 g → 0.75 kg); the price is per kg.
    quantity: item.soldBy === 'weight' ? item.quantity / 1000 : item.quantity,
    unit: item.soldBy === 'weight' ? 'kg' : (item.unit ?? 'un'),
    unitPriceCents: item.unitPriceCents,
    lineTotalCents: item.lineTotalCents,
    taxRateBp: item.taxRateBp,
    taxExemption: item.taxExemption,
  }));
}

function base(sale: Sale, settings: Settings, customer: Customer | undefined, requestId: string, issueDate: string): DocumentBase {
  return {
    schema: INVOICE_REQUEST_SCHEMA,
    requestId,
    issueDate,
    currency: sale.currency,
    pricesIncludeTax: true,
    seller: seller(settings),
    buyer: buyer(customer),
    lines: lines(sale),
    totalCents: sale.totalCents,
    source: { app: 'caixa', saleId: sale.id, saleNumber: sale.number, deviceId: sale.deviceId },
  };
}

export function buildInvoiceRequest(sale: Sale, settings: Settings, customer?: Customer): InvoiceRequest {
  return {
    ...base(sale, settings, customer, `sale:${sale.id}`, sale.createdAt),
    kind: 'invoice',
    suggestedDocumentType: sale.method === 'credit' || isPaymentPending(sale) ? 'FT' : 'FR',
    payment: {
      method: sale.method,
      dueDate: sale.dueDate,
      reference: sale.transactionRef,
      providerRef: sale.paymentRef,
      ...(isPaymentPending(sale) ? { awaitingConfirmation: true as const } : {}),
    },
  };
}

/** For a voided sale: the partner cancels the invoice with a credit note (never by deleting it). */
export function buildCreditNoteRequest(sale: Sale, settings: Settings, customer?: Customer): CreditNoteRequest {
  if (!sale.voidedAt) throw new Error('Only voided sales get a credit note');
  return {
    ...base(sale, settings, customer, `void:${sale.id}`, sale.voidedAt),
    kind: 'credit_note',
    reason: sale.voidReason ?? '',
    original: { requestId: `sale:${sale.id}`, documentNumber: sale.invoice?.documentNumber },
  };
}

export type MissingInvoiceData = 'seller.nif' | 'seller.address' | 'seller.vatRegime' | 'lines.taxRate';

/** What is still missing before certified invoicing can start (phase 3). */
export function missingInvoiceData(settings: Settings, sales: Pick<Sale, 'items'>[] = []): MissingInvoiceData[] {
  const missing: MissingInvoiceData[] = [];
  if (!settings.nif) missing.push('seller.nif');
  if (!settings.address) missing.push('seller.address');
  if (!settings.vatRegime || settings.vatRegime === 'unknown') missing.push('seller.vatRegime');
  if (sales.some((s) => s.items.some((i) => i.taxRateBp === undefined))) missing.push('lines.taxRate');
  return missing;
}

/** Every sale as invoice requests, and every void as a credit note request (for a partner that imports files). */
export function invoiceExport(sales: Sale[], settings: Settings, customers: Customer[], now: Date) {
  const byId = new Map(customers.map((c) => [c.id, c]));
  const documents: (InvoiceRequest | CreditNoteRequest)[] = [];
  for (const sale of [...sales].sort((a, b) => compareText(a.createdAt, b.createdAt))) {
    const customer = sale.customerId ? byId.get(sale.customerId) : undefined;
    documents.push(buildInvoiceRequest(sale, settings, customer));
    if (sale.voidedAt) documents.push(buildCreditNoteRequest(sale, settings, customer));
  }
  return {
    schema: INVOICE_REQUEST_SCHEMA,
    exportedAt: now.toISOString(),
    notAnInvoice: true,
    missing: missingInvoiceData(settings, sales),
    documents,
  };
}
