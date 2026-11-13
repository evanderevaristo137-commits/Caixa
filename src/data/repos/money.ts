import { toLocalDateString } from '../../lib/dates';
import { closeResult, type Drawer } from '../../domain/cash';
import type { CashClose, Expense, ExpenseCategory } from '../../domain/types';
import { EXPENSE_CATEGORIES } from '../../domain/types';
import { uuid } from '../../lib/ids';
import { StoreCore } from './core';
import { DomainError, cleanShort } from './shared';

/** Money out: expenses and the owner's withdrawals. */
export class ExpensesRepository {
  constructor(private readonly c: StoreCore) {}

  list = () => this.c.db.expenses.orderBy('createdAt').toArray();
  /** Records with from <= createdAt < to (ISO strings). */
  between = (fromIso: string, toIso: string) => this.c.db.expenses.where('createdAt').between(fromIso, toIso, true, false).toArray();
  create = (input: { category: ExpenseCategory; amountCents: number; fromCash: boolean; note?: string }): Promise<Expense> =>
    this.c.db.transaction('rw', [this.c.db.expenses, this.c.db.audit, this.c.db.meta], async () => {
      if (!(EXPENSE_CATEGORIES as readonly string[]).includes(input.category)) throw new DomainError('invalid_category');
      if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new DomainError('invalid_amount');
      if (input.category === 'withdrawal' || input.category === 'inss') await this.c.allow('settings');
      const at = this.c.stamp();
      const by = this.c.by();
      const expense: Expense = {
        id: uuid(),
        ...(by ? { by } : {}),
        category: input.category,
        amountCents: input.amountCents,
        fromCash: input.fromCash,
        note: cleanShort(input.note, 120),
        deviceId: await this.c.deviceId(),
        createdAt: at,
        updatedAt: at,
      };
      await this.c.db.expenses.add(expense);
      await this.c.audit({ entity: 'expense', entityId: expense.id, action: 'created', after: expense });
      return expense;
    });
  /** A mistake stays in the history, marked as voided, and stops counting. A reason is mandatory. */
  void = (id: string, reason: string): Promise<Expense> =>
    this.c.db.transaction('rw', [this.c.db.expenses, this.c.db.inssContributions, this.c.db.audit, this.c.db.meta], async () => {
      await this.c.store.security.requireOwner();
      const before = await this.c.db.expenses.get(id);
      if (!before) throw new DomainError('not_found');
      if (before.voidedAt) throw new DomainError('already_voided');
      if (reason.trim().length < 3) throw new DomainError('reason_required');
      // Money set aside for the INSS that a payment already used: void the payment first.
      if (before.category === 'inss' && before.amountCents > (await this.c.inssSaved())) throw new DomainError('inss_used');
      const at = this.c.stamp();
      const after: Expense = { ...before, voidedAt: at, voidReason: reason.trim(), updatedAt: at };
      await this.c.db.expenses.put(after);
      await this.c.audit({ entity: 'expense', entityId: id, action: 'voided', before, after });
      return after;
    });
}

/** Cash in the till and the end-of-day count. */
export class CashRepository {
  constructor(private readonly c: StoreCore) {}

  /** What the till should have on that local day (from the facts), with this opening float. */
  drawer = (day: Date, floatCents: number): Promise<Drawer> =>
    this.c.db.transaction(
      'r',
      [this.c.db.sales, this.c.db.creditPayments, this.c.db.expenses, this.c.db.purchases, this.c.db.supplierPayments, this.c.db.returns],
      () => this.c.drawerOn(day, floatCents),
    );
  /** Records the count. Expected cash is computed here, from the facts, never typed. Audited. */
  close = (input: { floatCents: number; countedCents: number; note?: string; day?: Date }): Promise<CashClose> =>
    this.c.db.transaction(
      'rw',
      [
        this.c.db.cashCloses,
        this.c.db.sales,
        this.c.db.creditPayments,
        this.c.db.expenses,
        this.c.db.purchases,
        this.c.db.supplierPayments,
        this.c.db.returns,
        this.c.db.audit,
        this.c.db.meta,
      ],
      async () => {
        if (!Number.isInteger(input.floatCents) || input.floatCents < 0) throw new DomainError('invalid_float');
        if (!Number.isInteger(input.countedCents) || input.countedCents < 0) throw new DomainError('invalid_amount');
        const day = input.day ?? this.c.now();
        const d = await this.c.drawerOn(day, input.floatCents);
        const at = this.c.stamp();
        const by = this.c.by();
        const close: CashClose = {
          id: uuid(),
          ...(by ? { by } : {}),
          day: toLocalDateString(day),
          floatCents: input.floatCents,
          expectedCents: d.expectedCents,
          countedCents: input.countedCents,
          differenceCents: closeResult(d.expectedCents, input.countedCents).differenceCents,
          note: cleanShort(input.note, 120),
          deviceId: await this.c.deviceId(),
          createdAt: at,
          updatedAt: at,
        };
        await this.c.db.cashCloses.add(close);
        await this.c.audit({ entity: 'cash_close', entityId: close.id, action: 'created', after: close });
        return close;
      },
    );
  /** The latest count of a local day ("YYYY-MM-DD"): if the day is closed twice, the last one counts. */
  lastClose = async (day: string): Promise<CashClose | undefined> =>
    (await this.c.db.cashCloses.where('day').equals(day).sortBy('createdAt')).at(-1);
  closes = () => this.c.db.cashCloses.orderBy('createdAt').toArray();
}
