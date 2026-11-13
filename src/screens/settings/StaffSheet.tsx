import { useState } from 'react';
import { useApp } from '../../app/context';
import { DomainError } from '../../data/store';
import { isValidPin } from '../../domain/pin';
import type { StaffMember, StaffRole } from '../../domain/types';
import { t } from '../../i18n/pt-AO';
import { useConfirm } from '../../ui/confirm';
import { Button, Field, Sheet } from '../../ui/kit';
import { usePinGuard } from '../../ui/pin';
import { useBusy } from '../../ui/use-busy';
import { saveFailedText } from '../../lib/save-error';

const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6);
const staffError = (e: unknown) => (e instanceof DomainError && t.team.errors[e.code]) || saveFailedText(e);

/**
 * A new employee, or one already in the shop: name, what they may do and their code. Everything here
 * asks the owner code (the Store checks it too).
 */
export function StaffSheet({ member, onClose }: { member?: StaffMember; onClose: () => void }) {
  const { store, showToast } = useApp();
  const guard = usePinGuard();
  const [dialog, ask] = useConfirm();
  const [busy, run] = useBusy();
  const [name, setName] = useState(member?.name ?? '');
  const [role, setRole] = useState<StaffRole>(member?.role ?? 'seller');
  const [canCredit, setCanCredit] = useState(member?.canCredit ?? false);
  const [codeOpen, setCodeOpen] = useState(!member);
  const [pin, setPin] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);

  const checkCode = () => {
    if (!isValidPin(pin)) return t.team.errors.invalid_pin!;
    if (pin !== repeat) return t.pin.mismatch;
    return null;
  };

  const save = () =>
    run(async () => {
      if (!name.trim()) return setError(t.team.errors.name_required!);
      if (!member) {
        const bad = checkCode();
        if (bad) return setError(bad);
      }
      setError(null);
      await guard(async () => {
        try {
          if (member) await store.staff.update(member.id, { name, role, canCredit });
          else await store.staff.add({ name, role, canCredit }, pin);
          showToast(t.team.saved);
          onClose();
        } catch (e) {
          setError(staffError(e));
        }
      });
    });

  const saveCode = () =>
    run(async () => {
      if (!member) return;
      const bad = checkCode();
      if (bad) return setError(bad);
      setError(null);
      await guard(async () => {
        try {
          await store.staff.setPin(member.id, pin);
          showToast(t.team.codeSaved);
          setCodeOpen(false);
          setPin('');
          setRepeat('');
        } catch (e) {
          setError(staffError(e));
        }
      });
    });

  const retire = () =>
    run(async () => {
      if (!member) return;
      const ok = await ask({
        title: t.team.archiveConfirm(member.name),
        message: t.team.archiveNote,
        confirmLabel: t.team.archiveYes,
        danger: true,
      });
      if (!ok) return;
      await guard(async () => {
        try {
          await store.staff.archive(member.id);
          showToast(t.team.archived);
          onClose();
        } catch (e) {
          setError(staffError(e));
        }
      });
    });

  const pinFields = (
    <>
      <Field
        label={t.team.code}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        value={pin}
        onChange={(e) => setPin(digits(e.target.value))}
      />
      <Field
        label={t.team.repeat}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        value={repeat}
        onChange={(e) => setRepeat(digits(e.target.value))}
      />
    </>
  );

  return (
    <Sheet title={member ? member.name : t.team.newTitle} onClose={onClose}>
      <div className="space-y-4">
        <Field label={t.team.name} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        <fieldset className="space-y-2">
          <legend className="mb-1 font-semibold">{t.team.role}</legend>
          {(['seller', 'manager'] as const).map((r) => (
            <label
              key={r}
              className={`flex min-h-14 items-start gap-3 rounded-xl border-2 p-3 ${role === r ? 'border-brand-700 bg-brand-50' : 'border-slate-200 bg-white'}`}
            >
              <input type="radio" name="role" className="mt-1 h-5 w-5" checked={role === r} onChange={() => setRole(r)} />
              <span>
                <span className="block font-bold">{t.team.roles[r]}</span>
                <span className="block text-sm text-slate-600">{t.team.roleHints[r]}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {role === 'seller' && (
          <label className="flex min-h-12 items-center gap-3">
            <input type="checkbox" className="h-5 w-5" checked={canCredit} onChange={(e) => setCanCredit(e.target.checked)} />
            <span>{t.team.canCredit}</span>
          </label>
        )}
        {!member && pinFields}
        {error && <p className="font-semibold text-red-700">{error}</p>}
        <Button big className="w-full" disabled={busy} onClick={() => void save()}>
          {t.common.save}
        </Button>
        {member && (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            {codeOpen ? (
              <>
                {pinFields}
                <Button className="w-full" disabled={busy} onClick={() => void saveCode()}>
                  {t.team.saveCode}
                </Button>
              </>
            ) : (
              <Button variant="secondary" className="w-full" onClick={() => setCodeOpen(true)}>
                {t.team.newCode}
              </Button>
            )}
            <Button variant="danger" className="w-full" disabled={busy} onClick={() => void retire()}>
              {t.team.archive}
            </Button>
          </div>
        )}
      </div>
      {dialog}
    </Sheet>
  );
}
