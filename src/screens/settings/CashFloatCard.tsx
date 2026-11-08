import { useState } from 'react';
import { useApp } from '../../app/context';
import type { Settings } from '../../domain/types';
import { t } from '../../i18n/pt-AO';
import { formatKz, parseKz } from '../../lib/money';
import { Button, Card, Field } from '../../ui/kit';

/** The usual opening float: the change the till starts each day with (optional). */
export function CashFloatCard({ settings }: { settings: Settings }) {
  const { store, showToast } = useApp();
  const [value, setValue] = useState(settings.cashFloatCents ? formatKz(settings.cashFloatCents).replace(' Kz', '') : '');
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const cents = value.trim() === '' ? 0 : parseKz(value);
    if (cents === null) return setError(t.cash.floatInvalid);
    await store.settings.save({ cashFloatCents: cents });
    setError(null);
    showToast(t.settings.saved);
  };
  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-bold">{t.cash.floatSettingTitle}</h2>
      <p className="text-sm text-slate-600">{t.cash.floatSettingHint}</p>
      <Field label={t.cash.floatSettingLabel} value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" error={error} />
      <Button className="w-full" onClick={() => void save()}>
        {t.common.save}
      </Button>
    </Card>
  );
}
