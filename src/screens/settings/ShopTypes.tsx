import { useState } from 'react';
import { useApp } from '../../app/context';
import { BUSINESS_TYPES } from '../../domain/catalog';
import type { Settings } from '../../domain/types';
import { t } from '../../i18n/pt-AO';
import { Button, Card } from '../../ui/kit';
import { useBusy } from '../../ui/use-busy';

/** The kinds of shop as big buttons that turn on and off (more than one can be chosen). */
export function ShopTypeChoices({ value, onChange }: { value: string[]; onChange: (types: string[]) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2" role="group" aria-label={t.shopTypes.title}>
      {BUSINESS_TYPES.map((b) => {
        const on = value.includes(b.id);
        return (
          <button
            key={b.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== b.id) : [...value, b.id])}
            className={`flex min-h-14 items-center gap-2 rounded-xl border-2 px-3 py-2 text-left font-semibold break-words hyphens-auto ${
              on ? 'border-brand-700 bg-brand-50 text-brand-900' : 'border-slate-300 bg-white active:bg-slate-100'
            }`}
          >
            <span aria-hidden="true" className="text-xl">
              {b.icon}
            </span>
            <span className="min-w-0 flex-1">{b.name}</span>
            {on && (
              <span aria-hidden="true" className="text-brand-700">
                ✓
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** «Mais → A loja → Tipo de loja»: changes which categories come first when choosing one. */
export function ShopTypesCard({ settings }: { settings: Settings }) {
  const { store, showToast } = useApp();
  const [types, setTypes] = useState<string[]>(settings.businessTypes ?? []);
  const [busy, run] = useBusy();
  const changed = [...types].sort().join() !== [...(settings.businessTypes ?? [])].sort().join();
  return (
    <Card className="space-y-3">
      <h3 className="text-lg font-bold">{t.shopTypes.title}</h3>
      <p className="text-sm text-slate-600">{t.shopTypes.hint}</p>
      <ShopTypeChoices value={types} onChange={setTypes} />
      <Button
        className="w-full"
        disabled={busy || !changed}
        onClick={() =>
          void run(async () => {
            await store.settings.save({ businessTypes: types });
            showToast(t.settings.saved);
          })
        }
      >
        {t.common.save}
      </Button>
    </Card>
  );
}
