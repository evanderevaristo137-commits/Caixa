import { methodLabel } from '../i18n/pt-AO';
import { formatKz } from '../lib/money';
import type {
  AuditEntry,
  CashClose,
  CreditPayment,
  Customer,
  Expense,
  Product,
  Purchase,
  Sale,
  Settings,
  StockMovement,
  Supplier,
  SupplierPayment,
} from './types';
import { t } from '../i18n/pt-AO';
import { formatDateString } from '../lib/dates';

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
      const s = obj<Sale>(e.after);
      const total = typeof s.totalCents === 'number' ? formatKz(s.totalCents) : '';
      if (e.action === 'voided')
        return { text: `Venda n.º ${s.number} anulada (${total}). Motivo: ${s.voidReason ?? '—'}`, important: true };
      if (e.action === 'created' && s.creditLimitOverride) {
        const o = s.creditLimitOverride;
        return {
          text: `Venda n.º ${s.number} a crédito acima do limite: ${total} (já devia ${formatKz(o.balanceBeforeCents)}, limite ${formatKz(o.limitCents)})`,
          important: true,
        };
      }
      if (e.action === 'created')
        return { text: `Venda n.º ${s.number}: ${total} — ${s.method ? methodLabel[s.method] : ''}`, important: false };
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
    case 'credit_payment': {
      const p = obj<CreditPayment>(e.after);
      const who = (p.customerId && names.customer(p.customerId)) ?? 'cliente';
      return {
        text: `Pagamento recebido de ${who}: ${formatKz(p.amountCents ?? 0)} — ${p.method ? methodLabel[p.method] : ''}`,
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
      if (e.entityId === 'owner_pin') {
        const removed = obj<{ pin: string }>(e.after).pin === 'removed';
        return { text: removed ? 'Código do dono removido' : 'Código do dono definido', important: true };
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
      if (before.cashFloatCents !== after.cashFloatCents) {
        return {
          text: after.cashFloatCents ? `Fundo de caixa: ${formatKz(after.cashFloatCents)}` : 'Sem fundo de caixa',
          important: false,
        };
      }
      if (before.creditTermDays !== after.creditTermDays && after.creditTermDays) {
        return { text: `Prazo habitual para clientes: ${after.creditTermDays} dias`, important: false };
      }
      return { text: 'Dados da loja alterados', important: false };
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
    case 'data':
      if (e.action === 'imported') return { text: 'Cópia de segurança recuperada (todos os dados substituídos)', important: true };
      if (e.action === 'reset') return { text: 'Dados de demonstração repostos', important: false };
      return null;
    default:
      return null;
  }
}
