import { isValidDateString, toLocalDateString } from '../../lib/dates';
import { compareText } from '../../domain/ranking';
import { baseCents, isMonth, monthOf, paymentNote, validatePlan } from '../../domain/inss';
import type { Expense, InssContribution, InssPlan, Settings } from '../../domain/types';
import { changedFields } from '../../domain/audit-entry';
import { uuid } from '../../lib/ids';
import { StoreCore } from './core';
import { DEFAULT_STORE_NAME, DomainError, SETTINGS_ID, cleanShort } from './shared';

/** The owner's retirement (INSS). */
export class InssRepository {
  constructor(private readonly c: StoreCore) {}

  /** Contributions recorded, most recent month first (voided ones included). */
  list = async (): Promise<InssContribution[]> =>
    (await this.c.db.inssContributions.toArray()).sort((a, b) => compareText(b.month, a.month) || compareText(b.createdAt, a.createdAt));
  /** Money set aside for the INSS ('inss' outflows) and not yet used in a payment. */
  saved = (): Promise<number> => this.c.db.transaction('r', [this.c.db.expenses, this.c.db.inssContributions], () => this.c.inssSaved());
  /**
   * Starts or changes the owner's plan; null stops it (the history stays).
   * The first month followed is the month it started, and does not change afterwards.
   */
  savePlan = (
    input: (Pick<InssPlan, 'wages' | 'modality'> & Partial<Pick<InssPlan, 'birthYear' | 'monthsBefore' | 'number'>>) | null,
  ): Promise<Settings> =>
    this.c.db.transaction('rw', [this.c.db.settings, this.c.db.audit], async () => {
      const before = await this.c.db.settings.get(SETTINGS_ID);
      const at = this.c.stamp();
      const after: Settings = { storeName: DEFAULT_STORE_NAME, createdAt: at, ...before, id: SETTINGS_ID, updatedAt: at };
      if (input === null) delete after.inss;
      else {
        const number = cleanShort(input.number, 30);
        const plan: InssPlan = {
          wages: input.wages,
          modality: input.modality,
          startMonth: before?.inss?.startMonth ?? monthOf(this.c.now()),
          ...(input.birthYear !== undefined ? { birthYear: input.birthYear } : {}),
          ...(input.monthsBefore ? { monthsBefore: input.monthsBefore } : {}),
          ...(number ? { number } : {}),
        };
        const error = validatePlan(plan, this.c.now());
        if (error) throw new DomainError(error);
        after.inss = plan;
      }
      await this.c.db.settings.put(after);
      await this.c.audit({ entity: 'settings', entityId: SETTINGS_ID, action: 'updated', ...changedFields(before ?? {}, after) });
      return after;
    });
  /**
   * Records a contribution the owner paid to the INSS (the app never moves the money).
   * `fromSavedCents` comes out of the money set aside; `fromCashCents` came straight out of the till
   * and is recorded as an outflow too, so the cash count stays right; the rest came from elsewhere.
   */
  pay = (input: {
    month: string;
    amountCents: number;
    paidOn?: string;
    receipt?: string;
    fromSavedCents?: number;
    fromCashCents?: number;
  }): Promise<InssContribution> =>
    this.c.db.transaction(
      'rw',
      [this.c.db.inssContributions, this.c.db.expenses, this.c.db.settings, this.c.db.audit, this.c.db.meta],
      async () => {
        const plan = (await this.c.db.settings.get(SETTINGS_ID))?.inss;
        if (!plan) throw new DomainError('no_plan');
        const today = toLocalDateString(this.c.now());
        if (!isMonth(input.month) || input.month > monthOf(this.c.now()) || input.month < '2000-01') throw new DomainError('invalid_month');
        if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new DomainError('invalid_amount');
        const paidOn = input.paidOn ?? today;
        if (!isValidDateString(paidOn) || paidOn > today) throw new DomainError('invalid_date');
        const same = await this.c.db.inssContributions.where('month').equals(input.month).toArray();
        if (same.some((c) => !c.voidedAt)) throw new DomainError('duplicate_month');
        const fromSaved = input.fromSavedCents ?? 0;
        const fromCash = input.fromCashCents ?? 0;
        if (![fromSaved, fromCash].every((n) => Number.isInteger(n) && n >= 0) || fromSaved + fromCash > input.amountCents) {
          throw new DomainError('invalid_source');
        }
        if (fromSaved > (await this.c.inssSaved())) throw new DomainError('not_saved');
        const at = this.c.stamp();
        const deviceId = await this.c.deviceId();
        let expenseId: string | undefined;
        if (fromCash > 0) {
          const expense: Expense = {
            id: uuid(),
            category: 'inss',
            amountCents: fromCash,
            fromCash: true,
            note: paymentNote(input.month),
            deviceId,
            createdAt: at,
            updatedAt: at,
          };
          await this.c.db.expenses.add(expense);
          await this.c.audit({ entity: 'expense', entityId: expense.id, action: 'created', after: expense });
          expenseId = expense.id;
        }
        const contribution: InssContribution = {
          id: uuid(),
          month: input.month,
          amountCents: input.amountCents,
          baseCents: baseCents(plan),
          paidOn,
          receipt: cleanShort(input.receipt, 40),
          // The outflow above counts as set aside, and this payment uses it at once.
          savedUsedCents: fromSaved + fromCash,
          expenseId,
          deviceId,
          createdAt: at,
          updatedAt: at,
        };
        await this.c.db.inssContributions.add(contribution);
        await this.c.audit({ entity: 'inss_contribution', entityId: contribution.id, action: 'created', after: contribution });
        return contribution;
      },
    );
  /** A mistake stays in the history, marked as voided. The money it used goes back to what is set aside. */
  void = (id: string, reason: string): Promise<InssContribution> =>
    this.c.db.transaction('rw', [this.c.db.inssContributions, this.c.db.expenses, this.c.db.audit, this.c.db.meta], async () => {
      await this.c.store.security.requireOwner();
      const before = await this.c.db.inssContributions.get(id);
      if (!before) throw new DomainError('not_found');
      if (before.voidedAt) throw new DomainError('already_voided');
      if (reason.trim().length < 3) throw new DomainError('reason_required');
      const at = this.c.stamp();
      const after: InssContribution = { ...before, voidedAt: at, voidReason: reason.trim(), updatedAt: at };
      await this.c.db.inssContributions.put(after);
      await this.c.audit({ entity: 'inss_contribution', entityId: id, action: 'voided', before, after });
      // The outflow recorded with it (money straight from the till) is voided too.
      const expense = before.expenseId ? await this.c.db.expenses.get(before.expenseId) : undefined;
      if (expense && !expense.voidedAt) {
        const voided: Expense = { ...expense, voidedAt: at, voidReason: reason.trim(), updatedAt: at };
        await this.c.db.expenses.put(voided);
        await this.c.audit({ entity: 'expense', entityId: expense.id, action: 'voided', before: expense, after: voided });
      }
      return after;
    });
}
