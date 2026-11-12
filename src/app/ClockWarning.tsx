import { useEffect, useState } from 'react';
import { realShopStore } from './context';
import { clockWentBack } from '../domain/clock';
import { t } from '../i18n/pt-AO';
import { formatDateTime } from '../lib/dates';

/**
 * Warns when the phone's clock is earlier than the last thing the shop recorded: sales would land
 * on the wrong day. Checked when the app opens and each time it comes back to the screen.
 * Selling is never blocked (a sale must never be lost): the shop is only told to fix the clock.
 */
export function ClockWarning() {
  const [lastAt, setLastAt] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const check = () =>
      realShopStore()
        .db.audit.orderBy('createdAt')
        .last()
        .then(
          (last) => {
            if (!cancelled) setLastAt(last && clockWentBack(last.createdAt, new Date()) ? last.createdAt : null);
          },
          () => undefined,
        );
    void check();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  if (!lastAt) return null;
  return (
    <div role="alert" className="bg-red-700 px-4 py-2 text-center text-sm font-semibold text-white">
      {t.clock.wrong(formatDateTime(new Date().toISOString()), formatDateTime(lastAt))}
    </div>
  );
}
