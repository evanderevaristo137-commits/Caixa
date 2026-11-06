import type { Cents, PaymentMethod } from '../domain/types';

export interface PaymentRequest {
  amountCents: Cents;
  method: Exclude<PaymentMethod, 'cash' | 'credit'>;
  /** Our sale id, so the provider can be reconciled later. */
  reference: string;
}

export type PaymentResult =
  | { status: 'confirmed'; providerRef: string }
  | { status: 'failed'; reason: string };

/**
 * Electronic payments (QR KWiK, Multicaixa Express, Unitel Money, Afrimoney).
 * Phase 1 only has a test implementation: no real money moves and no credentials exist.
 * Phase 3 plugs in a provider licensed by the BNA.
 */
export interface PaymentProvider {
  readonly isTest: boolean;
  requestPayment(req: PaymentRequest): Promise<PaymentResult>;
}

/** Simulates the shopkeeper confirming that the payment arrived on their phone. */
export class FakePaymentProvider implements PaymentProvider {
  readonly isTest = true;
  private counter = 0;
  constructor(private readonly shouldFail = false) {}

  async requestPayment(req: PaymentRequest): Promise<PaymentResult> {
    if (!Number.isInteger(req.amountCents) || req.amountCents <= 0) {
      return { status: 'failed', reason: 'invalid_amount' };
    }
    if (this.shouldFail) return { status: 'failed', reason: 'simulated_failure' };
    this.counter += 1;
    return { status: 'confirmed', providerRef: `TESTE-${req.method}-${this.counter}` };
  }
}
