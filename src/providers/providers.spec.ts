import { describe, expect, it } from 'vitest';
import { FakePaymentProvider, payAndWait, type PaymentRequest } from './payment';
import { FakeInvoiceProvider, NoInvoiceProvider } from './invoice';
import { buildCreditNoteRequest, buildInvoiceRequest } from '../integrations/invoice-request';
import type { Sale, Settings } from '../domain/types';

const req = (over: Partial<PaymentRequest> = {}): PaymentRequest => ({
  idempotencyKey: 'k1',
  amountCents: 100_000,
  currency: 'AOA',
  method: 'paypay',
  reference: 'sale-1',
  ...over,
});

describe('PaymentProvider (test double)', () => {
  it('confirms a payment and never charges twice for the same key', async () => {
    const p = new FakePaymentProvider();
    const first = await p.createPayment(req());
    expect(first).toEqual({ status: 'confirmed', providerRef: 'TESTE-paypay-1' });
    expect(await p.createPayment(req())).toEqual(first);
    expect((await p.createPayment(req({ idempotencyKey: 'k2' }))).providerRef).toBe('TESTE-paypay-2');
  });

  it('handles payments the customer approves on their phone', async () => {
    const p = new FakePaymentProvider({ pendingFirst: true });
    expect((await p.createPayment(req())).status).toBe('pending');
    expect((await payAndWait(p, req({ idempotencyKey: 'k3' }), 3, 0)).status).toBe('confirmed');
  });

  it('refunds at most what was paid, once', async () => {
    const p = new FakePaymentProvider();
    const { providerRef } = await p.createPayment(req());
    expect((await p.refundPayment({ idempotencyKey: 'r1', providerRef: providerRef!, amountCents: 100_001, reason: 'x' })).status).toBe(
      'failed',
    );
    expect(
      (await p.refundPayment({ idempotencyKey: 'r2', providerRef: providerRef!, amountCents: 100_000, reason: 'Devolução' })).status,
    ).toBe('refunded');
    expect((await p.getPaymentStatus(providerRef!)).status).toBe('refunded');
  });

  it('rejects invalid amounts and can simulate failure', async () => {
    expect((await new FakePaymentProvider().createPayment(req({ amountCents: 0 }))).status).toBe('failed');
    expect((await new FakePaymentProvider({ fail: true }).createPayment(req())).status).toBe('failed');
  });
});

describe('InvoiceProvider', () => {
  const settings: Settings = { id: 'main', storeName: 'Loja', createdAt: '', updatedAt: '' };
  const sale = {
    id: 's1',
    number: 3,
    items: [{ productId: 'p', name: 'X', unitPriceCents: 100, quantity: 1, lineTotalCents: 100 }],
    totalCents: 100,
    currency: 'AOA',
    method: 'cash',
    createdAt: '',
    updatedAt: '',
  } as Sale;

  it('test double issues clearly fake numbers, once per request', async () => {
    const p = new FakeInvoiceProvider();
    const r = await p.issueInvoice(buildInvoiceRequest(sale, settings));
    expect(r).toEqual({ status: 'issued', documentNumber: 'FR-TESTE-NAO-FISCAL-1', isTest: true });
    expect(await p.issueInvoice(buildInvoiceRequest(sale, settings))).toEqual(r);
    const nc = await p.issueCreditNote(buildCreditNoteRequest({ ...sale, voidedAt: 'x', voidReason: 'Engano' }, settings));
    expect(nc).toMatchObject({ status: 'issued', documentNumber: 'NC-TESTE-NAO-FISCAL-2' });
  });

  it('phase 1 production provider never issues anything', async () => {
    expect((await new NoInvoiceProvider().issueInvoice()).status).toBe('unavailable');
  });
});
