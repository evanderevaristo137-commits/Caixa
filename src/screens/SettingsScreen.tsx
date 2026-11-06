import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../app/context';
import { makeBackup } from '../app/backup-action';
import { creditCsv, importBackup, lastBackupAt, productsCsv, salesCsv } from '../data/backup';
import type { Settings } from '../domain/types';
import { t } from '../i18n/pt-AO';
import { formatDate } from '../lib/dates';
import { dateStamp } from '../lib/download';
import { shareOrDownload } from '../lib/share';
import { isStoragePersisted } from '../lib/storage';
import { promptInstall, useCanInstall } from '../lib/install';
import { Button, Card, Field, Skeleton } from '../ui/kit';

export default function SettingsScreen() {
  const { store } = useApp();
  const settings = useLiveQuery(() => store.settings.get(), [store]);
  if (!settings) return <Skeleton />;
  return (
    <div className="space-y-3 p-3">
      <InstallCard />
      <StoreForm key={`${store.db.name}-${settings.updatedAt}`} settings={settings} />
      <DataCard />
      <DemoCard />
      <p className="px-2 pb-4 text-center text-sm text-slate-600">{t.settings.about}</p>
    </div>
  );
}

function InstallCard() {
  const canInstall = useCanInstall();
  if (!canInstall) return null;
  return (
    <Card className="space-y-2 ring-4 ring-brand-100">
      <h2 className="text-lg font-bold">{t.install.title}</h2>
      <p className="text-sm text-slate-600">{t.install.hint}</p>
      <Button big className="w-full" onClick={() => void promptInstall()}>
        {t.install.button}
      </Button>
    </Card>
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
  const last = useLiveQuery(() => lastBackupAt(store.db), [store]);
  const persisted = useLiveQuery(() => isStoragePersisted(), []);
  const prefix = mode === 'demo' ? 'caixa-demonstracao' : 'caixa';
  const stamp = dateStamp();

  const backup = async () => {
    const result = await makeBackup(store, mode);
    if (result === 'shared') showToast(t.settings.backupDone);
    if (result === 'downloaded') showToast(t.settings.backupSaved);
  };

  const exportCsv = async (name: string, build: () => Promise<string>) => {
    await shareOrDownload(`${prefix}-${name}-${stamp}.csv`, await build(), 'text/csv', name);
  };

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
      {persisted !== null && persisted !== undefined && (
        <p className={`rounded-lg p-2 text-sm ${persisted ? 'bg-brand-50 text-brand-800' : 'bg-amber-50 text-amber-900'}`}>
          {persisted ? t.settings.storageProtected : t.settings.storageNotProtected}
        </p>
      )}
      <Button big className="w-full" onClick={() => void backup()}>
        {t.settings.exportJson}
      </Button>
      <p className="text-sm text-slate-600">
        {last ? t.settings.lastBackup(formatDate(last)) : t.settings.noBackupYet} {t.settings.exportJsonHint}
      </p>
      <Button variant="secondary" className="w-full" onClick={() => file.current?.click()}>
        {t.settings.import}
      </Button>
      <input
        ref={file}
        type="file"
        accept=".txt,.json,text/plain,application/json"
        className="hidden"
        onChange={(e) => void onImport(e.target.files?.[0])}
      />
      <h3 className="pt-2 font-semibold">{t.settings.exportsTitle}</h3>
      <div className="grid grid-cols-3 gap-2">
        <Button variant="secondary" className="text-sm" onClick={() => void exportCsv('vendas', () => salesCsv(store.db))}>
          {t.settings.exportSales}
        </Button>
        <Button variant="secondary" className="text-sm" onClick={() => void exportCsv('produtos', () => productsCsv(store.db))}>
          {t.settings.exportProducts}
        </Button>
        <Button variant="secondary" className="text-sm" onClick={() => void exportCsv('fiado', () => creditCsv(store.db))}>
          {t.settings.exportCredit}
        </Button>
      </div>
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
