import { ALL_CATEGORIES, categoriesOf, NO_CATEGORY, type CategoryFilter } from '../domain/categories';
import { comparePt } from '../domain/ranking';
import type { Product } from '../domain/types';
import { t } from '../i18n/pt-AO';

type Listed = Pick<Product, 'category' | 'subcategory' | 'archivedAt'>;

/**
 * The filter to apply. A category (or subcategory) that no longer exists (renamed, last product
 * archived) falls back to every product (or the whole category) instead of an empty list.
 */
export function activeFilter(products: Listed[], chosen: CategoryFilter): CategoryFilter {
  const category = activeCategory(products, chosen.category);
  if (category === null || category === NO_CATEGORY || chosen.sub === null) return { category, sub: null };
  const inside = products.filter((p) => !p.archivedAt && p.category === category);
  const exists = chosen.sub === NO_CATEGORY ? inside.some((p) => !p.subcategory) : inside.some((p) => p.subcategory === chosen.sub);
  return exists ? { category, sub: chosen.sub } : { category, sub: null };
}

function activeCategory(products: Listed[], chosen: string | null): string | null {
  if (chosen === null) return null;
  if (chosen === NO_CATEGORY) return products.some((p) => !p.category && !p.archivedAt) ? NO_CATEGORY : null;
  return categoriesOf(products).includes(chosen) ? chosen : null;
}

const chip = (on: boolean, small = false) =>
  `${small ? 'min-h-11 px-3' : 'min-h-11 px-4'} shrink-0 rounded-full border-2 text-sm font-semibold whitespace-nowrap ${
    on
      ? small
        ? 'border-brand-700 bg-brand-100 text-brand-900'
        : 'border-brand-700 bg-brand-700 text-white'
      : 'border-slate-300 bg-white text-slate-800 active:bg-slate-100'
  }`;

/**
 * "Todas", one chip per category and "Sem categoria"; once a category is chosen, a second row with
 * its subcategories (and "Sem subcategoria"). A row is not shown when it would not filter anything.
 */
export function CategoryChips({
  products,
  value,
  onChange,
  className = '',
}: {
  products: Listed[];
  value: CategoryFilter;
  onChange: (filter: CategoryFilter) => void;
  className?: string;
}) {
  const categories = categoriesOf(products);
  const uncategorised = products.some((p) => !p.category && !p.archivedAt);
  const options: (string | null)[] = [null, ...categories, ...(uncategorised ? [NO_CATEGORY] : [])];
  // "Todas" plus at least two groups, otherwise every chip would show the same products.
  if (options.length < 3) return null;

  const inside =
    value.category && value.category !== NO_CATEGORY ? products.filter((p) => !p.archivedAt && p.category === value.category) : [];
  const subs = [...new Set(inside.flatMap((p) => (p.subcategory ? [p.subcategory] : [])))].sort(comparePt);
  const subOptions: (string | null)[] = [null, ...subs, ...(inside.some((p) => !p.subcategory) ? [NO_CATEGORY] : [])];

  return (
    <div className={`space-y-2 ${className}`}>
      <div role="group" aria-label={t.categories.filter} className="flex gap-2 overflow-x-auto">
        {options.map((c) => (
          <button
            key={c ?? '*'}
            type="button"
            aria-pressed={value.category === c}
            onClick={() => onChange(c === null ? ALL_CATEGORIES : { category: c, sub: null })}
            className={chip(value.category === c)}
          >
            {c === null ? t.categories.all : c === NO_CATEGORY ? t.categories.none : c}
          </button>
        ))}
      </div>
      {subOptions.length >= 3 && (
        <div role="group" aria-label={t.categories.filterSub} className="flex gap-2 overflow-x-auto">
          {subOptions.map((s) => (
            <button
              key={s ?? '*'}
              type="button"
              aria-pressed={value.sub === s}
              onClick={() => onChange({ category: value.category, sub: s })}
              className={chip(value.sub === s, true)}
            >
              {s === null ? t.categories.allSubs : s === NO_CATEGORY ? t.categories.noSub : s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
