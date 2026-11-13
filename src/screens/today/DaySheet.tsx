import type { SoldReceived } from '../../domain/finance';
import type { DayView } from '../../domain/today';
import type { Sale } from '../../domain/types';
import { PAYMENT_METHODS, type PaymentMethod } from '../../domain/types';
import { methodLabel, t } from '../../i18n/pt-AO';
import { formatKz } from '../../lib/money';
import { Card, LinkButton, Money, Sheet } from '../../ui/kit';
import { DayCard } from './DayCard';
import { salesByPerson } from '../../domain/staff';
import { useTeam } from '../../app/team';

/**
 * The detail behind «Vendas de hoje» and «Dinheiro recebido»: sold and received, the comparison,
 * voided sales and returns, how the customers paid, and the day summary to send by WhatsApp.
 */
export function DaySheet({
  title,
  view,
  money,
  returns,
  pendingByMethod,
  summaryLink,
  isToday,
  sales,
  onClose,
}: {
  title: string;
  view: DayView;
  money: SoldReceived;
  returns: { count: number; totalCents: number };
  pendingByMethod: Map<PaymentMethod, number>;
  summaryLink: string;
  isToday: boolean;
  /** The day's sales, to add them up by person (with employees). */
  sales: Sale[];
  onClose: () => void;
}) {
  const { day } = view;
  const max = Math.max(1, ...PAYMENT_METHODS.map((m) => day.byMethod[m]));
  const team = useTeam();
  const byPerson = salesByPerson(sales);
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="space-y-3">
        <DayCard view={view} money={money} returns={returns} />
        <Card>
          <h2 className="mb-2 font-bold">{t.today.byMethod}</h2>
          {day.count === 0 ? (
            <p className="text-slate-600">{isToday ? t.today.noSales : t.today.noSalesDay}</p>
          ) : (
            <ul className="space-y-2">
              {PAYMENT_METHODS.filter((m) => day.byMethod[m] > 0).map((m) => (
                <li key={m}>
                  <div className="flex justify-between text-base">
                    <span>{methodLabel[m]}</span>
                    <Money cents={day.byMethod[m]} className="font-semibold" />
                  </div>
                  {!!pendingByMethod.get(m) && (
                    <p className="text-right text-sm font-semibold text-amber-800">
                      {t.pending.byMethod(formatKz(pendingByMethod.get(m)!))}
                    </p>
                  )}
                  <div className="mt-1 h-2 rounded-full bg-slate-100">
                    <div
                      className={`h-2 rounded-full ${m === 'credit' ? 'bg-amber-500' : 'bg-brand-600'}`}
                      style={{ width: `${(day.byMethod[m] / max) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {byPerson.length > 0 && (
          <Card>
            <h2 className="mb-2 font-bold">{t.team.byPerson}</h2>
            <ul className="space-y-1">
              {byPerson.map((r) => (
                <li key={r.by} className="flex justify-between gap-2">
                  <span>
                    {team.nameOf(r.by) ?? '—'} <span className="text-sm text-slate-600">· {t.today.sales(r.count)}</span>
                  </span>
                  <Money cents={r.totalCents} className="font-semibold" />
                </li>
              ))}
            </ul>
          </Card>
        )}
        {(day.count > 0 || day.voidedCount > 0 || returns.count > 0) && <LinkButton href={summaryLink}>{t.today.sendSummary}</LinkButton>}
      </div>
    </Sheet>
  );
}
