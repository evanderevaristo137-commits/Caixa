import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../app/context';
import { creditCsv, exportBackup, importBackup, productsCsv, salesCsv } from '../data/backup';
import type { Settings } from '../domain/types';
import { t } from '../i18n/pt-AO';
import { dateStamp, downloadText } from '../lib/download';
import { Button, Card, Field, Skeleton } from '../ui/kit';

export default function SettingsScreen() {
  const { store } = useApp();
  const settings = useLiveQuery(() => store.settings.get(), [store]);
  if (!settings) return <Skeleton />;
  return (
    <div className="space-y-3 p-3">
      <StoreForm key={`${store.db.name}-${settings.updatedAt}`} settings={settings} />
      <DataCard />
      <DemoCard />
      <p className="px-2 pb-4 text-center text-sm text-slate-500">{t.settings.about}</p>
    </div>
  );
}

function StoreForm({ settings }: { settings: Settings }) {
  const { store, showToast } = useApp();
  const [storeName, setStoreName] = useState(settings.storeName);
  const [phone, setPhone] = useState(settings.phone ?? '');
  const [nif, setNif] = useState(settings.nif ?? '');
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!storeName.trim()) return setError(t.products.nameRequired);
    await store.settings.save({ storeName, phone, nif });
    setError(null);
    showToast(t.settings.saved);
  };
  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-bold">{t.settings.title}</h2>
      <Field label={t.settings.storeName} value={storeName} onChange={(e) => setStoreName(e.target.value)} error={error} />
      <Field label={t.settings.phone} value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" />
      <Field label={t.settings.nif} value={nif} onChange={(e) => setNif(e.target.value)} inputMode="numeric" />
      <Button className="w-full" onClick={() => void save()}>
        {t.common.save}
      </Button>
    </Card>
  );
}

function DataCard() {
  const { store, mode, showToast } = useApp();
  const file = useRef<HTMLInputElement>(null);
  const prefix = mode === 'demo' ? 'caixa-demonstracao' : 'caixa';
  const stamp = dateStamp();

  const onImport = async (f: File | undefined) => {
    if (!f) return;
    try {
      const raw: unknown = JSON.parse(await f.text());
      if (!window.confirm(t.settings.importConfirm)) return;
      await importBackup(store.db, raw);
      showToast(t.settings.importOk);
    } catch (e) {
      showToast(e instanceof Error && e.message === 'demo_into_store' ? t.settings.importDemoBlocked : t.settings.importBad);
    } finally {
      if (file.current) file.current.value = '';
    }
  };

  return (
    <Card className="space-y-2">
      <h2 className="text-lg font-bold">{t.settings.data}</h2>
      <p className="text-sm text-slate-600">{t.settings.dataNote}</p>
      <Button className="w-full" onClick={async () => downloadText(`${prefix}-copia-${stamp}.json`, JSON.stringify(await exportBackup(store.db)), 'application/json')}>
        {t.settings.exportJson}
      </Button>
      <div className="grid grid-cols-3 gap-2">
        <Button variant="secondary" className="text-sm" onClick={async () => downloadText(`${prefix}-vendas-${stamp}.csv`, await salesCsv(store.db), 'text/csv')}>
          {t.settings.exportSales}
        </Button>
        <Button variant="secondary" className="text-sm" onClick={async () => downloadText(`${prefix}-produtos-${stamp}.csv`, await productsCsv(store.db), 'text/csv')}>
          {t.settings.exportProducts}
        </Button>
        <Button variant="secondary" className="text-sm" onClick={async () => downloadText(`${prefix}-fiado-${stamp}.csv`, await creditCsv(store.db), 'text/csv')}>
          {t.settings.exportCredit}
        </Button>
      </div>
      <Button variant="secondary" className="w-full" onClick={() => file.current?.click()}>
        {t.settings.import}
      </Button>
      <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void onImport(e.target.files?.[0])} />
    </Card>
  );
}

function DemoCard() {
  const { mode, setMode, resetDemo, showToast } = useApp();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className={`space-y-2 ${mode === 'demo' ? 'ring-4 ring-amber-400' : ''}`}>
      <h2 className="text-lg font-bold">{t.settings.demo}</h2>
      <p className="text-sm text-slate-600">{t.settings.demoNote}</p>
      {mode === 'store' ? (
        <Button className="w-full" disabled={busy} onClick={() => void run(() => setMode('demo'))}>
          {t.settings.demoOn}
        </Button>
      ) : (
        <>
          <Button
            variant="secondary"
            className="w-full"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (!window.confirm(t.settings.demoResetConfirm)) return;
                await resetDemo();
                showToast(t.settings.demoResetOk);
              })
            }
          >
            {t.settings.demoReset}
          </Button>
          <Button className="w-full" disabled={busy} onClick={() => void run(() => setMode('store'))}>
            {t.settings.demoOff}
          </Button>
        </>
      )}
    </Card>
  );
}
