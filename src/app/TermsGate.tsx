import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from './context';
import { TERMS_VERSION, type LegalDocId } from '../legal/documents';
import { t } from '../i18n/pt-AO';
import { Button } from '../ui/kit';
import { LegalDocSheet } from '../screens/settings/LegalDocSheet';
import { Modal } from '../ui/modal';

/**
 * Before the shop's own data is used, the Terms of use and the Privacy policy must be accepted
 * (again whenever their version changes). The demo needs no acceptance: its data is fictitious.
 */
export function TermsGate() {
  const { store, mode, setMode, showToast } = useApp();
  const accepted = useLiveQuery(() => store.legal.accepted(), [store]);
  const [reading, setReading] = useState<LegalDocId | null>(null);
  const [busy, setBusy] = useState(false);
  // undefined = still loading: show nothing rather than flash the gate.
  if (mode !== 'store' || accepted === undefined || accepted?.version === TERMS_VERSION) return null;

  const accept = async () => {
    setBusy(true);
    try {
      await store.legal.accept(TERMS_VERSION);
      showToast(t.legal.accepted);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal className="fixed inset-0 z-40 overflow-y-auto bg-slate-50" aria-labelledby="terms-title">
      <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center gap-4 p-5">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="h-16 w-16" />
        <h1 id="terms-title" className="text-2xl font-extrabold">
          {t.legal.gateTitle}
        </h1>
        <p className="text-lg text-slate-700">{t.legal.gateIntro}</p>
        <ul className="space-y-2">
          {t.legal.gatePoints.map((p) => (
            <li key={p} className="flex items-start gap-2">
              <svg
                viewBox="0 0 24 24"
                className="mt-0.5 h-5 w-5 shrink-0 text-brand-700"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                aria-hidden="true"
              >
                <path d="m5 12 5 5L20 7" />
              </svg>
              <span>{p}</span>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" className="text-sm" onClick={() => setReading('termos')}>
            {t.legal.readTerms}
          </Button>
          <Button variant="secondary" className="text-sm" onClick={() => setReading('privacidade')}>
            {t.legal.readPrivacy}
          </Button>
        </div>
        <Button big className="w-full" disabled={busy} onClick={() => void accept()}>
          {t.legal.accept}
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => void setMode('demo')}>
          {t.legal.demoOnly}
        </Button>
      </div>
      {reading && <LegalDocSheet id={reading} onClose={() => setReading(null)} />}
    </Modal>
  );
}
