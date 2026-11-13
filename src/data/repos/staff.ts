import { hashPin, isValidPin, newSalt, pinWaitMs, PIN_ITERATIONS, verifyPin } from '../../domain/pin';
import { byName } from '../../domain/ranking';
import { NAME_MAX, OWNER, type Person } from '../../domain/staff';
import type { StaffMember, StaffRole } from '../../domain/types';
import { uuid } from '../../lib/ids';
import { StoreCore } from './core';
import { DomainError, type PinCheck } from './shared';

export interface StaffInput {
  name: string;
  role: StaffRole;
  /** Only for sellers: managers always may sell on credit. */
  canCredit: boolean;
}

/**
 * Employees on the shop's phone (off by default). The owner adds them (with the owner code), each
 * with a name, a role and a code of their own; whoever uses the app signs in with their code, and
 * what they record says who. Codes are kept only on the phone (`staffPins`), never in a backup.
 */
export class StaffRepository {
  constructor(private readonly c: StoreCore) {}

  /** Everyone who ever worked in the shop (archived ones too: old sales still name them), by name. */
  all = async (): Promise<StaffMember[]> => (await this.c.db.staff.toArray()).sort(byName);
  active = async (): Promise<StaffMember[]> => (await this.all()).filter((m) => !m.archivedAt);
  /** Has a code on this phone (after restoring a backup on another phone, the owner gives new ones). */
  hasPin = async (id: string): Promise<boolean> => !!(await this.c.db.staffPins.get(id));

  /** Whether the shop has employees, and who is using the app. */
  isOn = (): boolean => this.c.team.on;
  current = (): Person | null => this.c.team.person;

  /** Reads whether the shop has employees: when the app starts, and after a backup is restored. */
  load = async (): Promise<void> => {
    const active = await this.active();
    this.c.team.on = active.length > 0;
    const person = this.c.team.person;
    if (!this.c.team.on) this.c.team.person = { kind: 'owner' };
    else if (person?.kind === 'staff') {
      const fresh = active.find((m) => m.id === person.member.id);
      this.c.team.person = fresh ? { kind: 'staff', member: fresh } : null;
    }
  };

  /**
   * Who used the app last time (the screens keep it on the phone), without asking the code again:
   * closing and opening the app must not stop a sale. Unknown or archived: nobody (the app asks).
   */
  restore = async (id: string | null): Promise<Person | null> => {
    await this.load();
    if (!this.c.team.on) return this.c.team.person;
    if (id === OWNER) this.c.team.person = { kind: 'owner' };
    else {
      const member = id ? await this.c.db.staff.get(id) : undefined;
      this.c.team.person = member && !member.archivedAt ? { kind: 'staff', member } : null;
    }
    return this.c.team.person;
  };

  /**
   * The owner or an employee starts using the app, with their own code (wrong codes make the next
   * try wait, as with the owner code). Signing in as the owner does not open the sensitive actions:
   * those still ask the owner code each time. Audited.
   */
  signIn = async (id: string, pin: string): Promise<PinCheck> => {
    let person: Person;
    if (id === OWNER) {
      const result = await this.c.store.security.check(pin);
      if (!result.ok) return result;
      person = { kind: 'owner' };
    } else {
      const member = await this.c.db.staff.get(id);
      if (!member || member.archivedAt) throw new DomainError('not_found');
      const result = await this.checkPin(member.id, pin);
      if (!result.ok) return result;
      person = { kind: 'staff', member };
    }
    this.c.team.person = person;
    await this.c.db.transaction('rw', [this.c.db.audit], () =>
      this.c.audit({
        entity: 'staff',
        entityId: id,
        action: 'signed_in',
        after: { name: person.kind === 'owner' ? OWNER : person.member.name },
      }),
    );
    return { ok: true };
  };

  /** Adds an employee. Needs the owner code to be set (and typed now). Their code is never the owner's. */
  add = async (input: StaffInput, pin: string): Promise<StaffMember> => {
    const name = this.checkInput(input);
    if (!isValidPin(pin)) throw new DomainError('invalid_pin');
    await this.ownerOnly();
    await this.notOwnerPin(pin);
    // Slow on purpose (about a quarter of a second on a cheap phone): before the transaction.
    const salt = newSalt();
    const hash = await hashPin(pin, salt);
    const at = this.c.stamp();
    const member: StaffMember = {
      id: uuid(),
      name,
      role: input.role,
      canCredit: input.role === 'manager' || input.canCredit,
      createdAt: at,
      updatedAt: at,
    };
    await this.c.db.transaction('rw', [this.c.db.staff, this.c.db.staffPins, this.c.db.audit], async () => {
      await this.c.db.staff.add(member);
      await this.c.db.staffPins.put({ id: member.id, salt, hash });
      await this.c.audit({
        entity: 'staff',
        entityId: member.id,
        action: 'created',
        after: { name, role: member.role, canCredit: member.canCredit },
      });
    });
    // The owner, who just typed the owner code, is the one using the app.
    if (!this.c.team.on) this.c.team.person = { kind: 'owner' };
    await this.load();
    return member;
  };

  /** Name, role and credit of an employee. Owner only. Audited (only what changed). */
  update = async (id: string, input: StaffInput): Promise<StaffMember> => {
    const name = this.checkInput(input);
    await this.ownerOnly();
    const after = await this.c.db.transaction('rw', [this.c.db.staff, this.c.db.audit], async () => {
      const before = await this.c.db.staff.get(id);
      if (!before || before.archivedAt) throw new DomainError('not_found');
      const next: StaffMember = {
        ...before,
        name,
        role: input.role,
        canCredit: input.role === 'manager' || input.canCredit,
        updatedAt: this.c.stamp(),
      };
      await this.c.db.staff.put(next);
      const changed = (['name', 'role', 'canCredit'] as const).filter((k) => before[k] !== next[k]);
      if (changed.length > 0) {
        await this.c.audit({
          entity: 'staff',
          entityId: id,
          action: 'updated',
          before: Object.fromEntries(changed.map((k) => [k, before[k]])),
          after: { name: next.name, ...Object.fromEntries(changed.map((k) => [k, next[k]])) },
        });
      }
      return next;
    });
    await this.load();
    return after;
  };

  /** A new code for an employee (forgotten, or after restoring a backup on another phone). Owner only. */
  setPin = async (id: string, pin: string): Promise<void> => {
    if (!isValidPin(pin)) throw new DomainError('invalid_pin');
    await this.ownerOnly();
    await this.notOwnerPin(pin);
    const salt = newSalt();
    const hash = await hashPin(pin, salt);
    await this.c.db.transaction('rw', [this.c.db.staff, this.c.db.staffPins, this.c.db.audit], async () => {
      const member = await this.c.db.staff.get(id);
      if (!member || member.archivedAt) throw new DomainError('not_found');
      await this.c.db.staffPins.put({ id, salt, hash });
      await this.c.audit({ entity: 'staff', entityId: id, action: 'updated', after: { name: member.name, pin: 'set' } });
    });
  };

  /** The employee no longer works in the shop: kept for old sales, never deleted. Owner only. */
  archive = async (id: string): Promise<void> => {
    await this.ownerOnly();
    await this.c.db.transaction('rw', [this.c.db.staff, this.c.db.staffPins, this.c.db.audit], async () => {
      const before = await this.c.db.staff.get(id);
      if (!before || before.archivedAt) throw new DomainError('not_found');
      const at = this.c.stamp();
      await this.c.db.staff.put({ ...before, archivedAt: at, updatedAt: at });
      await this.c.db.staffPins.delete(id);
      await this.c.audit({ entity: 'staff', entityId: id, action: 'archived', after: { name: before.name } });
    });
    await this.load();
  };

  private checkInput(input: StaffInput): string {
    const name = input.name.trim().replace(/\s+/g, ' ');
    if (!name) throw new DomainError('name_required');
    if (name.length > NAME_MAX) throw new DomainError('name_too_long');
    if (input.role !== 'seller' && input.role !== 'manager') throw new DomainError('invalid_role');
    return name;
  }

  /** Managing employees: only with an owner code set, typed now (`security.unlock`). */
  private async ownerOnly(): Promise<void> {
    if (!(await this.c.store.security.hasPin())) throw new DomainError('owner_code_first');
    await this.c.store.security.requireOwner();
  }

  /** An employee's code is never the owner's (they would know it, and could not be told apart). */
  private async notOwnerPin(pin: string): Promise<void> {
    const [hash, salt] = await this.c.db.meta.bulkGet(['ownerPinHash', 'ownerPinSalt']);
    if (typeof hash?.value !== 'string' || typeof salt?.value !== 'string') return;
    if ((await verifyPin(pin, salt.value, hash.value)).ok) throw new DomainError('same_as_owner');
  }

  /** Checks an employee's code; after 3 wrong ones in a row the next try waits, as with the owner code. */
  private async checkPin(id: string, pin: string): Promise<PinCheck> {
    const row = await this.c.db.staffPins.get(id);
    if (!row) throw new DomainError('no_code');
    const now = this.c.now().getTime();
    if (row.waitUntil && now < row.waitUntil) return { ok: false, waitSeconds: Math.ceil((row.waitUntil - now) / 1000) };
    const result = await verifyPin(pin, row.salt, row.hash);
    if (result.ok) {
      if (result.upgrade || row.fails) {
        const salt = result.upgrade ? newSalt() : row.salt;
        const hash = result.upgrade ? await hashPin(pin, salt, PIN_ITERATIONS) : row.hash;
        await this.c.db.staffPins.put({ id, salt, hash });
      }
      return { ok: true };
    }
    const fails = (row.fails ?? 0) + 1;
    const wait = pinWaitMs(fails);
    await this.c.db.staffPins.put({ ...row, fails, waitUntil: wait ? now + wait : undefined });
    return wait ? { ok: false, waitSeconds: Math.ceil(wait / 1000) } : { ok: false };
  }
}
