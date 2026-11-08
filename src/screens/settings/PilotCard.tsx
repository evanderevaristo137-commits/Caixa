import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { buildPilotSummary } from '../../app/pilot-summary';
import { whatsAppLink } from '../../domain/whatsapp';
import type { Settings } from '../../domain/types';
import { t } from '../../i18n/pt-AO';
import { Button, Card, Field, LinkButton } from '../../ui/kit';

/** Pilot: the shop sends its numbers (never customers' names or phones) to whoever runs the pilot. */
export function PilotCard({ settings }: { settings: Settings }) {
  const { store, mode, showToast } = useApp();
  // The phone's id is created once, outside the (read-only) live query below.
  useEffect(() => {
    void store.device.id();
  }, [store]);
  const text = useLiveQuery(() => buildPilotSummary(store, mode), [store, mode]);
  const [phone, setPhone] = useState(settings.pilotPhone ?? '');
  const changed = phone.trim() !== (settings.pilotPhone ?? '');
  const save = async () => {
    await store.settings.save({ pilotPhone: phone });
    showToast(t.settings.saved);
  };
  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-bold">{t.pilot.title}</h2>
      <p className="text-sm text-slate-600">{t.pilot.hint}</p>
      <Field
        label={t.pilot.phone}
        value={phone}
        type="tel"
        inputMode="tel"
        onChange={(e) => setPhone(e.target.value)}
        hint={t.pilot.phoneHint}
      />
      {changed && (
        <Button variant="secondary" className="w-full" onClick={() => void save()}>
          {t.common.save}
        </Button>
      )}
      {text && <LinkButton href={whatsAppLink(text, settings.pilotPhone)}>{t.pilot.send}</LinkButton>}
    </Card>
  );
}
