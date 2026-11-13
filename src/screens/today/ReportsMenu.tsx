import { useState } from 'react';
import { t } from '../../i18n/pt-AO';
import { Sheet } from '../../ui/kit';
import { FinanceSheet } from './FinanceSheet';
import { ReportsSheet } from './ReportsSheet';
import { SalesHistorySheet } from './SalesHistorySheet';

type Open = 'menu' | 'reports' | 'finance' | 'history' | null;

const ICONS = {
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  wallet: 'M3 7h18v12H3zM3 11h18M16 15h2',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM21 21l-4.35-4.35',
};

function Icon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

const big =
  'flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 border-brand-700 bg-white px-4 text-left font-semibold text-brand-800 active:bg-brand-50';

/** «Relatórios»: one button on «Hoje» for the week and month, the shop's accounts and finding sales. */
export function ReportsMenu() {
  const [open, setOpen] = useState<Open>(null);
  return (
    <>
      <button type="button" onClick={() => setOpen('menu')} className={`${big} justify-center`}>
        <Icon d={ICONS.chart} />
        {t.reportsMenu.open}
      </button>
      {open === 'menu' && (
        <Sheet title={t.reportsMenu.title} onClose={() => setOpen(null)}>
          <p className="mb-3 text-sm text-slate-600">{t.reportsMenu.hint}</p>
          <div className="space-y-2">
            <button type="button" className={big} onClick={() => setOpen('reports')}>
              <Icon d={ICONS.chart} />
              {t.reports.open}
            </button>
            <button type="button" className={big} onClick={() => setOpen('finance')}>
              <Icon d={ICONS.wallet} />
              {t.finance.open}
            </button>
            <button type="button" className={big} onClick={() => setOpen('history')}>
              <Icon d={ICONS.search} />
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
