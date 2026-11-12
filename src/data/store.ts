import { CaixaDB } from './db';
import { StoreCore } from './repos/core';
import { ProductsRepository } from './repos/products';
import { CustomersRepository } from './repos/customers';
import { CreditRepository, SalesRepository } from './repos/sales';
import { CashRepository, ExpensesRepository } from './repos/money';
import { PayablesRepository, PurchasesRepository, SupplierPaymentsRepository, SuppliersRepository } from './repos/suppliers';
import { InssRepository } from './repos/inss';
import { DeviceRepository, LegalRepository, SettingsRepository } from './repos/settings';
import { SecurityRepository } from './repos/security';
import { AuditLogRepository, IntegrityRepository } from './repos/checks';
import { ReturnsRepository } from './repos/returns';

// The Store's types, constants and helpers (the same names as before the split).
export {
  BACKUP_LOCK_KEY,
  BACKUP_PASSWORD_MIN,
  DEFAULT_STORE_NAME,
  DomainError,
  OWNER_GRANT_MS,
  PHONE_ONLY_KEYS,
  PIN_KEYS,
  SETTINGS_ID,
  STOCK_COUNT_REASON,
  cleanReference,
  parseBackupLock,
  tillPurchasesCents,
} from './repos/shared';
export type { BackupLock, NewPurchase, NewSale, PinCheck, ProductInput } from './repos/shared';
export type { NewReturn } from './repos/returns';

/**
 * Repositories over the local database. Screens only talk to these, so the storage
 * can later be swapped for (or synchronised with) a server without touching the UI.
 * Every write is recorded in the audit log, inside the same transaction.
 */
export class Store {
  readonly db: CaixaDB;
  readonly products: ProductsRepository;
  readonly customers: CustomersRepository;
  readonly sales: SalesRepository;
  readonly credit: CreditRepository;
  readonly returns: ReturnsRepository;
  readonly expenses: ExpensesRepository;
  readonly cash: CashRepository;
  readonly suppliers: SuppliersRepository;
  readonly purchases: PurchasesRepository;
  readonly supplierPayments: SupplierPaymentsRepository;
  readonly payables: PayablesRepository;
  readonly inss: InssRepository;
  readonly settings: SettingsRepository;
  readonly legal: LegalRepository;
  readonly device: DeviceRepository;
  readonly security: SecurityRepository;
  readonly integrity: IntegrityRepository;
  readonly auditLog: AuditLogRepository;

  constructor(db: CaixaDB, now: () => Date = () => new Date()) {
    this.db = db;
    const core = new StoreCore(db, now, () => this);
    this.products = new ProductsRepository(core);
    this.customers = new CustomersRepository(core);
    this.sales = new SalesRepository(core);
    this.credit = new CreditRepository(core);
    this.returns = new ReturnsRepository(core);
    this.expenses = new ExpensesRepository(core);
    this.cash = new CashRepository(core);
    this.suppliers = new SuppliersRepository(core);
    this.purchases = new PurchasesRepository(core);
    this.supplierPayments = new SupplierPaymentsRepository(core);
    this.payables = new PayablesRepository(core);
    this.inss = new InssRepository(core);
    this.settings = new SettingsRepository(core);
    this.legal = new LegalRepository(core);
    this.device = new DeviceRepository(core);
    this.security = new SecurityRepository(core);
    this.integrity = new IntegrityRepository(core);
    this.auditLog = new AuditLogRepository(core);
  }
}
