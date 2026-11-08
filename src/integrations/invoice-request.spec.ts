import { describe, expect, it } from 'vitest';
import type { Customer, Sale, Settings } from '../domain/types';
import { buildCreditNoteRequest, buildInvoiceRequest, FINAL_CONSUMER, invoiceExport, missingInvoiceData } from './invoice-request';

const settings: Settings = {
  id: 'main',
  storeName: 'Loja Exemplo',
  nif: '5000000000',
  address: 'Rua Exemplo, Luanda',
  vatRegime: 'general',
  createdAt: '',
  updatedAt: '',
};
const sale: Sale = {
  id: 's1',
  number: 7,
  items: [
    {
      productId: 'p1',
      name: 'Arroz 1 kg',
      unitPriceCents: 120_000,
      quantity: 2,
      lineTotalCents: 240_000,
      barcode: '2000000000017',
      taxRateBp: 1400,
    },
    { productId: 'p2', name: 'Fósforos', unitPriceCents: 10_000, quantity: 1, lineTotalCents: 10_000, unit: 'cx' },
  ],
  totalCents: 250_000,
  currency: 'AOA',
  method: 'multicaixa_express',
  transactionRef: 'MCX-1',
  deviceId: 'dev-1',
  createdAt: '2026-11-06T10:00:00.000Z',
  updatedAt: '2026-11-06T10:00:00.000Z',
};
const customer: Customer = { id: 'c1', name: 'Empresa Exemplo', nif: '5400000000', phone: '923000000', createdAt: '', updatedAt: '' };

describe('invoice request', () => {
  it('carries what a certified partner needs, and nothing personal it does not need', () => {
    const r = buildInvoiceRequest(sale, settings);
    expect(r).toMatchObject({
      kind: 'invoice',
      requestId: 'sale:s1',
      suggestedDocumentType: 'FR',
      currency: 'AOA',
      pricesIncludeTax: true,
      totalCents: 250_000,
      seller: { name: 'Loja Exemplo', nif: '5000000000', address: 'Rua Exemplo, Luanda', vatRegime: 'general' },
      buyer: { name: FINAL_CONSUMER },
      payment: { method: 'multicaixa_express', reference: 'MCX-1' },
      source: { app: 'caixa', saleId: 's1', saleNumber: 7, deviceId: 'dev-1' },
    });
    expect(r.lines).toEqual([
      {
        lineNumber: 1,
        productCode: '2000000000017',
        description: 'Arroz 1 kg',
        quantity: 2,
        unit: 'un',
        unitPriceCents: 120_000,
        lineTotalCents: 240_000,
        taxRateBp: 1400,
        taxExemption: undefined,
      },
      {
        lineNumber: 2,
        productCode: 'p2',
        description: 'Fósforos',
        quantity: 1,
        unit: 'cx',
        unitPriceCents: 10_000,
        lineTotalCents: 10_000,
        taxRateBp: undefined,
        taxExemption: undefined,
      },
    ]);
    const withCustomer = buildInvoiceRequest({ ...sale, method: 'credit', customerId: 'c1', dueDate: '2026-11-21' }, settings, customer);
    expect(withCustomer.buyer).toEqual({ name: 'Empresa Exemplo', nif: '5400000000' });
    expect(JSON.stringify(withCustomer)).not.toContain('923000000');
    expect(withCustomer.suggestedDocumentType).toBe('FT');
    expect(withCustomer.payment.dueDate).toBe('2026-11-21');
  });

  it('a voided sale becomes a credit note that points to the original', () => {
    const voided = {
      ...sale,
      voidedAt: '2026-11-06T11:00:00.000Z',
      voidReason: 'Devolução',
      invoice: { status: 'issued' as const, documentNumber: 'FR A/12' },
    };
    expect(buildCreditNoteRequest(voided, settings)).toMatchObject({
      kind: 'credit_note',
      requestId: 'void:s1',
      issueDate: '2026-11-06T11:00:00.000Z',
      reason: 'Devolução',
      original: { requestId: 'sale:s1', documentNumber: 'FR A/12' },
      totalCents: 250_000,
    });
    expect(() => buildCreditNoteRequest(sale, settings)).toThrow();
  });

  it('says what is missing before certified invoicing can start', () => {
    expect(missingInvoiceData(settings, [sale])).toEqual(['lines.taxRate']);
    expect(missingInvoiceData({ ...settings, nif: undefined, address: undefined, vatRegime: 'unknown' })).toEqual([
      'seller.nif',
      'seller.address',
      'seller.vatRegime',
    ]);
  });

  it('exports sales as invoice requests and voids as credit notes, clearly marked as not an invoice', () => {
    const e = invoiceExport([{ ...sale, voidedAt: '2026-11-06T11:00:00.000Z' }], settings, [], new Date('2026-11-07T00:00:00Z'));
    expect(e.notAnInvoice).toBe(true);
    expect(e.documents.map((d) => d.kind)).toEqual(['invoice', 'credit_note']);
  });
});
