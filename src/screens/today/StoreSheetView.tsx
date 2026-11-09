import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { creditAlerts, totalOutstanding } from '../../domain/credit';
import { formatMargin } from '../../domain/profit';
import { formatChange } from '../../domain/reports';
import { buildStoreSheet, DEMO_NOTE, SHEET_NOTE, storeSheetText, type StoreSheet } from '../../domain/store-sheet';
import { digitalStatus } from '../../domain/digital-watch';
import { whatsAppLink } from '../../domain/whatsapp';
import { t } from '../../i18n/pt-AO';
import { formatDate } from '../../lib/dates';
import { formatKz } from '../../lib/money';
import { registerBackHandler } from '../../ui/back';
import { Button, LinkButton, Skeleton } from '../../ui/kit';

const pct = (bp: number) => `${Math.round(bp / 100)}%`;

/** "Ficha da loja": up to 12 months on one page, to print (or save as PDF) or send by WhatsApp. */
export function StoreSheetView({ onClose }: { onClose: () => void }) {
  const { store, mode } = useApp();
  const sheet = useLiveQuery(async () => {
    const now = new Date();
    const windowStart = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString();
    const [sales, payments, settings, book] = await Promise.all([
      store.sales.since(windowStart),
      store.credit.paymentsBetween(windowStart, new Date(now.getTime() + 60_000).toISOString()),
      store.settings.get(),
      store.credit.book(now),
    ]);
    const digital = digitalStatus(sales, payments, now, settings.digitalMinShareBp);
    return buildStoreSheet({
      storeName: settings.storeName,
      nif: settings.nif,
      demo: mode === 'demo',
      sales,
      payments,
      owedCents: totalOutstanding(book),
      overdueCustomers: creditAlerts(book).overdue.length,
      now,
      digital: { shareBp: digital.week.shareBp, minShareBp: digital.minShareBp, alarm: digital.alarm },
    });
  }, [store, mode]);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => registerBackHandler(() => close.current()), []);

  return createPortal(
    <div
      className="print-area fixed inset-0 z-50 overflow-y-auto bg-white p-4 text-black"
      role="dialog"
      aria-modal="true"
      aria-label={t.sheet.title}
    >
      <div className="mx-auto max-w-lg">
        <div className="mb-4 grid grid-cols-2 gap-2 print:hidden">
          <Button variant="secondary" onClick={onClose}>
            {t.common.close}
          </Button>
          <Button onClick={() => window.print()} disabled={!sheet}>
            {t.sheet.print}
          </Button>
          {sheet && (
            <LinkButton href={whatsAppLink(storeSheetText(sheet))} className="col-span-2">
              {t.sheet.share}
            </LinkButton>
          )}
        </div>
        {!sheet ? <Skeleton rows={4} /> : <SheetBody sheet={sheet} />}
      </div>
    </div>,
    document.body,
  );
}

function SheetBody({ sheet: d }: { sheet: StoreSheet }) {
  return (
    <article>
      {d.demo && (
        <p className="mb-3 rounded-lg border-2 border-amber-500 bg-amber-50 p-2 text-center font-bold text-amber-900">{DEMO_NOTE}</p>
      )}
      <header className="border-b-2 border-slate-900 pb-2">
        <p className="text-sm font-semibold tracking-wide text-slate-600 uppercase">{t.sheet.title}</p>
        <h2 className="text-2xl font-extrabold">{d.storeName}</h2>
        {d.nif && <p className="text-slate-700">NIF: {d.nif}</p>}
        {d.firstSaleAt && (
          <p className="text-sm text-slate-700">
            {t.sheet.period(formatDate(d.firstSaleAt), formatDate(d.generatedAt), d.periodDays, d.activeDays)}
          </p>
        )}
      </header>
      {!d.firstSaleAt ? (
        <p className="py-6 text-center text-slate-600">{t.sheet.empty}</p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
            <Figure label={t.sheet.total} value={formatKz(d.totalSalesCents)} note={t.sheet.count(d.count)} />
            <Figure label={t.sheet.daily} value={formatKz(d.avgDailyCents)} />
            <Figure label={t.sheet.electronic} value={pct(d.electronicShareBp)} />
            {d.digital && (
              <Figure
                label={t.sheet.digitalWeek}
                value={pct(d.digital.shareBp)}
                note={[
                  d.digital.minShareBp !== undefined ? t.sheet.digitalMin(pct(d.digital.minShareBp)) : '',
                  d.digital.alarm ? t.sheet.digitalAlarm : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              />
            )}
            {d.profit && (
              <Figure
                label={t.sheet.profit}
                value={formatKz(d.profit.profitCents)}
                note={`${t.sheet.marginNote(formatMargin(d.profit.marginBp))}${d.profit.partial ? ' *' : ''}`}
              />
            )}
            {d.growthBp !== undefined && <Figure label={t.sheet.growth} value={formatChange(d.growthBp)} />}
            {(d.creditSoldCents > 0 || d.creditPaidCents > 0) && (
              <>
                <Figure label={t.sheet.creditSold} value={formatKz(d.creditSoldCents)} />
                <Figure label={t.sheet.creditPaid} value={formatKz(d.creditPaidCents)} />
              </>
            )}
            <Figure
              label={t.sheet.owed}
              value={formatKz(d.owedCents)}
              note={d.overdueCustomers ? t.sheet.overdue(d.overdueCustomers) : undefined}
            />
          </dl>
          <h3 className="mt-4 mb-1 font-bold">{t.sheet.months}</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-slate-600">
                <th className="py-1 font-semibold">{t.sheet.month}</th>
                <th className="py-1 text-right font-semibold">{t.sheet.sales}</th>
                <th className="py-1 text-right font-semibold">{t.sheet.salesCount}</th>
                <th className="py-1 text-right font-semibold">{t.sheet.electronicShort}</th>
                <th className="py-1 text-right font-semibold">{t.sheet.profitShort}</th>
              </tr>
            </thead>
            <tbody>
              {d.months.map((m) => (
                <tr key={m.label} className="border-b border-slate-100">
                  <td className="py-1">{m.label}</td>
                  <td className="py-1 text-right font-semibold tabular-nums">{formatKz(m.salesCents)}</td>
                  <td className="py-1 text-right tabular-nums">{m.count}</td>
                  <td className="py-1 text-right tabular-nums">{m.salesCents > 0 ? pct(m.electronicShareBp) : '—'}</td>
                  <td className="py-1 text-right tabular-nums">{m.profitCents === undefined ? '—' : formatKz(m.profitCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {d.profit?.partial && <p className="mt-1 text-xs text-slate-600">* só dos produtos com preço de custo</p>}
        </>
      )}
      <footer className="mt-4 border-t border-slate-300 pt-2 text-xs text-slate-600">
        <p>{SHEET_NOTE}</p>
        <p>{t.sheet.generated(formatDate(d.generatedAt))}</p>
      </footer>
    </article>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-slate-600">{label}</dt>
      <dd className="text-lg font-extrabold">{value}</dd>
      {note && <dd className="text-xs text-slate-600">{note}</dd>}
    </div>
  );
}
