import { useState } from 'react';
import { useApp } from '../../app/context';
import { formatBpAsPercent, parsePercentToBp } from '../../domain/tax';
import { VAT_REGIMES, type Settings, type VatRegime } from '../../domain/types';
import { t } from '../../i18n/pt-AO';
import { invoiceExport, missingWith } from '../../integrations/invoice-request';
import { useLoaded } from '../../ui/use-loaded';
import { dateStamp } from '../../lib/download';
import { shareOrDownload } from '../../lib/share';
import { Button, Card, Field } from '../../ui/kit';

/** Optional shop data for certified invoicing (phase 3), what is still missing, and the export for the partner. */
export function InvoicingCard({ settings }: { settings: Settings }) {
  const { store, mode, showToast } = useApp();
  const [address, setAddress] = useState(settings.address ?? '');
  const [regime, setRegime] = useState<VatRegime>(settings.vatRegime ?? 'unknown');
  const [rate, setRate] = useState(settings.defaultTaxRateBp === undefined ? '' : formatBpAsPercent(settings.defaultTaxRateBp));
  const [error, setError] = useState<string | null>(null);
  // Read only when the section is opened, and stop at the first sale line without a rate: «Mais»
  // used to read every sale of the shop as soon as it opened.
  const [open, setOpen] = useState(false);
  const missing = useLoaded(
    async () => (open ? missingWith(settings, await store.sales.anyLineWithoutTax()) : undefined),
    [store, settings, open],
  );

  const save = async () => {
    const bp = parsePercentToBp(rate);
    if (bp === null) return setError(t.invoicing.rateInvalid);
    await store.settings.save({ address, vatRegime: regime, defaultTaxRateBp: bp });
    setError(null);
    showToast(t.settings.saved);
  };

  const exportForPartner = async () => {
    const [sales, customers] = await Promise.all([store.sales.list(), store.customers.list()]);
    const content = JSON.stringify(invoiceExport(sales, settings, customers, new Date()), null, 2);
    const prefix = mode === 'demo' ? 'caixa-demonstracao' : 'caixa';
    await shareOrDownload(`${prefix}-dados-facturacao-${dateStamp()}.txt`, content, 'text/plain', t.invoicing.export);
  };

  return (
    <Card>
      <details onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary className="min-h-11 cursor-pointer py-2 text-lg font-bold">{t.invoicing.title}</summary>
        <div className="mt-2 space-y-3">
          <p className="text-sm text-slate-600">{t.invoicing.hint}</p>
          {missing && missing.length > 0 ? (
            <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
              {t.invoicing.missingTitle} {missing.map((m) => t.invoicing.missing[m]).join(', ')}.
            </p>
          ) : (
            missing && <p className="rounded-lg bg-brand-50 p-2 text-sm font-semibold text-brand-800">{t.invoicing.ready}</p>
          )}
          <Field label={t.invoicing.address} value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" />
          <div>
            <p className="mb-1 text-sm font-semibold text-slate-700">{t.invoicing.regime}</p>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label={t.invoicing.regime}>
              {VAT_REGIMES.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={regime === r}
                  onClick={() => setRegime(r)}
                  className={`min-h-12 rounded-xl border-2 px-2 text-sm font-semibold ${regime === r ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white'}`}
                >
                  {t.invoicing.regimes[r]}
                </button>
              ))}
            </div>
          </div>
          <Field
            label={t.invoicing.defaultRate}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            inputMode="decimal"
            hint={t.invoicing.rateHint}
            error={error}
          />
          <Button className="w-full" onClick={() => void save()}>
            {t.common.save}
          </Button>
          <Button variant="secondary" className="w-full" onClick={() => void exportForPartner()}>
            {t.invoicing.export}
          </Button>
          <p className="text-sm text-slate-600">{t.invoicing.exportHint}</p>
        </div>
      </details>
    </Card>
  );
}
