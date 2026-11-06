import { describe, expect, it } from 'vitest';
import { FakePaymentProvider } from './payment';
import { FakeInvoiceProvider, NoInvoiceProvider } from './invoice';
import type { Sale } from '../domain/types';

describe('FakePaymentProvider', () => {
  it('confirms valid test payments with a test reference', async () => {
    const r = await new FakePaymentProvider().requestPayment({ amountCents: 100, method: 'kwik', reference: 's1' });
    expect(r).toEqual({ status: 'confirmed', providerRef: 'TESTE-kwik-1' });
  });
  it('rejects invalid amounts and can simulate failure', async () => {
    expect((await new FakePaymentProvider().requestPayment({ amountCents: 0, method: 'kwik', reference: 's' })).status).toBe('failed');
    expect((await new FakePaymentProvider(true).requestPayment({ amountCents: 5, method: 'afrimoney', reference: 's' })).status).toBe('failed');
  });
});

describe('InvoiceProviders', () => {
  const sale = { number: 3 } as Sale;
  it('fake provider is clearly marked as test and non-fiscal', async () => {
    const r = await new FakeInvoiceProvider().issueInvoice(sale);
    expect(r).toEqual({ status: 'issued', documentNumber: 'TESTE-NAO-FISCAL-3', isTest: true });
  });
  it('phase 1 production provider never issues anything', async () => {
    expect((await new NoInvoiceProvider().issueInvoice()).status).toBe('unavailable');
  });
});
