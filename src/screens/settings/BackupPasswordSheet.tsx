import { useState } from 'react';
import { useApp } from '../../app/context';
import { BACKUP_PASSWORD_MIN, DomainError } from '../../data/store';
import { t } from '../../i18n/pt-AO';
import { normalisePassword } from '../../lib/pack';
import { Button, Field, Sheet } from '../../ui/kit';
import { usePinGuard } from '../../ui/pin';
import { useBusy } from '../../ui/use-busy';
import { saveFailedText } from '../../lib/save-error';

/**
 * The password that protects the backups: set it, change it or take it out.
 * Typed twice, with a clear warning that a forgotten password cannot be recovered.
 */
export function BackupPasswordSheet({ locked, onClose }: { locked: boolean; onClose: () => void }) {
  const { store, showToast } = useApp();
  const guard = usePinGuard();
  const [busy, run] = useBusy();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<{ field: 'password' | 'again'; msg: string } | null>(null);
  const [removing, setRemoving] = useState(false);

  const save = () => {
    if (normalisePassword(password).length < BACKUP_PASSWORD_MIN) return setError({ field: 'password', msg: t.backups.tooShort });
    if (normalisePassword(password) !== normalisePassword(again)) return setError({ field: 'again', msg: t.backups.notSame });
    setError(null);
    return guard(() =>
      run(async () => {
        try {
          await store.security.setBackupPassword(password);
          showToast(t.backups.passwordSaved);
          onClose();
        } catch (e) {
          setError({
            field: 'password',
            msg: e instanceof DomainError && e.code === 'weak_password' ? t.backups.tooShort : saveFailedText(e),
          });
        }
      }),
    );
  };

  const remove = () =>
    guard(() =>
      run(async () => {
        await store.security.setBackupPassword(null);
        showToast(t.backups.passwordRemoved);
        onClose();
      }),
    );

  const input = { type: 'password', autoComplete: 'new-password', autoCapitalize: 'off', spellCheck: false } as const;
  return (
    <Sheet title={t.backups.passwordTitle} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-slate-700">{t.backups.passwordHint}</p>
        <p className="rounded-xl bg-amber-50 p-3 font-semibold text-amber-950">{t.backups.passwordWarning}</p>
        <Field
          {...input}
          label={t.backups.newPassword}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error?.field === 'password' ? error.msg : null}
        />
        <Field
          {...input}
          label={t.backups.repeatPassword}
          value={again}
          onChange={(e) => setAgain(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
          error={error?.field === 'again' ? error.msg : null}
        />
        {locked && <p className="text-sm text-slate-600">{t.backups.oldCopies}</p>}
        <Button big className="w-full" disabled={busy} onClick={() => void save()}>
          {busy ? t.backups.saving : t.backups.savePassword}
        </Button>
        {locked &&
          (removing ? (
            <div className="space-y-2 rounded-xl bg-red-50 p-3">
              <p className="font-semibold text-red-800">{t.backups.removeWarning}</p>
              <Button variant="dangerSolid" className="w-full" disabled={busy} onClick={() => void remove()}>
                {t.backups.removeConfirm}
              </Button>
            </div>
          ) : (
            <Button variant="danger" className="w-full" disabled={busy} onClick={() => setRemoving(true)}>
              {t.backups.removePassword}
            </Button>
          ))}
      </div>
    </Sheet>
  );
}
