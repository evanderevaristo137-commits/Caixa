import type { DataMode } from '../data/db';
import { BACKUP_MIME, backupFileName, exportBackup, markBackupDone } from '../data/backup';
import type { Store } from '../data/store';
import { dateStamp } from '../lib/download';
import { shareOrDownload, type ShareResult } from '../lib/share';

/** Builds the backup file, opens the share menu (or downloads it) and remembers the date. */
export async function makeBackup(store: Store, mode: DataMode): Promise<ShareResult> {
  const prefix = mode === 'demo' ? 'caixa-demonstracao' : 'caixa';
  const content = JSON.stringify(await exportBackup(store.db));
  const result = await shareOrDownload(backupFileName(prefix, dateStamp()), content, BACKUP_MIME, 'Cópia de segurança — Caixa');
  if (result !== 'cancelled') await markBackupDone(store.db);
  return result;
}
