import { useState } from 'react';
import type { Sale } from '../../domain/types';
import { t } from '../../i18n/pt-AO';
import { Card } from '../../ui/kit';
import { SaleRow } from './SaleRow';
import { SaleSheet } from './SaleSheet';
import { ShowMore, usePaged } from '../../ui/paged';

/** Sales of the day drawn at once (a busy day has a hundred); «Ver mais» draws the next ones. */
const DAY_PAGE = 30;

/** The sales of the day shown on "Hoje", newest first (or, without any, that there are none yet). */
export function SalesList({ sales, isToday }: { sales: Sale[]; isToday: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const paged = usePaged(sales, DAY_PAGE);
  if (sales.length === 0) {
    return (
      <Card>
        <h2 className="mb-1 font-bold">{t.today.salesList}</h2>
        <p className="text-slate-600">{isToday ? t.today.noSales : t.today.noSalesDay}</p>
      </Card>
    );
  }
  return (
    <Card>
      <h2 className="mb-1 font-bold">
        {t.today.salesList} ({sales.length})
      </h2>
      <ul className="divide-y divide-slate-100">
        {paged.visible.map((s) => (
          <li key={s.id}>
            <SaleRow sale={s} onOpen={() => setOpenId(s.id)} />
          </li>
        ))}
      </ul>
      <ShowMore rest={paged.rest} page={DAY_PAGE} onClick={paged.more} className="mt-2" />
      {openId && <SaleSheet saleId={openId} onClose={() => setOpenId(null)} />}
    </Card>
  );
}
