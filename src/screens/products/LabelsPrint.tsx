import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../../i18n/pt-AO';
import { BarcodeSvg } from '../../ui/BarcodeSvg';
import { registerBackHandler } from '../../ui/back';
import { Button } from '../../ui/kit';

export interface LabelItem {
  key: string;
  name: string;
  price: string;
  code: string;
}

/**
 * The labels, ready for the phone's print screen (where "Guardar como PDF" also works).
 * Rendered straight into <body> so that, when printing, everything else can be left out.
 */
export function LabelsPrint({ labels, onClose }: { labels: LabelItem[]; onClose: () => void }) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const unregister = registerBackHandler(() => close.current());
    // Let the labels appear first, then open the print screen.
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
      aria-label={t.labels.printDialog}
    >
      <div className="mb-3 flex items-center gap-2 print:hidden">
        <Button variant="secondary" onClick={onClose}>
          {t.common.close}
        </Button>
        <Button className="flex-1" onClick={() => window.print()}>
          {t.labels.printAgain}
        </Button>
      </div>
      <p className="mb-1 font-bold print:hidden">{t.labels.printTitle(labels.length)}</p>
      <p className="mb-3 text-sm text-slate-600 print:hidden">{t.labels.printHint}</p>
      <div className="grid grid-cols-2 gap-2 print:grid-cols-3 print:gap-0">
        {labels.map((l) => (
          <div
            key={l.key}
            className="label-cell flex flex-col items-center justify-between border border-dashed border-slate-400 p-2 text-center"
          >
            <p className="line-clamp-2 text-sm leading-tight font-semibold">{l.name}</p>
            <p className="text-lg font-extrabold tabular-nums">{l.price}</p>
            <BarcodeSvg code={l.code} className="h-auto w-full max-w-48" />
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
