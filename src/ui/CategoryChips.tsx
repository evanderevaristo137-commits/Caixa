import { categoriesOf, NO_CATEGORY } from '../domain/categories';
import type { Product } from '../domain/types';
import { t } from '../i18n/pt-AO';

/**
 * The filter to apply: null = every product. A category that no longer exists (renamed,
 * last product archived) falls back to every product instead of an empty list.
 */
export function activeCategory(products: Pick<Product, 'category' | 'archivedAt'>[], chosen: string | null): string | null {
  if (chosen === null) return null;
  if (chosen === NO_CATEGORY) return products.some((p) => !p.category) ? NO_CATEGORY : null;
  return categoriesOf(products).includes(chosen) ? chosen : null;
}

/** "Todas", one chip per category and "Sem categoria". Not shown when it would not filter anything. */
export function CategoryChips({
  products,
  value,
  onChange,
  className = '',
}: {
  products: Pick<Product, 'category' | 'archivedAt'>[];
  value: string | null;
  onChange: (category: string | null) => void;
  className?: string;
}) {
  const categories = categoriesOf(products);
  const uncategorised = products.some((p) => !p.category);
  const options: (string | null)[] = [null, ...categories, ...(uncategorised ? [NO_CATEGORY] : [])];
  // "Todas" plus at least two groups, otherwise every chip would show the same products.
  if (options.length < 3) return null;
  return (
    <div role="group" aria-label={t.categories.filter} className={`flex gap-2 overflow-x-auto ${className}`}>
      {options.map((c) => (
        <button
          key={c ?? '*'}
          type="button"
          aria-pressed={value === c}
          onClick={() => onChange(c)}
          className={`min-h-11 shrink-0 rounded-full border-2 px-4 text-sm font-semibold whitespace-nowrap ${
            value === c ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white text-slate-800 active:bg-slate-100'
          }`}
        >
          {c === null ? t.categories.all : c === NO_CATEGORY ? t.categories.none : c}
        </button>
      ))}
    </div>
  );
}
