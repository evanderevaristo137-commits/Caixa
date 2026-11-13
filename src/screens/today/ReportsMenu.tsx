import { useState } from 'react';
import { t } from '../../i18n/pt-AO';
import { Sheet } from '../../ui/kit';
import { ICON, LineIcon } from '../../ui/icons';
import { FinanceSheet } from './FinanceSheet';
import { ReportsSheet } from './ReportsSheet';
import { SalesHistorySheet } from './SalesHistorySheet';

type Open = 'menu' | 'reports' | 'finance' | 'history' | null;

const big =
  'flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 border-brand-700 bg-white px-4 text-left font-semibold text-brand-800 active:bg-brand-50';

/** «Relatórios»: one button on «Hoje» for the week and month, the shop's accounts and finding sales. */
export function ReportsMenu() {
  const [open, setOpen] = useState<Open>(null);
  return (
    <>
      <button type="button" onClick={() => setOpen('menu')} className={`${big} justify-center`}>
        <LineIcon d={ICON.chart} />
        {t.reportsMenu.open}
      </button>
      {open === 'menu' && (
        <Sheet title={t.reportsMenu.title} onClose={() => setOpen(null)}>
          <p className="mb-3 text-sm text-slate-600">{t.reportsMenu.hint}</p>
          <div className="space-y-2">
            <button type="button" className={big} onClick={() => setOpen('reports')}>
              <LineIcon d={ICON.chart} />
              {t.reports.open}
            </button>
            <button type="button" className={big} onClick={() => setOpen('finance')}>
              <LineIcon d={ICON.wallet} />
              {t.finance.open}
            </button>
            <button type="button" className={big} onClick={() => setOpen('history')}>
              <LineIcon d={ICON.search} />
              {t.history.open}
            </button>
          </div>
        </Sheet>
      )}
      {open === 'reports' && <ReportsSheet onClose={() => setOpen(null)} />}
      {open === 'finance' && <FinanceSheet onClose={() => setOpen(null)} />}
      {open === 'history' && <SalesHistorySheet onClose={() => setOpen(null)} />}
    </>
  );
}
