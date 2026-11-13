import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { LEGAL_DOCS, type LegalDocId } from '../../legal/documents';
import { t } from '../../i18n/pt-AO';
import { formatDate } from '../../lib/dates';
import { Button, Card } from '../../ui/kit';
import { LegalDocSheet } from './LegalDocSheet';

/** Terms of use, privacy, pilot and credit-for-stock conditions, always at hand. */
export function LegalCard() {
  const { store, mode } = useApp();
  const accepted = useLiveQuery(() => store.legal.accepted(), [store]);
  const [open, setOpen] = useState<LegalDocId | null>(null);
  return (
    <Card className="space-y-2">
      <h3 className="text-lg font-bold">{t.legal.title}</h3>
      <p className="text-sm text-slate-600">{t.legal.hint}</p>
      {mode === 'store' && accepted?.at && (
        <p className="rounded-lg bg-brand-50 p-2 text-sm text-brand-800">{t.legal.acceptedOn(formatDate(accepted.at), accepted.version)}</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {LEGAL_DOCS.map((d) => (
          <Button key={d.id} variant="secondary" className="text-sm" onClick={() => setOpen(d.id)}>
            {t.legal.docs[d.id]}
          </Button>
        ))}
      </div>
      {open && <LegalDocSheet id={open} onClose={() => setOpen(null)} />}
    </Card>
  );
}
