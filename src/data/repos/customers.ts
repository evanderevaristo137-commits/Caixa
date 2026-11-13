import { byName } from '../../domain/ranking';
import { normaliseNif } from '../../domain/nif';
import type { Customer } from '../../domain/types';
import { changedFields } from '../../domain/audit-entry';
import { uuid } from '../../lib/ids';
import { StoreCore } from './core';
import { DomainError, clean } from './shared';

/** Customers. */
export class CustomersRepository {
  constructor(private readonly c: StoreCore) {}

  list = async (): Promise<Customer[]> => (await this.c.db.customers.toArray()).sort(byName);
  get = (id: string) => this.c.db.customers.get(id);
  create = (name: string, phone?: string): Promise<Customer> =>
    this.c.db.transaction('rw', [this.c.db.customers, this.c.db.audit], async () => {
      if (!name.trim()) throw new DomainError('name_required');
      const at = this.c.stamp();
      const customer: Customer = { id: uuid(), name: name.trim(), phone: clean(phone), createdAt: at, updatedAt: at };
      await this.c.db.customers.add(customer);
      await this.c.audit({ entity: 'customer', entityId: customer.id, action: 'created', after: customer });
      return customer;
    });
  markReminded = (id: string): Promise<void> =>
    this.c.db.transaction('rw', [this.c.db.customers, this.c.db.audit], async () => {
      const before = await this.c.db.customers.get(id);
      if (!before) throw new DomainError('not_found');
      const at = this.c.stamp();
      // A reminder is not an edit of the customer: `updatedAt` stays (see domain/sync-merge.ts).
      const after: Customer = { ...before, lastRemindedAt: at };
      await this.c.db.customers.put(after);
      await this.c.audit({ entity: 'customer', entityId: id, action: 'updated', ...changedFields(before, after, ['name']) });
    });
  /** Updates only the fields given. */
  update = (id: string, changes: { name?: string; phone?: string; nif?: string; creditLimitCents?: number | null }): Promise<Customer> =>
    this.c.db.transaction('rw', [this.c.db.customers, this.c.db.audit, this.c.db.meta], async () => {
      const before = await this.c.db.customers.get(id);
      if (!before) throw new DomainError('not_found');
      if ('creditLimitCents' in changes && (changes.creditLimitCents ?? undefined) !== before.creditLimitCents)
        await this.c.allow('settings');
      const after: Customer = { ...before, updatedAt: this.c.stamp() };
      if ('name' in changes) {
        if (!changes.name?.trim()) throw new DomainError('name_required');
        after.name = changes.name.trim();
      }
      if ('phone' in changes) after.phone = clean(changes.phone);
      if ('nif' in changes) {
        const nif = normaliseNif(changes.nif);
        if (!nif.ok) throw new DomainError('invalid_nif');
        after.nif = nif.value;
      }
      if ('creditLimitCents' in changes) {
        const limit = changes.creditLimitCents;
        if (limit === null || limit === undefined) delete after.creditLimitCents;
        else if (!Number.isInteger(limit) || limit < 0) throw new DomainError('invalid_limit');
        else after.creditLimitCents = limit;
      }
      await this.c.db.customers.put(after);
      await this.c.audit({ entity: 'customer', entityId: id, action: 'updated', ...changedFields(before, after, ['name']) });
      return after;
    });
}
