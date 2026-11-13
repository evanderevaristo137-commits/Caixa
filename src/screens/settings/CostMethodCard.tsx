import { useApp } from '../../app/context';
import type { Settings } from '../../domain/types';
import { t } from '../../i18n/pt-AO';
import { Card } from '../../ui/kit';

const chip = (on: boolean) =>
  `min-h-12 rounded-xl border-2 px-3 text-sm font-semibold ${on ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white'}`;

/** How a purchase changes the cost price: the cost of the last purchase (usual) or the average cost. */
export function CostMethodCard({ settings }: { settings: Settings }) {
  const { store, showToast } = useApp();
  const current = settings.costMethod ?? 'last';
  const choose = async (method: 'last' | 'average') => {
    if (method === current) return;
    await store.settings.save({ costMethod: method === 'average' ? 'average' : undefined });
    showToast(t.settings.saved);
  };
  return (
    <Card className="space-y-3">
      <h3 className="text-lg font-bold">{t.costMethod.title}</h3>
      <p className="text-sm text-slate-600">{t.costMethod.hint}</p>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label={t.costMethod.title}>
        {(['last', 'average'] as const).map((m) => (
          <button key={m} type="button" aria-pressed={current === m} className={chip(current === m)} onClick={() => void choose(m)}>
            {t.costMethod.options[m]}
          </button>
        ))}
      </div>
      <p className="text-sm text-slate-600">{t.costMethod.example}</p>
    </Card>
  );
}
