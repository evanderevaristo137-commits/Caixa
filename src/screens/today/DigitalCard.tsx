import type { DigitalStatus } from '../../domain/digital-watch';
import { t } from '../../i18n/pt-AO';
import { formatKz } from '../../lib/money';
import { Card } from '../../ui/kit';

const pct = (bp: number) => `${Math.round(Math.abs(bp) / 100)}%`;

function totalWords(changeBp: number): string {
  if (Math.abs(changeBp) < 500) return t.digital.totalSame;
  return changeBp < 0 ? t.digital.totalDown(pct(changeBp)) : t.digital.totalUp(pct(changeBp));
}

/**
 * Credit for stock: share of money received through digital payments, against the contract's
 * minimum, with an alarm when digital receipts fall suddenly (the shop may be moving to cash).
 */
export function DigitalCard({ status }: { status: DigitalStatus }) {
  const { week, baseline, minShareBp } = status;
  const lines: string[] = [];
  if (status.belowMinimum && minShareBp !== undefined) lines.push(t.digital.below(pct(week.shareBp), pct(minShareBp)));
  if (status.suddenDrop && baseline) {
    if ((status.digitalChangeBp ?? 0) <= -4000)
      lines.push(t.digital.drop(pct(status.digitalChangeBp ?? 0), totalWords(status.totalChangeBp ?? 0)));
    else lines.push(t.digital.shareDrop(pct(baseline.shareBp), pct(week.shareBp)));
  }

  if (status.alarm) {
    return (
      <Card className="border-2 border-red-300 bg-red-50">
        <h2 className="flex items-center gap-2 font-bold text-red-800">
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 9v4M12 17h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
          {t.digital.alarmTitle}
        </h2>
        <ul className="mt-2 space-y-1 text-red-900">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-slate-700">{t.digital.received(formatKz(week.digitalCents), formatKz(week.totalCents))}</p>
        <p className="mt-2 text-sm font-medium text-slate-800">{minShareBp !== undefined ? t.digital.contractNote : t.digital.checkNote}</p>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="font-bold">{t.digital.title}</h2>
      <p className="mt-1">
        <span className="text-3xl font-extrabold">{pct(week.shareBp)}</span> <span className="text-slate-600">{t.digital.share}</span>
      </p>
      <p className="text-sm text-slate-600">{t.digital.received(formatKz(week.digitalCents), formatKz(week.totalCents))}</p>
      {minShareBp !== undefined && (
        <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-brand-800">
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="m5 12 5 5L20 7" />
          </svg>
          {t.digital.minimum(pct(minShareBp))} · {t.digital.ok}
        </p>
      )}
      {!baseline && <p className="mt-1 text-xs text-slate-600">{t.digital.noHistory}</p>}
    </Card>
  );
}
