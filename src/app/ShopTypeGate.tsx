import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from './context';
import { TERMS_VERSION } from '../legal/documents';
import { t } from '../i18n/pt-AO';
import { Button } from '../ui/kit';
import { useBusy } from '../ui/use-busy';
import { ShopTypeChoices } from '../screens/settings/ShopTypes';
import { Modal } from '../ui/modal';

/**
 * Right after the Terms are accepted, one question: «Que tipo de loja tem?». Its categories then
 * come first when choosing one. It can be skipped, and changed later in «Mais → A loja». Asked once:
 * skipping saves an empty choice. Only in the real shop (the demo has its own).
 */
export function ShopTypeGate() {
  const { store, mode } = useApp();
  const asked = useLiveQuery(async () => {
    const [accepted, settings] = await Promise.all([store.legal.accepted(), store.settings.get()]);
    // undefined while loading; true when there is nothing to ask.
    return accepted?.version !== TERMS_VERSION || settings.businessTypes !== undefined;
  }, [store]);
  const [types, setTypes] = useState<string[]>([]);
  const [busy, run] = useBusy();
  if (mode !== 'store' || asked !== false) return null;

  const save = (chosen: string[]) => run(() => store.settings.save({ businessTypes: chosen }));
  return (
    <Modal className="fixed inset-0 z-40 overflow-y-auto bg-slate-50" aria-labelledby="shop-type-title">
      <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center gap-4 p-5">
        <h1 id="shop-type-title" className="text-2xl font-extrabold">
          {t.shopTypes.question}
        </h1>
        <p className="text-slate-700">{t.shopTypes.questionHint}</p>
        <ShopTypeChoices value={types} onChange={setTypes} />
        <Button big className="w-full" disabled={busy || types.length === 0} onClick={() => void save(types)}>
          {t.shopTypes.continue}
        </Button>
        <Button variant="ghost" className="w-full" disabled={busy} onClick={() => void save([])}>
          {t.shopTypes.skip}
        </Button>
      </div>
    </Modal>
  );
}
