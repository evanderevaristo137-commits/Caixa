import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { DomainError } from '../../data/store';
import { isValidPin } from '../../domain/pin';
import { t } from '../../i18n/pt-AO';
import { Button, Card, Field } from '../../ui/kit';
import { saveFailedText } from '../../lib/save-error';

/** The message for a refused code: wrong, or too many wrong codes (wait). */
const pinError = (e: unknown) =>
  e instanceof DomainError && e.code === 'pin_locked'
    ? t.pin.locked(e.detail ?? 30)
    : e instanceof DomainError && e.code === 'wrong_pin'
      ? t.pin.wrong
      : (e instanceof DomainError && t.team.errors[e.code]) || saveFailedText(e);

type Mode = 'idle' | 'set' | 'remove';
const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6);

/** Optional owner code for sensitive actions. */
export function OwnerPinCard() {
  const { store, showToast } = useApp();
  const hasPin = useLiveQuery(() => store.security.hasPin(), [store]);
  const [mode, setMode] = useState<Mode>('idle');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setMode('idle');
    setCurrent('');
    setNext('');
    setRepeat('');
    setError(null);
  };

  const save = async () => {
    if (!isValidPin(next)) return setError(t.pin.invalid);
    if (next !== repeat) return setError(t.pin.mismatch);
    try {
      await store.security.setPin(next, current);
      showToast(t.pin.saved);
      reset();
    } catch (e) {
      setError(pinError(e));
    }
  };

  const remove = async () => {
    try {
      await store.security.removePin(current);
      showToast(t.pin.removed);
      reset();
    } catch (e) {
      setError(pinError(e));
    }
  };

  const pinField = (label: string, value: string, set: (v: string) => void) => (
    <Field
      label={label}
      type="password"
      inputMode="numeric"
      autoComplete="off"
      value={value}
      onChange={(e) => set(digits(e.target.value))}
    />
  );

  return (
    <Card className="space-y-3">
      <h3 className="text-lg font-bold">{t.pin.title}</h3>
      <p className="text-sm text-slate-600">{t.pin.hint}</p>
      {hasPin && mode === 'idle' && <p className="rounded-lg bg-brand-50 p-2 text-sm font-semibold text-brand-800">{t.pin.active}</p>}
      {mode === 'idle' ? (
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => setMode('set')}>
            {hasPin ? t.pin.change : t.pin.set}
          </Button>
          {hasPin && (
            <Button variant="danger" onClick={() => setMode('remove')}>
              {t.pin.remove}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3 rounded-xl bg-slate-50 p-3">
          {hasPin && pinField(t.pin.current, current, setCurrent)}
          {mode === 'set' && pinField(t.pin.newCode, next, setNext)}
          {mode === 'set' && pinField(t.pin.repeat, repeat, setRepeat)}
          {error && <p className="font-semibold text-red-700">{error}</p>}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={reset}>
              {t.common.cancel}
            </Button>
            {mode === 'set' ? (
              <Button className="flex-1" onClick={() => void save()}>
                {t.common.save}
              </Button>
            ) : (
              <Button variant="dangerSolid" className="flex-1" onClick={() => void remove()}>
                {t.pin.remove}
              </Button>
            )}
          </div>
        </div>
      )}
      {hasPin && <p className="text-xs text-slate-600">{t.pin.forgot}</p>}
    </Card>
  );
}
