import type { Sale, Settings } from '../domain/types';

export type InvoiceResult = { status: 'issued'; documentNumber: string; isTest: boolean } | { status: 'unavailable'; reason: string };

/**
 * Certified invoicing. The app itself NEVER issues invoices: only AGT-certified software can.
 * Phase 3 connects to a certified partner through this interface.
 */
export interface InvoiceProvider {
  readonly isTest: boolean;
  issueInvoice(sale: Sale, store: Pick<Settings, 'storeName' | 'nif'>): Promise<InvoiceResult>;
}

/** Test double: returns clearly fake numbers, never shown to customers as an invoice. */
export class FakeInvoiceProvider implements InvoiceProvider {
  readonly isTest = true;
  async issueInvoice(sale: Sale): Promise<InvoiceResult> {
    return { status: 'issued', documentNumber: `TESTE-NAO-FISCAL-${sale.number}`, isTest: true };
  }
}

/** What production uses in phase 1: no invoicing available. */
export class NoInvoiceProvider implements InvoiceProvider {
  readonly isTest = false;
  async issueInvoice(): Promise<InvoiceResult> {
    return { status: 'unavailable', reason: 'no_certified_partner' };
  }
}
