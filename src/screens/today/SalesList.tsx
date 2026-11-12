import { useState } from 'react';
import type { Sale } from '../../domain/types';
import { t } from '../../i18n/pt-AO';
import { Card } from '../../ui/kit';
import { SaleRow } from './SaleRow';
import { SaleSheet } from './SaleSheet';

/** The sales of the day shown on "Hoje", newest first. */
export function SalesList({ sales }: { sales: Sale[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (sales.length === 0) return null;
  return (
    <Card>
      <h2 className="mb-1 font-bold">
        {t.today.salesList} ({sales.length})
      </h2>
      <ul className="divide-y divide-slate-100">
        {sales.map((s) => (
          <li key={s.id}>
            <SaleRow sale={s} onOpen={() => setOpenId(s.id)} />
          </li>
        ))}
      </ul>
      {openId && <SaleSheet saleId={openId} onClose={() => setOpenId(null)} />}
    </Card>
  );
}
