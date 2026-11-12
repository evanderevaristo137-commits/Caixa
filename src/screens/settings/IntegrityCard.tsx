import { useState } from 'react';
import { useApp } from '../../app/context';
import type { IntegrityIssue } from '../../domain/integrity';
import { t } from '../../i18n/pt-AO';
import { Button, Card } from '../../ui/kit';
import { usePinGuard } from '../../ui/pin';
import { AppErrors } from './AppErrors';

function describe(issue: IntegrityIssue): string {
  switch (issue.kind) {
    case 'stock_mismatch':
      return t.integrity.stock(issue.name, issue.recorded, issue.computed);
    case 'sale_total_mismatch':
      return t.integrity.saleTotal(issue.number);
    case 'credit_without_customer':
      return t.integrity.creditNoCustomer(issue.number);
    case 'payment_without_customer':
      return t.integrity.paymentNoCustomer;
    case 'movement_without_product':
      return t.integrity.movementNoProduct;
    case 'duplicate_sale_number':
      return t.integrity.duplicateNumber(issue.number);
  }
}

/** "Verificar os dados": recomputes the numbers from the facts and fixes stock when needed. */
export function IntegrityCard() {
  const { store } = useApp();
  const guard = usePinGuard();
  const [result, setResult] = useState<{ issues: IntegrityIssue[]; sales: number; products: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const [issues, sales, products] = await Promise.all([store.integrity.check(), store.db.sales.count(), store.db.products.count()]);
      setResult({ issues, sales, products });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-bold">{t.integrity.title}</h2>
      <p className="text-sm text-slate-600">{t.integrity.hint}</p>
      <Button variant="secondary" className="w-full" disabled={busy} onClick={() => void run()}>
        {t.integrity.run}
      </Button>
      {result && result.issues.length === 0 && (
        <p role="status" className="rounded-lg bg-brand-50 p-2 font-semibold text-brand-800">
          ✓ {t.integrity.ok(result.sales, result.products)}
        </p>
      )}
      {result && result.issues.length > 0 && (
        <div role="alert" className="space-y-2 rounded-lg bg-red-50 p-3">
          <p className="font-semibold text-red-800">{t.integrity.found(result.issues.length)}</p>
          <ul className="space-y-2">
            {result.issues.map((issue, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-red-900">
                <span className="flex-1">{describe(issue)}</span>
                {issue.kind === 'stock_mismatch' && (
                  <Button
                    className="min-h-11 text-sm"
                    onClick={() =>
                      void guard(async () => {
                        await store.integrity.fixStock(issue.productId);
                        await run();
                      })
                    }
                  >
                    {t.integrity.fix}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <AppErrors />
    </Card>
  );
}
