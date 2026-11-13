import { useState } from 'react';
import { t } from '../../i18n/pt-AO';
import { formatKz } from '../../lib/money';
import { Button, Card, Money, Sheet } from '../../ui/kit';
import { CustomerSheet } from '../credit/CustomerSheet';
import { ProductSheet } from '../products/ProductSheet';
import { StockInsightsSheet } from '../products/StockInsightsSheet';
import type { BelowCost } from '../../domain/suggestions';
import { useSuggestions, type Suggestion } from './use-suggestions';

const pct = (bp: number) => `${Math.round(bp / 100)}%`;

function title(s: Suggestion): string {
  switch (s.kind) {
    case 'below_cost':
      return t.suggestions.belowCost(s.items.length);
    case 'lost':
      return t.suggestions.lost(s.items.length);
    case 'still':
      return t.suggestions.still(formatKz(s.valueCents), s.count);
    case 'weekday':
      return t.suggestions.weekday(t.suggestions.weekdays[s.weekday]!, pct(s.aboveBp));
  }
}

/**
 * «Sugestões para a loja» on «Hoje»: only what the data is enough to say (see domain/suggestions.ts).
 * Each line opens its detail; «Já vi» hides it for a week. Nothing to suggest: no card.
 */
export function SuggestionsCard({ below }: { below: BelowCost[] }) {
  const { list, hide } = useSuggestions(below);
  const [open, setOpen] = useState<string | null>(null);
  const current = list.find((s) => s.key === open);
  if (list.length === 0) return null;
  return (
    <Card>
      <h2 className="font-bold">{t.suggestions.title}</h2>
      <ul className="divide-y divide-slate-100">
        {list.map((s) => (
          <li key={s.key}>
            <button
              type="button"
              onClick={() => setOpen(s.key)}
              className="flex min-h-12 w-full items-center gap-3 py-2 text-left active:bg-slate-50"
            >
              <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full bg-brand-600" />
              <span className="min-w-0 flex-1 font-semibold">{title(s)}</span>
              <span aria-hidden="true" className="text-xl text-slate-400">
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>
      {current && (
        <SuggestionSheet
          suggestion={current}
          onSeen={() => {
            hide(current.key);
            setOpen(null);
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </Card>
  );
}

function SuggestionSheet({ suggestion: s, onSeen, onClose }: { suggestion: Suggestion; onSeen: () => void; onClose: () => void }) {
  const [product, setProduct] = useState<string | null>(null);
  const [customer, setCustomer] = useState<string | null>(null);
  const [still, setStill] = useState(false);
  return (
    <Sheet title={title(s)} onClose={onClose}>
      <div className="space-y-3">
        {s.kind === 'below_cost' && (
          <>
            <p className="text-slate-700">{t.suggestions.belowCostHint}</p>
            <ul className="divide-y divide-slate-100 rounded-xl bg-white">
              {s.items.map((b) => (
                <li key={b.product.id}>
                  <button
                    type="button"
                    onClick={() => setProduct(b.product.id)}
                    className="flex min-h-14 w-full flex-col px-3 py-2 text-left active:bg-slate-50"
                  >
                    <span className="font-semibold">{b.product.name}</span>
                    <span className="text-sm text-red-700">
                      {t.suggestions.belowCostLine(formatKz(b.priceCents), formatKz(b.costCents))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {s.kind === 'lost' && (
          <>
            <p className="text-slate-700">{t.suggestions.lostHint}</p>
            <ul className="divide-y divide-slate-100 rounded-xl bg-white">
              {s.items.map((l) => (
                <li key={l.customer.id}>
                  <button
                    type="button"
                    onClick={() => setCustomer(l.customer.id)}
                    className="flex min-h-14 w-full flex-col px-3 py-2 text-left active:bg-slate-50"
                  >
                    <span className="font-semibold">{l.customer.name}</span>
                    <span className="text-sm text-slate-600">{t.suggestions.lostLine(l.purchases, l.daysAway)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {s.kind === 'still' && (
          <>
            <p className="text-slate-700">{t.suggestions.stillHint}</p>
            <p className="text-2xl font-extrabold">
              <Money cents={s.valueCents} />
            </p>
            <Button className="w-full" onClick={() => setStill(true)}>
              {t.suggestions.stillOpen}
            </Button>
          </>
        )}
        {s.kind === 'weekday' && <p className="text-slate-700">{t.suggestions.weekdayHint}</p>}
        <Button variant="secondary" className="w-full" onClick={onSeen}>
          {t.suggestions.seen}
        </Button>
      </div>
      {product && <ProductSheet productId={product} onClose={() => setProduct(null)} />}
      {customer && <CustomerSheet customerId={customer} onClose={() => setCustomer(null)} />}
      {still && <StockInsightsSheet initialView="still" onClose={() => setStill(false)} />}
    </Sheet>
  );
}
