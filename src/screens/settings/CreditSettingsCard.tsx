import { useState } from 'react';
import { useApp } from '../../app/context';
import { alertNotificationText } from '../../domain/alerts';
import { creditAlerts, DEFAULT_TERM_DAYS } from '../../domain/credit';
import type { Settings } from '../../domain/types';
import { t } from '../../i18n/pt-AO';
import { alertPermission, enableAlerts, showNotification, type AlertPermission } from '../../lib/notifications';
import { Button, Card } from '../../ui/kit';

const TERMS = [7, 15, 30];

/** Usual payment term for credit sales and the phone notifications about customers' payments. */
export function CreditSettingsCard({ settings }: { settings: Settings }) {
  const { store, showToast } = useApp();
  const [permission, setPermission] = useState<AlertPermission>(alertPermission);
  const term = settings.creditTermDays ?? DEFAULT_TERM_DAYS;

  const setTerm = async (days: number) => {
    await store.settings.save({ creditTermDays: days });
    showToast(t.settings.saved);
  };

  const test = async () => {
    const text = alertNotificationText(creditAlerts(await store.credit.book())) ?? {
      title: 'Pagamentos de clientes',
      body: '1 vence hoje. Toque para ver e lembrar os clientes. (exemplo)',
    };
    await showNotification(text.title, text.body);
  };

  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-bold">{t.alerts.termTitle}</h2>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label={t.alerts.termTitle}>
        {TERMS.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={term === d}
            onClick={() => void setTerm(d)}
            className={`min-h-12 rounded-xl border-2 text-base font-semibold ${term === d ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white'}`}
          >
            {t.sell.terms[d]}
          </button>
        ))}
      </div>
      <p className="text-sm text-slate-600">{t.alerts.termHint}</p>

      <h2 className="pt-2 text-lg font-bold">{t.alerts.title}</h2>
      <p className="text-sm text-slate-600">{t.alerts.hint}</p>
      {permission === 'granted' ? (
        <>
          <p className="rounded-lg bg-brand-50 p-2 text-sm font-semibold text-brand-800">{t.alerts.on}</p>
          <Button variant="secondary" className="w-full" onClick={() => void test()}>
            {t.alerts.test}
          </Button>
          <p className="text-sm text-slate-600">{t.alerts.background}</p>
        </>
      ) : permission === 'denied' ? (
        <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{t.alerts.blocked}</p>
      ) : permission === 'unsupported' ? (
        <p className="rounded-lg bg-slate-100 p-2 text-sm text-slate-700">{t.alerts.unsupported}</p>
      ) : (
        <Button className="w-full" onClick={() => void enableAlerts().then(setPermission)}>
          {t.alerts.enable}
        </Button>
      )}
    </Card>
  );
}
