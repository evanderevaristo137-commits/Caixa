import type { Cents, ProviderMethod } from '../domain/types';

/** The methods a payment provider handles (bank transfers and the TPA are only recorded by the shop). */
export type ElectronicMethod = ProviderMethod;

export interface PaymentRequest {
  /** Same key = same payment: after a network failure the app can retry without charging twice. */
  idempotencyKey: string;
  amountCents: Cents;
  currency: 'AOA';
  method: ElectronicMethod;
  /** Our reference (e.g. the sale id), to reconcile with the provider's statement. */
  reference: string;
  /** Some methods ask the customer to approve on their own phone. Optional, never stored by Caixa. */
  payerPhone?: string;
}

export type PaymentStatus = 'pending' | 'confirmed' | 'failed' | 'expired' | 'refunded';

export interface PaymentResult {
  status: PaymentStatus;
  /** The provider's id for this payment. */
  providerRef?: string;
  reason?: string;
}

export interface RefundRequest {
  idempotencyKey: string;
  providerRef: string;
  amountCents: Cents;
  reason: string;
}

/**
 * Electronic payments (QR KWiK, Multicaixa Express, Unitel Money, Afrimoney, PayPay).
 * Phase 1 only has a test implementation: no real money moves and no credentials exist.
 * Phase 3 plugs in a provider licensed by the BNA. See docs/INTEGRACOES.md.
 */
export interface PaymentProvider {
  readonly isTest: boolean;
  createPayment(req: PaymentRequest): Promise<PaymentResult>;
  /** For payments that wait for the customer's approval ("pending"). */
  getPaymentStatus(providerRef: string): Promise<PaymentResult>;
  refundPayment(req: RefundRequest): Promise<PaymentResult>;
}

/** Test double. `confirmed` at once by default; `pending` first when asked, to test the waiting flow. */
export class FakePaymentProvider implements PaymentProvider {
  readonly isTest = true;
  private counter = 0;
  private readonly byKey = new Map<string, PaymentResult>();
  private readonly payments = new Map<string, { status: PaymentStatus; amountCents: Cents; checks: number }>();

  constructor(private readonly options: { fail?: boolean; pendingFirst?: boolean } = {}) {}

  async createPayment(req: PaymentRequest): Promise<PaymentResult> {
    const previous = this.byKey.get(req.idempotencyKey);
    if (previous) return previous;
    let result: PaymentResult;
    if (!Number.isInteger(req.amountCents) || req.amountCents <= 0) result = { status: 'failed', reason: 'invalid_amount' };
    else if (this.options.fail) result = { status: 'failed', reason: 'simulated_failure' };
    else {
      this.counter += 1;
      const providerRef = `TESTE-${req.method}-${this.counter}`;
      const status: PaymentStatus = this.options.pendingFirst ? 'pending' : 'confirmed';
      this.payments.set(providerRef, { status, amountCents: req.amountCents, checks: 0 });
      result = { status, providerRef };
    }
    this.byKey.set(req.idempotencyKey, result);
    return result;
  }

  async getPaymentStatus(providerRef: string): Promise<PaymentResult> {
    const p = this.payments.get(providerRef);
    if (!p) return { status: 'failed', reason: 'unknown_payment' };
    // A pending payment is approved by the "customer" on the next check.
    if (p.status === 'pending' && ++p.checks >= 1) p.status = 'confirmed';
    return { status: p.status, providerRef };
  }

  async refundPayment(req: RefundRequest): Promise<PaymentResult> {
    const previous = this.byKey.get(req.idempotencyKey);
    if (previous) return previous;
    const p = this.payments.get(req.providerRef);
    let result: PaymentResult;
    if (!p || p.status !== 'confirmed') result = { status: 'failed', providerRef: req.providerRef, reason: 'not_refundable' };
    else if (req.amountCents <= 0 || req.amountCents > p.amountCents)
      result = { status: 'failed', providerRef: req.providerRef, reason: 'invalid_amount' };
    else {
      p.status = 'refunded';
      result = { status: 'refunded', providerRef: req.providerRef };
    }
    this.byKey.set(req.idempotencyKey, result);
    return result;
  }
}

/** Asks for a payment and, if the customer must approve it, checks a few times. */
export async function payAndWait(provider: PaymentProvider, req: PaymentRequest, attempts = 10, waitMs = 1500): Promise<PaymentResult> {
  let result = await provider.createPayment(req);
  for (let i = 0; result.status === 'pending' && result.providerRef && i < attempts; i++) {
    await new Promise((r) => setTimeout(r, waitMs));
    result = await provider.getPaymentStatus(result.providerRef);
  }
  return result;
}
