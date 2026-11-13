import { normaliseNif } from '../../domain/nif';
import type { Settings } from '../../domain/types';
import { changedFields } from '../../domain/audit-entry';
import { StoreCore } from './core';
import { DEFAULT_STORE_NAME, DomainError, SETTINGS_ID, clean, cleanShort, validTaxRate } from './shared';

/** Settings. */
export class SettingsRepository {
  constructor(private readonly c: StoreCore) {}

  get = async (): Promise<Settings> => {
    const s = await this.c.db.settings.get(SETTINGS_ID);
    if (s) return s;
    const at = this.c.stamp();
    return { id: SETTINGS_ID, storeName: DEFAULT_STORE_NAME, createdAt: at, updatedAt: at };
  };
  /** Updates only the fields given (so saving the shop name never erases the payment term). */
  save = (
    input: Partial<
      Pick<
        Settings,
        | 'storeName'
        | 'phone'
        | 'nif'
        | 'creditTermDays'
        | 'creditLimitCents'
        | 'address'
        | 'vatRegime'
        | 'defaultTaxRateBp'
        | 'cashFloatCents'
        | 'pilotPhone'
        | 'digitalMinShareBp'
        | 'costMethod'
      >
    >,
  ): Promise<Settings> =>
    this.c.db.transaction('rw', [this.c.db.settings, this.c.db.audit, this.c.db.meta], async () => {
      await this.c.allow('settings');
      const before = await this.c.db.settings.get(SETTINGS_ID);
      // The contract minimum of digital payments (credit for stock) needs the owner code to change.
      if ('digitalMinShareBp' in input && (input.digitalMinShareBp || undefined) !== before?.digitalMinShareBp) {
        await this.c.store.security.requireOwner();
      }
      const at = this.c.stamp();
      const after: Settings = { storeName: DEFAULT_STORE_NAME, createdAt: at, ...before, id: SETTINGS_ID, updatedAt: at };
      if ('storeName' in input) {
        if (!input.storeName?.trim()) throw new DomainError('name_required');
        after.storeName = input.storeName.trim();
      }
      if ('phone' in input) after.phone = clean(input.phone);
      if ('pilotPhone' in input) after.pilotPhone = cleanShort(input.pilotPhone, 20);
      if ('digitalMinShareBp' in input) {
        const bp = input.digitalMinShareBp;
        if (bp !== undefined && (!Number.isInteger(bp) || bp < 0 || bp > 10_000)) throw new DomainError('invalid_share');
        if (bp) after.digitalMinShareBp = bp;
        else delete after.digitalMinShareBp; // 0 or none = no contract minimum
      }
      if ('nif' in input) {
        const nif = normaliseNif(input.nif);
        if (!nif.ok) throw new DomainError('invalid_nif');
        after.nif = nif.value;
      }
      if ('costMethod' in input) {
        if (input.costMethod !== undefined && input.costMethod !== 'average') throw new DomainError('invalid_method');
        if (input.costMethod) after.costMethod = input.costMethod;
        else delete after.costMethod; // the cost of the last purchase
      }
      if ('address' in input) after.address = cleanShort(input.address, 200);
      if ('vatRegime' in input) after.vatRegime = input.vatRegime;
      if ('defaultTaxRateBp' in input) {
        if (!validTaxRate(input.defaultTaxRateBp)) throw new DomainError('invalid_tax');
        after.defaultTaxRateBp = input.defaultTaxRateBp;
      }
      if ('creditLimitCents' in input) {
        const limit = input.creditLimitCents;
        if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) throw new DomainError('invalid_limit');
        if (limit) after.creditLimitCents = limit;
        else delete after.creditLimitCents; // 0 or none = no limit
      }
      if ('cashFloatCents' in input) {
        const float = input.cashFloatCents;
        if (float !== undefined && (!Number.isInteger(float) || float < 0)) throw new DomainError('invalid_float');
        if (float) after.cashFloatCents = float;
        else delete after.cashFloatCents; // 0 or none = no float
      }
      if ('creditTermDays' in input) {
        const days = input.creditTermDays;
        if (days === undefined || !Number.isInteger(days) || days < 1 || days > 365) throw new DomainError('invalid_term');
        after.creditTermDays = days;
      }
      await this.c.db.settings.put(after);
      await this.c.audit({ entity: 'settings', entityId: SETTINGS_ID, action: 'updated', ...changedFields(before ?? {}, after) });
      return after;
    });
}

/** Terms of use and privacy policy: which version the shop accepted, and when. */
export class LegalRepository {
  constructor(private readonly c: StoreCore) {}

  /** null = never accepted (undefined is left for "still loading" in the screens). */
  accepted = async (): Promise<{ version: string; at?: string } | null> => {
    const [v, at] = await Promise.all([this.c.db.meta.get('termsAccepted'), this.c.db.meta.get('termsAcceptedAt')]);
    return typeof v?.value === 'string' ? { version: v.value, at: typeof at?.value === 'string' ? at.value : undefined } : null;
  };
  accept = (version: string): Promise<void> =>
    this.c.db.transaction('rw', [this.c.db.meta, this.c.db.audit], async () => {
      const at = this.c.stamp();
      await this.c.db.meta.bulkPut([
        { key: 'termsAccepted', value: version },
        { key: 'termsAcceptedAt', value: at },
      ]);
      await this.c.audit({ entity: 'settings', entityId: 'terms', action: 'updated', after: { version, acceptedAt: at } });
    });
}

/** This phone's id (created once). Used to tell phones apart in the pilot and, later, in synchronisation. */
export class DeviceRepository {
  constructor(private readonly c: StoreCore) {}

  id = (): Promise<string> => this.c.db.transaction('rw', [this.c.db.meta], () => this.c.deviceId());
}
