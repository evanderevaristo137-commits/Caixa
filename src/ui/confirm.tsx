import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { t } from '../i18n/pt-AO';
import { registerBackHandler } from './back';
import { Button } from './kit';
import { Modal } from './modal';

export interface ConfirmOptions {
  /** The question, in a few words ("Arquivar este produto?"). */
  title: string;
  /** What happens, in one or two sentences. */
  message?: string;
  /** The verb on the button ("Arquivar"), never just "OK". */
  confirmLabel: string;
  /** Something is lost or undone: the button is red. */
  danger?: boolean;
}

/**
 * The app's own «are you sure?» (instead of the browser's, which looks foreign, cannot be read
 * aloud well and some phones block): big buttons, the safe choice first, Android back = cancel.
 */
function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger = false,
  onCancel,
  onConfirm,
}: ConfirmOptions & { onCancel: () => void; onConfirm: () => void }) {
  const titleId = useId();
  const messageId = useId();
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  useEffect(() => registerBackHandler(() => cancel.current()), []);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={onCancel}>
      <Modal
        role="alertdialog"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-bold">
          {title}
        </h2>
        {message && (
          <p id={messageId} className="text-slate-700">
            {message}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          {/* The safe choice has the focus: a hurried Enter never deletes anything. */}
          <Button autoFocus variant="secondary" onClick={onCancel}>
            {t.common.cancel}
          </Button>
          <Button variant={danger ? 'dangerSolid' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

/**
 * `const [dialog, ask] = useConfirm()`: render `dialog` somewhere in the component, then
 * `if (!(await ask({ ... }))) return;` before the action.
 */
export function useConfirm(): [ReactNode, (options: ConfirmOptions) => Promise<boolean>] {
  const [request, setRequest] = useState<{ options: ConfirmOptions; resolve: (ok: boolean) => void } | null>(null);
  const ask = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setRequest({ options, resolve })), []);
  const answer = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(null);
  };
  const dialog = request ? <ConfirmDialog {...request.options} onCancel={() => answer(false)} onConfirm={() => answer(true)} /> : null;
  return [dialog, ask];
}
