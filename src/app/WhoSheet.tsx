import { useEffect, useId, useRef, useState } from 'react';
import { OWNER } from '../domain/staff';
import { t } from '../i18n/pt-AO';
import { registerBackHandler } from '../ui/back';
import { Button, Field } from '../ui/kit';
import { useBusy } from '../ui/use-busy';
import { signInError, type Team } from './team';
import { Modal } from '../ui/modal';

/**
 * «Quem está a usar a app?»: the owner and each employee; the chosen one types their code. With
 * nobody chosen yet it cannot be closed (the app needs to know who sells); from «Trocar», it can.
 */
export function WhoSheet({ team, onClose }: { team: Team; onClose?: () => void }) {
  const titleId = useId();
  const [chosen, setChosen] = useState<{ id: string; name: string } | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, run] = useBusy();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => (onClose ? registerBackHandler(() => close.current?.()) : undefined), [onClose]);

  const people = [{ id: OWNER, name: t.team.owner, role: undefined }, ...team.members.filter((m) => !m.archivedAt)];

  const enter = () =>
    run(async () => {
      if (!chosen) return;
      const tried = pin;
      try {
        const result = await team.signIn(chosen.id, tried);
        if (result.ok) return;
        setError(result.waitSeconds ? t.pin.locked(result.waitSeconds) : t.pin.wrong);
        setPin((current) => (current === tried ? '' : current));
      } catch (e) {
        setError(signInError(e, chosen.name));
      }
    });

  return (
    <Modal className="fixed inset-0 z-50 overflow-y-auto bg-slate-50" aria-labelledby={titleId}>
      <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center gap-4 p-5">
        <h1 id={titleId} className="text-2xl font-extrabold">
          {chosen ? t.team.codeOf(chosen.name) : t.team.whoTitle}
        </h1>
        {!chosen ? (
          <>
            <p className="text-slate-700">{t.team.whoHint}</p>
            <ul className="space-y-2">
              {people.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setChosen({ id: p.id, name: p.name });
                      setPin('');
                      setError(null);
                    }}
                    className="flex min-h-16 w-full items-center justify-between rounded-2xl bg-white px-4 text-left shadow-sm active:bg-slate-50"
                  >
                    <span className="text-lg font-bold">{p.name}</span>
                    {p.role && <span className="text-sm text-slate-600">{t.team.roles[p.role]}</span>}
                  </button>
                </li>
              ))}
            </ul>
            {onClose && (
              <Button variant="secondary" onClick={onClose}>
                {t.common.cancel}
              </Button>
            )}
          </>
        ) : (
          <>
            <Field
              label={t.pin.code}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => e.key === 'Enter' && void enter()}
              error={error}
            />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setChosen(null)}>
                {t.common.back}
              </Button>
              <Button className="flex-1" disabled={pin.length < 4 || busy} onClick={() => void enter()}>
                {t.team.enter}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
