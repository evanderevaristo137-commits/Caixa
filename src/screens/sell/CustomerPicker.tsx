import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import type { Customer } from '../../domain/types';
import { t } from '../../i18n/pt-AO';
import { Button, Field, normalise } from '../../ui/kit';

/** Choose an existing fiado customer or create a new one in the same place. */
export function CustomerPicker({ selected, onSelect }: { selected?: string; onSelect: (c: Customer) => void }) {
  const { store } = useApp();
  const customers = useLiveQuery(() => store.customers.list(), [store]);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  const list = useMemo(() => {
    const q = normalise(query);
    return (customers ?? []).filter((c) => !q || normalise(c.name).includes(q));
  }, [customers, query]);

  const create = async () => {
    if (!name.trim()) return setError(t.products.nameRequired);
    const c = await store.customers.create(name, phone);
    setCreating(false);
    onSelect(c);
  };

  if (creating) {
    return (
      <div className="space-y-3">
        <Field
          label={t.sell.customerName}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={error}
          autoFocus
          autoComplete="off"
        />
        <Field
          label={t.sell.customerPhone}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          type="tel"
          inputMode="tel"
          autoComplete="off"
        />
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setCreating(false)}>
            {t.common.back}
          </Button>
          <Button className="flex-1" onClick={() => void create()}>
            {t.common.save}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.common.search}
          aria-label={t.common.search}
          className="min-h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-3 text-lg"
        />
        <Button variant="secondary" className="w-full" onClick={() => setCreating(true)}>
          + {t.sell.newCustomer}
        </Button>
      </div>
      <ul className="mt-2 max-h-56 overflow-y-auto">
        {list.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c)}
              className={`my-1 flex min-h-12 w-full items-center rounded-xl border-2 px-3 text-left text-lg ${selected === c.id ? 'border-brand-700 bg-brand-50 font-bold' : 'border-transparent bg-white'}`}
            >
              {c.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
