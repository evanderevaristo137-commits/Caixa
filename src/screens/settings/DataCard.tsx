import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { backupMessage, makeBackup } from '../../app/backup-action';
import {
  BackupError,
  creditCsv,
  expensesCsv,
  lastBackupAt,
  openBackupFile,
  productsCsv,
  purchasesCsv,
  returnsCsv,
  safetyCopyInfo,
  salesCsv,
  suppliersCsv,
} from '../../data/backup';
import { t } from '../../i18n/pt-AO';
import { formatDate, formatDateTime } from '../../lib/dates';
import { dateStamp } from '../../lib/download';
import { shareOrDownload } from '../../lib/share';
import { isStoragePersisted } from '../../lib/storage';
import { Button, Card } from '../../ui/kit';
import { useBusy } from '../../ui/use-busy';
import { BackupPasswordSheet } from './BackupPasswordSheet';
import { RestoreSheet, type RestoreSource } from './RestoreSheet';

/** Backups (make, protect with a password, restore, undo a restore) and the Excel exports. */
export function DataCard() {
  const { store, mode, showToast } = useApp();
  const file = useRef<HTMLInputElement>(null);
  const last = useLiveQuery(() => lastBackupAt(store.db), [store]);
  const persisted = useLiveQuery(() => isStoragePersisted(), []);
  const locked = useLiveQuery(async () => (await store.security.backupLock()) !== null, [store]);
  const safety = useLiveQuery(() => safetyCopyInfo(store.db), [store]);
  const [busy, run] = useBusy();
  const [restore, setRestore] = useState<RestoreSource | null>(null);
  const [password, setPassword] = useState(false);
  const prefix = mode === 'demo' ? 'caixa-demonstracao' : 'caixa';
  const stamp = dateStamp();

  const backup = () =>
    run(async () => {
      const message = backupMessage(await makeBackup(store, mode));
      if (message) showToast(message);
    });

  const exportCsv = async (name: string, build: () => Promise<string>) => {
    await shareOrDownload(`${prefix}-${name}-${stamp}.csv`, await build(), 'text/csv', name);
  };

  const onFile = (f: File | undefined) =>
    run(async () => {
      if (!f) return;
      if (file.current) file.current.value = '';
      try {
        setRestore({ kind: 'file', opened: await openBackupFile(await f.text()) });
      } catch (e) {
        showToast(t.backups.errors[e instanceof BackupError ? e.code : 'not_a_backup']!);
      }
    });

  return (
    <Card className="space-y-2">
      <h3 className="text-lg font-bold">{t.settings.data}</h3>
      <p className="text-sm text-slate-600">{t.settings.dataNote}</p>
      {persisted !== null && persisted !== undefined && (
        <p className={`rounded-lg p-2 text-sm ${persisted ? 'bg-brand-50 text-brand-800' : 'bg-amber-50 text-amber-900'}`}>
          {persisted ? t.settings.storageProtected : t.settings.storageNotProtected}
        </p>
      )}
      <Button big className="w-full" disabled={busy} onClick={() => void backup()}>
        {busy ? t.backups.making : t.settings.exportJson}
      </Button>
      <p className="text-sm text-slate-600">
        {last ? t.settings.lastBackup(formatDate(last)) : t.settings.noBackupYet} {t.settings.exportJsonHint}
      </p>
      {locked !== undefined && (
        <div className={`rounded-lg p-2 text-sm ${locked ? 'bg-brand-50 text-brand-800' : 'bg-slate-100 text-slate-700'}`}>
          <p>{locked ? t.backups.protectedOn : t.backups.protectedOff}</p>
          <Button variant="ghost" className="mt-1 w-full" onClick={() => setPassword(true)}>
            {locked ? t.backups.manage : t.backups.protect}
          </Button>
        </div>
      )}
      <Button variant="secondary" className="w-full" disabled={busy} onClick={() => file.current?.click()}>
        {t.backups.restore}
      </Button>
      <input
        ref={file}
        type="file"
        accept=".txt,.json,text/plain,application/json"
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      {safety && (
        <div className="rounded-lg bg-slate-100 p-2 text-sm text-slate-700">
          <p className="font-semibold">{t.backups.undoTitle}</p>
          <p>{t.backups.undoInfo(formatDateTime(safety.createdAt), t.backups.sales(safety.summary.sales, null))}</p>
          <Button variant="ghost" className="mt-1 w-full" onClick={() => setRestore({ kind: 'safety' })}>
            {t.backups.undoAction}
          </Button>
        </div>
      )}
      <h4 className="pt-2 font-semibold">{t.settings.exportsTitle}</h4>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" className="text-sm" onClick={() => void exportCsv('vendas', () => salesCsv(store.db))}>
          {t.settings.exportSales}
        </Button>
        <Button variant="secondary" className="text-sm" onClick={() => void exportCsv('produtos', () => productsCsv(store.db))}>
          {t.settings.exportProducts}
        </Button>
        <Button variant="secondary" className="text-sm" onClick={() => void exportCsv('clientes', () => creditCsv(store.db))}>
          {t.settings.exportCredit}
        </Button>
        <Button variant="secondary" className="text-sm" onClick={() => void exportCsv('saidas', () => expensesCsv(store.db))}>
          {t.settings.exportExpenses}
        </Button>
        <Button variant="secondary" className="text-sm" onClick={() => void exportCsv('compras', () => purchasesCsv(store.db))}>
          {t.settings.exportPurchases}
        </Button>
        <Button variant="secondary" className="text-sm" onClick={() => void exportCsv('fornecedores', () => suppliersCsv(store.db))}>
          {t.settings.exportSuppliers}
        </Button>
        <Button variant="secondary" className="text-sm" onClick={() => void exportCsv('devolucoes', () => returnsCsv(store.db))}>
          {t.settings.exportReturns}
        </Button>
      </div>
      {restore && <RestoreSheet source={restore} onClose={() => setRestore(null)} />}
      {password && locked !== undefined && <BackupPasswordSheet locked={locked} onClose={() => setPassword(false)} />}
    </Card>
  );
}
