import type { Cents, Sale, StaffMember } from './types';

/**
 * Employees on the shop's phone (off by default). Whoever uses the app is the owner or one employee;
 * what they record says who («by»). The Store refuses what the person may not do unless the owner
 * types the owner code on the spot. It is a deterrent, like the owner code: not a vault.
 */

/** Who is using the app. */
export type Person = { kind: 'owner' } | { kind: 'staff'; member: StaffMember };

/** What a person may be allowed to do. */
export type Permission =
  /** Sell on credit. */
  | 'credit'
  /** Products, prices, stock, purchases and suppliers. */
  | 'stock'
  /** See the shop's numbers: profit, costs, what the shop owes, reports. */
  | 'numbers'
  /** The shop's settings (Mais), the owner's INSS and money taken out by the owner. */
  | 'settings';

export const OWNER = 'owner';

export function can(person: Person | null, permission: Permission): boolean {
  if (!person) return false;
  if (person.kind === 'owner') return true;
  const { role, canCredit } = person.member;
  switch (permission) {
    case 'credit':
      return role === 'manager' || canCredit;
    case 'stock':
    case 'numbers':
      return role === 'manager';
    case 'settings':
      return false;
  }
}

/** The id kept on what a person records: 'owner' or the employee's id. */
export const personId = (person: Person): string => (person.kind === 'owner' ? OWNER : person.member.id);

export const NAME_MAX = 40;

/** A person's sales of a day (valid ones), the biggest first. Sales without `by` are left out. */
export function salesByPerson(sales: Sale[]): { by: string; count: number; totalCents: Cents }[] {
  const map = new Map<string, { by: string; count: number; totalCents: Cents }>();
  for (const s of sales) {
    if (s.voidedAt || !s.by) continue;
    const row = map.get(s.by) ?? { by: s.by, count: 0, totalCents: 0 };
    row.count += 1;
    row.totalCents += s.totalCents;
    map.set(s.by, row);
  }
  return [...map.values()].sort((a, b) => b.totalCents - a.totalCents);
}
