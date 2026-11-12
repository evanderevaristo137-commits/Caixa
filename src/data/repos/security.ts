import { hashPin, isValidPin, newSalt, pinWaitMs, verifyPin } from '../../domain/pin';
import { deriveKey, exportRawKey, KDF_ITERATIONS, normalisePassword, randomBytes, toBase64 } from '../../lib/pack';
import { StoreCore } from './core';
import {
  BACKUP_LOCK_KEY,
  BACKUP_PASSWORD_MIN,
  DomainError,
  OWNER_GRANT_MS,
  PIN_KEYS,
  parseBackupLock,
  type BackupLock,
  type PinCheck,
} from './shared';

/** Owner code (PIN). */
export class SecurityRepository {
  constructor(private readonly c: StoreCore) {}

  hasPin = async () => !!(await this.c.db.meta.get('ownerPinHash'));
  /**
   * Checks a code. After 3 wrong codes in a row the next try must wait 30 s, then twice as long
   * after each new wrong code (up to an hour); while waiting, no code is even tried. A right code
   * resets the count, and a code kept the old way (before November 2026) is kept the new way.
   */
  check = async (pin: string): Promise<PinCheck> => {
    const [hash, salt, fails, waitUntil] = await this.c.db.meta.bulkGet([...PIN_KEYS]);
    if (typeof hash?.value !== 'string' || typeof salt?.value !== 'string') return { ok: true }; // no code set
    const now = this.c.now().getTime();
    const until = typeof waitUntil?.value === 'number' ? waitUntil.value : 0;
    if (now < until) return { ok: false, waitSeconds: Math.ceil((until - now) / 1000) };
    const result = await verifyPin(pin, salt.value, hash.value);
    if (result.ok) {
      const fresh = newSalt();
      const upgraded = result.upgrade ? await hashPin(pin, fresh) : null;
      await this.c.db.transaction('rw', [this.c.db.meta], async () => {
        await this.c.db.meta.bulkDelete(['ownerPinFails', 'ownerPinWaitUntil']);
        if (upgraded) {
          await this.c.db.meta.bulkPut([
            { key: 'ownerPinSalt', value: fresh },
            { key: 'ownerPinHash', value: upgraded },
          ]);
        }
      });
      return { ok: true };
    }
    const count = (typeof fails?.value === 'number' ? fails.value : 0) + 1;
    const wait = pinWaitMs(count);
    await this.c.db.meta.bulkPut([
      { key: 'ownerPinFails', value: count },
      ...(wait ? [{ key: 'ownerPinWaitUntil', value: now + wait }] : []),
    ]);
    return wait ? { ok: false, waitSeconds: Math.ceil(wait / 1000) } : { ok: false };
  };
  /** True when the code is right (and counts wrong codes, like `check`). */
  verify = async (pin: string): Promise<boolean> => (await this.check(pin)).ok;
  /**
   * Opens sensitive actions after the right code, until `lock` (the screens call it as soon as the
   * action ends) or for OWNER_GRANT_MS at most.
   */
  unlock = async (pin: string): Promise<PinCheck> => {
    const result = await this.check(pin);
    if (result.ok) this.c.ownerGrantUntil = this.c.now().getTime() + OWNER_GRANT_MS;
    return result;
  };
  lock = () => {
    this.c.ownerGrantUntil = 0;
  };
  /**
   * Sensitive actions call this first: with an owner code set, they only go ahead after `unlock`.
   * Refuses with 'owner_code_required' otherwise.
   */
  requireOwner = async (): Promise<void> => {
    if (this.c.now().getTime() < this.c.ownerGrantUntil) return;
    if (await this.hasPin()) throw new DomainError('owner_code_required');
  };
  /** Sets or changes the code. Changing requires the current one. */
  setPin = async (newPin: string, currentPin?: string): Promise<void> => {
    if (!isValidPin(newPin)) throw new DomainError('invalid_pin');
    if (await this.hasPin()) await this.c.ownerCode(currentPin ?? '');
    const salt = newSalt();
    const hash = await hashPin(newPin, salt);
    await this.c.db.transaction('rw', [this.c.db.meta, this.c.db.audit], async () => {
      await this.c.db.meta.bulkPut([
        { key: 'ownerPinSalt', value: salt },
        { key: 'ownerPinHash', value: hash },
      ]);
      await this.c.audit({ entity: 'settings', entityId: 'owner_pin', action: 'updated', after: { pin: 'set' } });
    });
  };
  removePin = async (currentPin: string): Promise<void> => {
    await this.c.ownerCode(currentPin);
    await this.c.db.transaction('rw', [this.c.db.meta, this.c.db.audit], async () => {
      await this.c.db.meta.bulkDelete([...PIN_KEYS]);
      await this.c.audit({ entity: 'settings', entityId: 'owner_pin', action: 'updated', after: { pin: 'removed' } });
    });
  };
  /** The key that protects new backups, when the owner chose a password. */
  backupLock = async (): Promise<BackupLock | null> => parseBackupLock((await this.c.db.meta.get(BACKUP_LOCK_KEY))?.value);
  /**
   * Protects the next backups with a password (or stops protecting them, with null). Copies already
   * made keep opening with the password they were made with. Audited, without the password.
   */
  setBackupPassword = async (password: string | null): Promise<void> => {
    await this.requireOwner();
    let lock: BackupLock | null = null;
    if (password !== null) {
      if (normalisePassword(password).length < BACKUP_PASSWORD_MIN) throw new DomainError('weak_password');
      const salt = randomBytes(16);
      // Slow on purpose (about a second on a cheap phone), so done before the transaction.
      const key = await deriveKey(password, salt, KDF_ITERATIONS, true);
      lock = { v: 1, salt: toBase64(salt), iterations: KDF_ITERATIONS, key: toBase64(await exportRawKey(key)) };
    }
    await this.c.db.transaction('rw', [this.c.db.meta, this.c.db.audit], async () => {
      const had = parseBackupLock((await this.c.db.meta.get(BACKUP_LOCK_KEY))?.value) !== null;
      if (lock) await this.c.db.meta.put({ key: BACKUP_LOCK_KEY, value: JSON.stringify(lock) });
      else await this.c.db.meta.delete(BACKUP_LOCK_KEY);
      await this.c.audit({
        entity: 'settings',
        entityId: 'backup_password',
        action: 'updated',
        after: { password: lock ? (had ? 'changed' : 'set') : 'removed' },
      });
    });
  };
}
