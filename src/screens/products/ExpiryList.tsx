import type { ExpiryLine } from '../../domain/expiry';
import { formatQuantity } from '../../domain/quantity';
import { t } from '../../i18n/pt-AO';
import { formatDateString } from '../../lib/dates';

/** Stock expired or about to expire, first to expire first: product, quantity and when. */
export function ExpiryList({ lines, empty }: { lines: ExpiryLine[]; empty?: string }) {
  if (lines.length === 0) return empty ? <p className="rounded-xl bg-white p-4 text-center text-slate-600">{empty}</p> : null;
  return (
    <ul className="divide-y divide-slate-100 rounded-xl bg-white px-3">
      {lines.map((l) => (
        <li key={`${l.productId}-${l.expiresOn}`} className="flex justify-between gap-3 py-2">
          <span className="min-w-0">
            <span className="block truncate font-semibold">{l.name}</span>
            <span className={`text-sm ${l.daysLeft < 0 ? 'font-bold text-red-700' : 'font-semibold text-amber-800'}`}>
              {t.expiry.expires(formatDateString(l.expiresOn), l.daysLeft)}
            </span>
          </span>
          <span className="font-bold whitespace-nowrap">{formatQuantity(l.quantity, l.soldBy)}</span>
        </li>
      ))}
    </ul>
  );
}
