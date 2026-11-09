import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { categoriesOf } from '../../domain/categories';
import { t } from '../../i18n/pt-AO';
import { Field } from '../../ui/kit';

/** Category of a product: typed freely, or one of the shop's categories with a tap. */
export function CategoryField({ value, onChange }: { value: string; onChange: (category: string) => void }) {
  const { store } = useApp();
  const categories = useLiveQuery(() => store.products.list().then(categoriesOf), [store]) ?? [];
  const same = (c: string) => c.toLocaleLowerCase('pt') === value.trim().toLocaleLowerCase('pt');
  return (
    <div className="space-y-2">
      <Field
        label={t.categories.label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        hint={categories.length === 0 ? t.categories.hint : undefined}
        autoComplete="off"
        maxLength={40}
      />
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t.categories.suggestions}>
          {categories.slice(0, 12).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={same(c)}
              onClick={() => onChange(same(c) ? '' : c)}
              className={`min-h-11 rounded-full border-2 px-3 text-sm font-semibold ${
                same(c) ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white text-slate-800 active:bg-slate-100'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
