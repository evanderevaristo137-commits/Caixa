import { useState } from 'react';
import { useApp } from '../../app/context';
import {
  BackupError,
  openSafetyCopy,
  restoreBackup,
  restoreImpact,
  summariseBackup,
  summarisePhone,
  unlockBackupFile,
  type Backup,
  type BackupSummary,
  type OpenedBackup,
} from '../../data/backup';
import type { BackupLock } from '../../data/store';
import { t } from '../../i18n/pt-AO';
import { formatDateTime } from '../../lib/dates';
import { Button, Field, Sheet, Skeleton } from '../../ui/kit';
import { usePinGuard } from '../../ui/pin';
import { useBusy } from '../../ui/use-busy';
import { useLoaded } from '../../ui/use-loaded';

/** A copy chosen from a file, or the safety copy kept before the last restore (to undo it). */
export type RestoreSource = { kind: 'file'; opened: OpenedBackup } | { kind: 'safety' };

const errorText = (e: unknown) => t.backups.errors[e instanceof BackupError ? e.code : 'damaged'] ?? t.errors.saveFailed;

/**
 * Restoring a copy, in steps: the password (when the copy has one), then what the copy holds
 * against what the phone holds and what would be lost, then the restore itself, which can be undone.
 */
export function RestoreSheet({ source, onClose }: { source: RestoreSource; onClose: () => void }) {
  const [current, setCurrent] = useState(source);
  const [opened, setOpened] = useState<{ backup: Backup; lock?: BackupLock } | null>(
    source.kind === 'file' && source.opened.kind === 'ready' ? { backup: source.opened.backup } : null,
  );
  const [done, setDone] = useState<'file' | 'safety' | null>(null);

  if (done) {
    return (
      <Sheet title={t.backups.restoreTitle} onClose={onClose}>
        <p role="status" className="rounded-xl bg-brand-50 p-3 text-lg font-bold text-brand-800">
          {done === 'safety' ? t.backups.undone : t.backups.restored}
        </p>
        {done === 'file' && <p className="mt-2 text-slate-700">{t.backups.restoredHint}</p>}
        <div className="mt-4 flex gap-2">
          {done === 'file' && (
            <Button
              variant="secondary"
              onClick={() => {
                setDone(null);
                setOpened(null);
                setCurrent({ kind: 'safety' });
              }}
            >
              {t.backups.undo}
            </Button>
          )}
          <Button className="flex-1" onClick={onClose}>
            {t.backups.finish}
          </Button>
        </div>
      </Sheet>
    );
  }

  if (current.kind === 'safety' && !opened) {
    return <SafetyLoader onLoaded={(backup) => setOpened({ backup })} onClose={onClose} />;
  }
  if (current.kind === 'file' && current.opened.kind === 'locked' && !opened) {
    return <Unlock file={current.opened.file} onOpened={setOpened} onClose={onClose} />;
  }
  if (!opened) return null;
  return <Review source={current.kind} opened={opened} onDone={() => setDone(current.kind)} onClose={onClose} />;
}

function SafetyLoader({ onLoaded, onClose }: { onLoaded: (b: Backup) => void; onClose: () => void }) {
  const { store, showToast } = useApp();
  useLoaded(
    () =>
      openSafetyCopy(store.db).then(
        (backup) => (backup ? onLoaded(backup) : onClose()),
        (e: unknown) => {
          showToast(errorText(e));
          onClose();
        },
      ),
    [store],
  );
  return (
    <Sheet title={t.backups.restoreTitle} onClose={onClose}>
      <p className="mb-2 text-slate-700">{t.backups.reading}</p>
      <Skeleton rows={3} />
    </Sheet>
  );
}

function Unlock({
  file,
  onOpened,
  onClose,
}: {
  file: Extract<OpenedBackup, { kind: 'locked' }>['file'];
  onOpened: (o: { backup: Backup; lock: BackupLock }) => void;
  onClose: () => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, run] = useBusy();
  const open = () =>
    run(async () => {
      try {
        onOpened(await unlockBackupFile(file, password));
      } catch (e) {
        setError(errorText(e));
        setPassword('');
      }
    });
  return (
    <Sheet title={t.backups.restoreTitle} onClose={onClose}>
      <p className="mb-3 font-semibold">{t.backups.lockedInfo(formatDateTime(file.exportedAt))}</p>
      <Field
        label={t.backups.password}
        type="password"
        autoComplete="current-password"
        autoCapitalize="off"
        spellCheck={false}
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && password && void open()}
        error={error}
      />
      <Button big className="mt-4 w-full" disabled={!password || busy} onClick={() => void open()}>
        {busy ? t.backups.opening : t.backups.open}
      </Button>
    </Sheet>
  );
}

function Review({
  source,
  opened,
  onDone,
  onClose,
}: {
  source: 'file' | 'safety';
  opened: { backup: Backup; lock?: BackupLock };
  onDone: () => void;
  onClose: () => void;
}) {
  const { store } = useApp();
  const guard = usePinGuard();
  const [busy, run] = useBusy();
  const [error, setError] = useState<string | null>(null);
  const copy = summariseBackup(opened.backup);
  const phone = useLoaded(() => Promise.all([summarisePhone(store.db), restoreImpact(store.db, opened.backup)]), [store, opened.backup]);

  // Replacing all data needs the owner code (when set).
  const confirm = () =>
    guard(() =>
      run(async () => {
        try {
          await restoreBackup(store, opened.backup, new Date(), { source, lock: opened.lock });
          onDone();
        } catch (e) {
          setError(errorText(e));
        }
      }),
    );

  const lost = phone?.[1];
  const losing = lost
    ? [
        lost.sales > 0 && t.backups.lostSales(lost.sales),
        lost.creditPayments > 0 && t.backups.lostPayments(lost.creditPayments),
        lost.other > 0 && t.backups.lostOther(lost.other),
      ].filter((x): x is string => typeof x === 'string')
    : [];

  return (
    <Sheet title={source === 'safety' ? t.backups.undoTitle : t.backups.restoreTitle} onClose={onClose}>
      <div className="space-y-3">
        <Summary
          title={t.backups.theCopy}
          when={source === 'safety' ? t.backups.keptOn(formatDateTime(copy.exportedAt)) : t.backups.madeOn(formatDateTime(copy.exportedAt))}
          summary={copy}
        />
        {phone ? <Summary title={t.backups.thisPhone} summary={phone[0]} /> : <Skeleton rows={2} />}
        {lost &&
          (losing.length === 0 ? (
            <p className="rounded-xl bg-brand-50 p-3 font-semibold text-brand-800">{t.backups.nothingLost}</p>
          ) : (
            <p role="alert" className="rounded-xl bg-red-50 p-3 font-semibold text-red-800">
              {t.backups.willLose(joinList(losing))}
            </p>
          ))}
        <p className="text-sm text-slate-600">{t.backups.safetyNote}</p>
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 font-semibold text-red-800">
            {error}
          </p>
        )}
        <Button big variant="dangerSolid" className="w-full" disabled={!phone || busy} onClick={() => void confirm()}>
          {busy ? t.backups.restoring : source === 'safety' ? t.backups.undoAction : t.backups.confirmRestore}
        </Button>
        {busy && (
          <p role="status" className="text-center text-sm text-slate-700">
            {t.backups.restoringHint}
          </p>
        )}
        <Button variant="secondary" className="w-full" disabled={busy} onClick={onClose}>
          {t.common.cancel}
        </Button>
      </div>
    </Sheet>
  );
}

/** "a, b e c" */
const joinList = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')}${t.backups.and}${items[items.length - 1]}`;

function Summary({ title, when, summary }: { title: string; when?: string; summary: BackupSummary }) {
  return (
    <div className="rounded-xl bg-white p-3">
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      {summary.storeName && <p className="text-lg font-bold">{summary.storeName}</p>}
      {when && <p className="text-sm text-slate-600">{when}</p>}
      <p className="mt-1">{t.backups.sales(summary.sales, summary.lastSaleAt ? formatDateTime(summary.lastSaleAt) : null)}</p>
      <p>{t.backups.things(summary.products, summary.customers)}</p>
      {summary.demo && <p className="text-sm font-semibold text-amber-800">{t.backups.demoCopy}</p>}
    </div>
  );
}
