import { articleCount } from '../../domain/quantity';
import type { Sale } from '../../domain/types';
import { methodLabel, t } from '../../i18n/pt-AO';
import { Money } from '../../ui/kit';

const pad = (n: number) => String(n).padStart(2, '0');

/** "14:05", and the day ("12/11") when the list covers more than one day. */
export function saleTime(iso: string): { day: string; time: string } {
  const d = new Date(iso);
  return { day: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/** One sale in a list: when, what, how it was paid, and the total (struck through when voided). */
export function SaleRow({
  sale,
  withDate = false,
  customerName,
  onOpen,
}: {
  sale: Sale;
  withDate?: boolean;
  customerName?: string;
  onOpen: () => void;
}) {
  const voided = !!sale.voidedAt;
  const when = saleTime(sale.createdAt);
  return (
    <button type="button" onClick={onOpen} className="flex min-h-14 w-full items-center gap-3 py-2 text-left active:bg-slate-50">
      <span className="w-12 text-sm font-semibold text-slate-600 tabular-nums">
        {withDate && <span className="block">{when.day}</span>}
        <span className="block">{when.time}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate font-semibold ${voided ? 'text-slate-400 line-through' : ''}`}>
          {sale.items.map((i) => i.name).join(', ')}
        </span>
        <span className="text-sm text-slate-600">
          {t.history.number(sale.number)} · {methodLabel[sale.method]}
          {customerName ? ` (${customerName})` : ''} · {t.sell.cartItems(articleCount(sale.items))}
          {voided && <span className="ml-1 rounded bg-red-100 px-1.5 font-semibold text-red-800">{t.today.voidedTag}</span>}
        </span>
      </span>
      <Money cents={sale.totalCents} className={`font-bold ${voided ? 'text-slate-400 line-through' : ''}`} />
    </button>
  );
}
