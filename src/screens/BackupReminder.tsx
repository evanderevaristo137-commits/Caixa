import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../app/context';
import { makeBackup } from '../app/backup-action';
import { lastBackupAt } from '../data/backup';
import { backupReminderDays } from '../domain/backup-reminder';
import { t } from '../i18n/pt-AO';
import { Button } from '../ui/kit';

/** Gentle reminder to back up, only for the real shop (never in the demo). */
export function BackupReminder() {
  const { store, mode, showToast } = useApp();
  const info = useLiveQuery(async () => {
    const [last, first] = await Promise.all([lastBackupAt(store.db), store.db.sales.orderBy('createdAt').first()]);
    return { last, days: backupReminderDays({ lastBackupAt: last, firstSaleAt: first?.createdAt, now: new Date() }) };
  }, [store]);
  if (mode !== 'store' || !info || info.days === null) return null;

  const run = async () => {
    const result = await makeBackup(store, mode);
    if (result === 'shared') showToast(t.settings.backupDone);
    if (result === 'downloaded') showToast(t.settings.backupSaved);
  };

  return (
    <div role="alert" className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-amber-950">
      <p className="font-semibold">{info.last ? t.backupReminder.late(info.days) : t.backupReminder.never}</p>
      <Button className="mt-3 w-full" onClick={() => void run()}>
        {t.backupReminder.action}
      </Button>
    </div>
  );
}
