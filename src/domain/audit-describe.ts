import { creditPaymentLabel, methodLabel } from '../i18n/pt-AO';
import { formatKz } from '../lib/money';
import type {
  AuditEntry,
  CashClose,
  CreditPayment,
  Customer,
  Expense,
  InssContribution,
  Product,
  Purchase,
  Sale,
  SaleReturn,
  Settings,
  StockMovement,
  Supplier,
  SupplierPayment,
} from './types';
import { t } from '../i18n/pt-AO';
import { formatDateString, formatDateTime } from '../lib/dates';
import { monthLong, monthlyCents } from './inss';
import { formatQuantity } from './quantity';

export interface AuditLine {
  text: string;
  /** Things the owner should see: voids, price changes, stock adjustments, payments, restores, owner code. */
  important: boolean;
}

interface Names {
  product: (id: string) => string | undefined;
  customer: (id: string) => string | undefined;
  supplier?: (id: string) => string | undefined;
}

const obj = <T>(v: unknown): Partial<T> => (typeof v === 'object' && v !== null ? (v as Partial<T>) : {});

/** Turns one audit record into a sentence in plain Portuguese (null for internal noise). */
export function describeAudit(e: AuditEntry, names: Names): AuditLine | null {
  switch (e.entity) {
    case 'sale': {
      const s = obj<Sale & { replacedByNumber: number; replacesNumber: number }>(e.after);
      const total = typeof s.totalCents === 'number' ? formatKz(s.totalCents) : '';
      const method = s.method ? methodLabel[s.method] : '';
      if (e.action === 'confirmed') return { text: `Pagamento da venda n.º ${s.number} confirmado: ${total} — ${method}`, important: true };
      if (e.action === 'voided' && s.replacedByNumber)
        return {
          text: `Venda n.º ${s.number}: o pagamento (${method}, ${total}) não entrou — registada de novo como venda n.º ${s.replacedByNumber}`,
          important: true,
        };
      if (e.action === 'voided')
        return { text: `Venda n.º ${s.number} anulada (${total}). Motivo: ${s.voidReason ?? '—'}`, important: true };
      const waits = s.pendingSince ? ' (por confirmar)' : '';
      if (e.action === 'created' && s.replacesNumber)
        return { text: `Venda n.º ${s.number}: ${total} — ${method}${waits}, em vez da venda n.º ${s.replacesNumber}`, important: true };
      if (e.action === 'created' && s.creditLimitOverride) {
        const o = s.creditLimitOverride;
        return {
          text: `Venda n.º ${s.number} a crédito acima do limite: ${total} (já devia ${formatKz(o.balanceBeforeCents)}, limite ${formatKz(o.limitCents)})`,
          important: true,
        };
      }
      if (e.action === 'created') return { text: `Venda n.º ${s.number}: ${total} — ${method}${waits}`, important: false };
      return null;
    }
    case 'product': {
      const before = obj<Product>(e.before);
      const after = obj<Product>(e.after);
      if (e.action === 'created') return { text: `Produto criado: ${after.name} (${formatKz(after.priceCents ?? 0)})`, important: false };
      if (e.action === 'archived') return { text: `Produto arquivado: ${after.name}`, important: true };
      if (e.action === 'updated') {
        const changes: string[] = [];
        if (before.priceCents !== after.priceCents)
          changes.push(`preço ${formatKz(before.priceCents ?? 0)} → ${formatKz(after.priceCents ?? 0)}`);
        if (before.costCents !== after.costCents) {
          const cost = (c: number | undefined) => (c === undefined ? '—' : formatKz(c));
          changes.push(`preço de custo ${cost(before.costCents)} → ${cost(after.costCents)}`);
        }
        if (before.name !== after.name) changes.push(`nome «${before.name}» → «${after.name}»`);
        if (before.barcode !== after.barcode) changes.push('código de barras');
        if (before.minStock !== after.minStock) changes.push(`stock mínimo ${before.minStock} → ${after.minStock}`);
        // The log keeps only the fields that changed: the category may be missing when only the subcategory changed.
        const place = (p: Partial<Product>) => (p.category ? (p.subcategory ? `${p.category} › ${p.subcategory}` : p.category) : '—');
        if (before.category !== after.category) changes.push(`categoria ${place(before)} → ${place(after)}`);
        else if (before.subcategory !== after.subcategory)
          changes.push(`subcategoria ${before.subcategory ?? '—'} → ${after.subcategory ?? '—'}`);
        if (!!before.tracksExpiry !== !!after.tracksExpiry)
          changes.push(after.tracksExpiry ? 'passou a controlar validades' : 'deixou de controlar validades');
        if (changes.length === 0) return null;
        return { text: `${after.name}: ${changes.join(', ')}`, important: before.priceCents !== after.priceCents };
      }
      return null;
    }
    case 'stock_movement': {
      const m = obj<StockMovement>(e.after);
      const name = (m.productId && names.product(m.productId)) ?? 'produto';
      if (m.type === 'entry') return { text: `Entrada de stock: ${name} +${m.delta}`, important: false };
      if (m.type === 'adjustment') {
        const sign = (m.delta ?? 0) > 0 ? '+' : '';
        return { text: `Acerto de stock: ${name} ${sign}${m.delta}. Motivo: ${m.reason ?? '—'}`, important: true };
      }
      return null; // sale/void movements are already described by the sale itself
    }
    case 'batch': {
      const b = obj<{ name: string; quantity: number; soldBy: 'weight'; expiresOn: string }>(e.after);
      const qty = formatQuantity(b.quantity ?? 0, b.soldBy);
      const what = `${b.name ?? 'produto'}: ${qty}${b.expiresOn ? `, validade ${formatDateString(b.expiresOn)}` : ''}`;
      if (e.action === 'voided') return { text: `Validade retirada — ${what}`, important: false };
      return { text: `Validade indicada — ${what}`, important: false };
    }
    case 'return': {
      const r = obj<SaleReturn>(e.after);
      const how = r.refund ? t.returns.refundLog[r.refund] : '';
      return {
        text: `Devolução n.º ${r.number} (venda n.º ${r.saleNumber}): ${formatKz(r.totalCents ?? 0)} — ${how}${r.restock ? ', artigos de volta ao stock' : ''}. Motivo: ${r.reason ?? '—'}`,
        important: true,
      };
    }
    case 'credit_payment': {
      const p = obj<CreditPayment>(e.after);
      const who = (p.customerId && names.customer(p.customerId)) ?? 'cliente';
      return {
        text: `Pagamento recebido de ${who}: ${formatKz(p.amountCents ?? 0)} — ${p.method ? creditPaymentLabel(p.method) : ''}`,
        important: true,
      };
    }
    case 'customer': {
      const before = obj<Customer>(e.before);
      const after = obj<Customer>(e.after);
      if (e.action === 'created') return { text: `Cliente criado: ${after.name}`, important: false };
      if (before.name !== after.name) return { text: `Cliente: nome «${before.name}» → «${after.name}»`, important: false };
      if (before.phone !== after.phone) return { text: `${after.name}: telefone alterado`, important: false };
      return null; // e.g. "last reminder" bookkeeping
    }
    case 'settings': {
      if (e.entityId === 'terms') {
        return {
          text: `Termos de uso e privacidade aceites (versão ${obj<{ version: string }>(e.after).version ?? '—'})`,
          important: true,
        };
      }
      if (e.entityId === 'owner_pin') {
        const removed = obj<{ pin: string }>(e.after).pin === 'removed';
        return { text: removed ? 'Código do dono removido' : 'Código do dono definido', important: true };
      }
      if (e.entityId === 'backup_password') {
        const what = obj<{ password: 'set' | 'changed' | 'removed' | 'adopted' }>(e.after).password ?? 'set';
        return { text: t.backups.passwordLog[what], important: true };
      }
      const before = obj<Settings>(e.before);
      const after = obj<Settings>(e.after);
      if (before.digitalMinShareBp !== after.digitalMinShareBp) {
        return {
          text: after.digitalMinShareBp
            ? `Mínimo de pagamentos digitais (crédito para stock): ${Math.round(after.digitalMinShareBp / 100)}%`
            : 'Mínimo de pagamentos digitais retirado',
          important: true,
        };
      }
      if (before.costMethod !== after.costMethod) {
        return {
          text: after.costMethod
            ? 'Preço de custo: passa a ser o custo médio das compras'
            : 'Preço de custo: passa a ser o da última compra',
          important: true,
        };
      }
      if (before.cashFloatCents !== after.cashFloatCents) {
        return {
          text: after.cashFloatCents ? `Fundo de caixa: ${formatKz(after.cashFloatCents)}` : 'Sem fundo de caixa',
          important: false,
        };
      }
      if (before.creditTermDays !== after.creditTermDays && after.creditTermDays) {
        return { text: `Prazo habitual para clientes: ${after.creditTermDays} dias`, important: false };
      }
      if (JSON.stringify(before.inss) !== JSON.stringify(after.inss)) {
        if (!after.inss) return { text: 'Reforma (INSS): deixou de acompanhar', important: true };
        const wages = after.inss.wages === 1 ? '1 salário mínimo' : `${after.inss.wages} salários mínimos`;
        const plan = `${wages}, ${formatKz(monthlyCents(after.inss))} por mês`;
        return {
          text: before.inss ? `Reforma (INSS): plano alterado — ${plan}` : `Reforma (INSS): começou a acompanhar — ${plan}`,
          important: true,
        };
      }
      return { text: 'Dados da loja alterados', important: false };
    }
    case 'inss_contribution': {
      const c = obj<InssContribution>(e.after);
      const what = `${c.month ? monthLong(c.month) : '—'}, ${formatKz(c.amountCents ?? 0)}`;
      if (e.action === 'voided') return { text: `Pagamento ao INSS anulado: ${what}. Motivo: ${c.voidReason ?? '—'}`, important: true };
      return { text: `Pagamento ao INSS registado: ${what}${c.receipt ? ` (comprovativo ${c.receipt})` : ''}`, important: true };
    }
    case 'expense': {
      const x = obj<Expense>(e.after);
      const what = x.category ? t.expenses.categories[x.category] : 'Saída';
      const amount = formatKz(x.amountCents ?? 0);
      if (e.action === 'voided') return { text: `Saída anulada: ${what} — ${amount}. Motivo: ${x.voidReason ?? '—'}`, important: true };
      const where = x.fromCash ? 'da caixa' : 'paga de outra forma';
      return { text: `Saída de dinheiro: ${what} — ${amount} (${where})${x.note ? ` · ${x.note}` : ''}`, important: true };
    }
    case 'cash_close': {
      const c = obj<CashClose>(e.after);
      const diff = c.differenceCents ?? 0;
      const result = diff === 0 ? 'bate certo' : diff > 0 ? `sobram ${formatKz(diff)}` : `faltam ${formatKz(-diff)}`;
      return {
        text: `Dia ${c.day ? formatDateString(c.day) : ''} fechado: contou ${formatKz(c.countedCents ?? 0)}, devia ter ${formatKz(c.expectedCents ?? 0)} — ${result}`,
        important: true,
      };
    }
    case 'purchase': {
      const p = obj<Purchase>(e.after);
      const who = p.supplierId ? (names.supplier?.(p.supplierId) ?? 'fornecedor') : 'sem fornecedor';
      const total = formatKz(p.totalCents ?? 0);
      if (e.action === 'voided')
        return { text: `Compra n.º ${p.number} anulada (${total}). Motivo: ${p.voidReason ?? '—'}`, important: true };
      const how = p.payment ? t.purchases.payments[p.payment] : '';
      return { text: `Compra n.º ${p.number}: ${total} — ${who} (${how})`, important: true };
    }
    case 'supplier': {
      const before = obj<Supplier>(e.before);
      const after = obj<Supplier>(e.after);
      if (e.action === 'created') return { text: `Fornecedor criado: ${after.name}`, important: false };
      if (before.name !== after.name) return { text: `Fornecedor: nome «${before.name}» → «${after.name}»`, important: false };
      if (before.phone !== after.phone) return { text: `${after.name}: telefone alterado`, important: false };
      return null;
    }
    case 'supplier_payment': {
      const p = obj<SupplierPayment>(e.after);
      const who = (p.supplierId && names.supplier?.(p.supplierId)) ?? 'fornecedor';
      return {
        text: `Pagamento ao fornecedor ${who}: ${formatKz(p.amountCents ?? 0)} (${p.fromCash ? 'da caixa' : 'pago de outra forma'})`,
        important: true,
      };
    }
    case 'staff': {
      const s = obj<{ name: string; role: string; canCredit: boolean; pin: string }>(e.after);
      const before = obj<{ name: string; role: string; canCredit: boolean }>(e.before);
      const who = s.name === 'owner' ? t.team.owner : (s.name ?? '');
      if (e.action === 'signed_in') return { text: `${who} começou a usar a app`, important: false };
      if (e.action === 'archived') return { text: `${who} deixou de trabalhar na loja`, important: true };
      if (e.action === 'created') {
        const credit = s.role === 'seller' && s.canCredit ? ', pode vender a crédito' : '';
        return { text: `Funcionário juntado: ${who} (${(s.role && t.team.roles[s.role]) ?? ''}${credit})`, important: true };
      }
      if (e.action === 'updated' && s.pin) return { text: `${who}: código novo`, important: true };
      if (e.action === 'updated') {
        const changes = [
          before.name !== undefined && `antes ${before.name}`,
          s.role !== undefined && `agora ${t.team.roles[s.role] ?? String(s.role)}`,
          s.canCredit !== undefined && `vender a crédito: ${s.canCredit ? 'sim' : 'não'}`,
        ].filter(Boolean);
        return { text: `Funcionário ${who} alterado: ${changes.join(', ')}`, important: true };
      }
      return null;
    }
    case 'data':
      if (e.action === 'counted' && e.entityId === 'stock_count') {
        const r = obj<{ counted: number; adjusted: number }>(e.after);
        return { text: `Contagem de stock: ${r.counted ?? 0} produtos contados, ${r.adjusted ?? 0} acertados`, important: true };
      }
      if (e.action === 'imported' && e.entityId === 'products_import') {
        const r = obj<{ created: number; updated: number }>(e.after);
        return { text: `Produtos importados do Excel: ${r.created ?? 0} novos, ${r.updated ?? 0} actualizados`, important: true };
      }
      if (e.action === 'imported') {
        const r = obj<{ exportedAt: string; source: 'file' | 'safety' }>(e.after);
        if (r.source === 'safety') return { text: t.backups.undoneLog, important: true };
        return { text: t.backups.restoredLog(r.exportedAt ? formatDateTime(r.exportedAt) : null), important: true };
      }
      if (e.action === 'reset') return { text: 'Dados de demonstração repostos', important: false };
      return null;
    default:
      return null;
  }
}
