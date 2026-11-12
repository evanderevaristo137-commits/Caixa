import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useApp } from '../app/context';
import { t } from '../i18n/pt-AO';
import { Button, Field, Sheet } from './kit';
import { useBusy } from './use-busy';

type Action = () => void | Promise<void>;
const PinCtx = createContext<((action: Action) => Promise<void>) | null>(null);

/**
 * Wraps sensitive actions: when the owner has set a code, it is asked first.
 * Without a code, the action runs straight away.
 */
export function PinProvider({ children }: { children: ReactNode }) {
  const { store } = useApp();
  const [pending, setPending] = useState<Action | null>(null);

  const guard = useCallback(
    async (action: Action) => {
      if (await store.security.hasPin()) setPending(() => action);
      else await action();
    },
    [store],
  );

  return (
    <PinCtx.Provider value={guard}>
      {children}
      {pending && (
        <PinSheet
          onCancel={() => setPending(null)}
          onOk={async () => {
            setPending(null);
            await pending();
          }}
        />
      )}
    </PinCtx.Provider>
  );
}

export function usePinGuard() {
  const guard = useContext(PinCtx);
  if (!guard) throw new Error('usePinGuard outside PinProvider');
  return guard;
}

function PinSheet({ onOk, onCancel }: { onOk: () => Promise<void>; onCancel: () => void }) {
  const { store } = useApp();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, run] = useBusy();
  // A double tap on "Confirmar" must not run the protected action twice.
  const check = () =>
    run(async () => {
      if (await store.security.verify(pin)) await onOk();
      else {
        setError(t.pin.wrong);
        setPin('');
      }
    });
  return (
    <Sheet title={t.pin.ask} onClose={onCancel}>
      <p className="mb-3 text-slate-700">{t.pin.askHint}</p>
      <Field
        label={t.pin.code}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        autoFocus
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onKeyDown={(e) => e.key === 'Enter' && void check()}
        error={error}
      />
      <div className="mt-4 flex gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {t.common.cancel}
        </Button>
        <Button className="flex-1" disabled={pin.length < 4 || busy} onClick={() => void check()}>
          {t.common.confirm}
        </Button>
      </div>
    </Sheet>
  );
}
