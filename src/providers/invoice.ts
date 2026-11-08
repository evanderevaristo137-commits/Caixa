import type { CreditNoteRequest, InvoiceRequest } from '../integrations/invoice-request';

export type InvoiceResult =
  | { status: 'issued'; documentNumber: string; isTest: boolean; documentUrl?: string }
  | { status: 'unavailable' | 'rejected'; reason: string };

/**
 * Certified invoicing. The app itself NEVER issues invoices: only AGT-certified software can.
 * Phase 3 connects an AGT-certified partner through this interface. See docs/INTEGRACOES.md.
 */
export interface InvoiceProvider {
  readonly isTest: boolean;
  /** Must be idempotent on `requestId`: the same sale never gets two invoices. */
  issueInvoice(req: InvoiceRequest): Promise<InvoiceResult>;
  /** Cancels an issued invoice (voided sale) with a credit note. */
  issueCreditNote(req: CreditNoteRequest): Promise<InvoiceResult>;
}

/** Test double: clearly fake numbers, never shown to customers as an invoice. */
export class FakeInvoiceProvider implements InvoiceProvider {
  readonly isTest = true;
  private readonly issued = new Map<string, InvoiceResult>();
  private counter = 0;

  private issue(requestId: string, prefix: string): InvoiceResult {
    const previous = this.issued.get(requestId);
    if (previous) return previous;
    this.counter += 1;
    const result: InvoiceResult = { status: 'issued', documentNumber: `${prefix}-TESTE-NAO-FISCAL-${this.counter}`, isTest: true };
    this.issued.set(requestId, result);
    return result;
  }

  async issueInvoice(req: InvoiceRequest): Promise<InvoiceResult> {
    if (req.lines.length === 0 || req.totalCents <= 0) return { status: 'rejected', reason: 'empty_document' };
    return this.issue(req.requestId, req.suggestedDocumentType);
  }

  async issueCreditNote(req: CreditNoteRequest): Promise<InvoiceResult> {
    if (!req.reason) return { status: 'rejected', reason: 'reason_required' };
    return this.issue(req.requestId, 'NC');
  }
}

/** What production uses in phase 1: no invoicing available. */
export class NoInvoiceProvider implements InvoiceProvider {
  readonly isTest = false;
  async issueInvoice(): Promise<InvoiceResult> {
    return { status: 'unavailable', reason: 'no_certified_partner' };
  }
  async issueCreditNote(): Promise<InvoiceResult> {
    return { status: 'unavailable', reason: 'no_certified_partner' };
  }
}
