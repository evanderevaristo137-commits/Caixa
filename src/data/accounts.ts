import { creditAccounts } from '../domain/credit';
import type { CaixaDB } from './db';

/**
 * Builds every customer's saved credit account again from the facts (credit sales and payments).
 * For when many facts change at once (a restored backup, a new demo) and for «Verificar os dados».
 * Inside a transaction, it must include sales, creditPayments and accounts.
 */
export async function rebuildAccounts(db: CaixaDB): Promise<number> {
  const [sales, payments] = await Promise.all([db.sales.where('method').equals('credit').toArray(), db.creditPayments.toArray()]);
  const accounts = creditAccounts(sales, payments);
  await db.accounts.clear();
  await db.accounts.bulkPut(accounts);
  return accounts.length;
}
