import type { DataMode } from '../data/db';
import { BACKUP_MIME, backupFileName, backupFileText, markBackupDone } from '../data/backup';
import type { Store } from '../data/store';
import { t } from '../i18n/pt-AO';
import { dateStamp } from '../lib/download';
import { shareOrDownload, type ShareResult } from '../lib/share';

export interface BackupResult {
  result: ShareResult;
  /** Protected with the owner's password. */
  locked: boolean;
}

/** Builds the backup file (compressed, and encrypted when there is a password), shares or saves it, and remembers the date. */
export async function makeBackup(store: Store, mode: DataMode): Promise<BackupResult> {
  const prefix = mode === 'demo' ? 'caixa-demonstracao' : 'caixa';
  const lock = await store.security.backupLock();
  const content = await backupFileText(store.db, lock);
  const result = await shareOrDownload(backupFileName(prefix, dateStamp()), content, BACKUP_MIME, 'Cópia de segurança — Caixa');
  if (result !== 'cancelled') await markBackupDone(store.db);
  return { result, locked: lock !== null };
}

/** What to tell the shopkeeper after a backup (nothing when they cancelled the share menu). */
export function backupMessage({ result, locked }: BackupResult): string | null {
  if (result === 'shared') return t.backups.done(locked);
  if (result === 'downloaded') return t.backups.saved(locked);
  return null;
}
