import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../../i18n/pt-AO';
import { registerBackHandler } from '../../ui/back';
import { Button } from '../../ui/kit';

/**
 * The non-fiscal receipt, ready for the phone's print screen: a small receipt printer (58 or 80 mm,
 * through its Android app) or «Guardar como PDF». Same words as the WhatsApp receipt (`receiptText`):
 * a line between asterisks is printed in bold. Rendered straight into <body>, so nothing else prints.
 */
export function ReceiptPrint({ text, onClose }: { text: string; onClose: () => void }) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const unregister = registerBackHandler(() => close.current());
    // Let the receipt appear first, then open the print screen.
    const timer = window.setTimeout(() => window.print(), 300);
    return () => {
      unregister();
      window.clearTimeout(timer);
    };
  }, []);

  return createPortal(
    <div
      className="print-area fixed inset-0 z-50 overflow-y-auto bg-white p-3 text-black"
      role="dialog"
      aria-modal="true"
      aria-label={t.printReceipt.dialog}
    >
      <div className="mb-3 flex items-center gap-2 print:hidden">
        <Button variant="secondary" onClick={onClose}>
          {t.common.close}
        </Button>
        <Button className="flex-1" onClick={() => window.print()}>
          {t.printReceipt.again}
        </Button>
      </div>
      <p className="mb-3 text-sm text-slate-600 print:hidden">{t.printReceipt.hint}</p>
      <div className="mx-auto max-w-[80mm] border border-dashed border-slate-400 p-3 font-mono text-sm leading-snug break-words print:mx-0 print:border-0 print:p-0">
        {text.split('\n').map((line, i) => {
          const bold = line.length > 2 && line.startsWith('*') && line.endsWith('*');
          return (
            <p key={i} className={bold ? 'font-bold' : ''}>
              {(bold ? line.slice(1, -1) : line) || ' '}
            </p>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
