import { useState } from 'react';
import { useApp } from '../../app/context';
import { formatBpAsPercent, parsePercentToBp } from '../../domain/tax';
import type { Settings } from '../../domain/types';
import { t } from '../../i18n/pt-AO';
import { Button, Card, Field } from '../../ui/kit';
import { usePinGuard } from '../../ui/pin';

/** Credit for stock: the contract's minimum share of digital receipts (owner code to change it). */
export function DigitalMinCard({ settings }: { settings: Settings }) {
  const { store, showToast } = useApp();
  const guard = usePinGuard();
  const [value, setValue] = useState(settings.digitalMinShareBp ? formatBpAsPercent(settings.digitalMinShareBp) : '');
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const bp = parsePercentToBp(value);
    if (bp === null) return setError(t.digital.settingInvalid);
    await guard(async () => {
      await store.settings.save({ digitalMinShareBp: bp ?? 0 });
      setError(null);
      showToast(t.settings.saved);
    });
  };
  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-bold">{t.digital.settingTitle}</h2>
      <p className="text-sm text-slate-600">{t.digital.settingHint}</p>
      <Field label={t.digital.settingLabel} value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" error={error} />
      <Button className="w-full" onClick={() => void save()}>
        {t.common.save}
      </Button>
    </Card>
  );
}
