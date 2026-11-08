import { useState } from 'react';
import { articleCount } from '../../domain/quantity';
import type { Sale } from '../../domain/types';
import { methodLabel, t } from '../../i18n/pt-AO';
import { Card, Money } from '../../ui/kit';
import { SaleSheet } from './SaleSheet';

const time = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function SalesList({ sales }: { sales: Sale[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (sales.length === 0) return null;
  return (
    <Card>
      <h2 className="mb-1 font-bold">
        {t.today.salesList} ({sales.length})
      </h2>
      <ul className="divide-y divide-slate-100">
        {sales.map((s) => {
          const units = articleCount(s.items);
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setOpenId(s.id)}
                className="flex min-h-14 w-full items-center gap-3 py-2 text-left active:bg-slate-50"
              >
                <span className="w-12 text-sm font-semibold text-slate-600 tabular-nums">{time(s.createdAt)}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate font-semibold ${s.voidedAt ? 'text-slate-400 line-through' : ''}`}>
                    {s.items.map((i) => i.name).join(', ')}
                  </span>
                  <span className="text-sm text-slate-600">
                    {methodLabel[s.method]} · {t.sell.cartItems(units)}
                    {s.voidedAt && <span className="ml-1 rounded bg-red-100 px-1.5 font-semibold text-red-800">{t.today.voidedTag}</span>}
                  </span>
                </span>
                <Money cents={s.totalCents} className={`font-bold ${s.voidedAt ? 'text-slate-400 line-through' : ''}`} />
              </button>
            </li>
          );
        })}
      </ul>
      {openId && <SaleSheet saleId={openId} onClose={() => setOpenId(null)} />}
    </Card>
  );
}
