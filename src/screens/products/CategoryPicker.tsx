import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import {
  catalogCategory,
  catalogFor,
  categoryKey,
  categoryLabel,
  categoryTree,
  cleanCategory,
  searchCategories,
  subsFor,
  type CategoryGroup,
} from '../../domain/categories';
import { CATALOG } from '../../domain/catalog';
import { t } from '../../i18n/pt-AO';
import { registerBackHandler } from '../../ui/back';
import { Button, Field, Sheet } from '../../ui/kit';

export interface CategoryChoice {
  category: string;
  subcategory?: string;
}

const tp = t.categoryPicker;
const iconOf = (category: string) => catalogCategory(category)?.icon;
/** "peças toyota" → "Peças toyota": a name the shop writes starts with a capital letter. */
const named = (text: string) => {
  const c = cleanCategory(text);
  return c ? c.charAt(0).toLocaleUpperCase('pt') + c.slice(1) : undefined;
};
const big =
  'flex min-h-14 w-full items-center gap-2 rounded-xl border-2 border-slate-300 bg-white px-3 py-2 text-left font-semibold break-words hyphens-auto active:bg-slate-100';

/** The product's category and subcategory: shown as a button that opens «Escolher categoria». */
export function CategoryPicker({ value, onChange }: { value: CategoryChoice | null; onChange: (choice: CategoryChoice | null) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <p className="mb-1 block text-sm font-semibold text-slate-700">{t.categories.label}</p>
      <button type="button" onClick={() => setOpen(true)} className={big} aria-haspopup="dialog">
        {value && iconOf(value.category) && (
          <span aria-hidden="true" className="text-xl">
            {iconOf(value.category)}
          </span>
        )}
        <span className="min-w-0 flex-1">{value ? categoryLabel(value.category, value.subcategory) : tp.choose}</span>
        {value ? (
          <span className="text-sm text-brand-800">{tp.change}</span>
        ) : (
          <span aria-hidden="true" className="text-xl text-slate-500">
            ›
          </span>
        )}
      </button>
      {value && (
        <button type="button" onClick={() => onChange(null)} className="mt-1 min-h-11 px-1 text-sm font-semibold text-slate-600 underline">
          {tp.remove}
        </button>
      )}
      {open && (
        <CategorySheet
          initial={value?.category}
          onChoose={(choice) => {
            onChange(choice);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * «Escolher categoria»: the shop's own categories, those of its kind of shop and (on request) all
 * of them, as big buttons; then the subcategories of the one chosen. Or a search by any word.
 */
function CategorySheet({
  initial,
  onChoose,
  onClose,
}: {
  initial?: string;
  onChoose: (choice: CategoryChoice) => void;
  onClose: () => void;
}) {
  const { store } = useApp();
  const tree = useLiveQuery(() => store.products.list().then(categoryTree), [store]);
  const types = useLiveQuery(() => store.settings.get().then((s) => s.businessTypes ?? []), [store]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(initial ?? null);
  const [showAll, setShowAll] = useState(false);
  const [typing, setTyping] = useState(false);
  const [name, setName] = useState('');

  /** To the subcategories of a category, or back to the categories (null); «Outra…» starts closed. */
  const goTo = (next: string | null) => {
    setCategory(next);
    setTyping(false);
    setName('');
  };
  // While the subcategories are shown, Android's back button goes back to the categories.
  useEffect(() => (category ? registerBackHandler(() => goTo(null)) : undefined), [category]);

  const { groups, more } = useMemo(() => sections(tree ?? [], types ?? [], showAll), [tree, types, showAll]);
  const hits = useMemo(() => searchCategories(query, tree ?? []), [query, tree]);
  const own = named(query);

  const otherField = (label: string, use: (text: string) => void) => (
    <div className="space-y-2 rounded-xl bg-white p-3">
      <Field label={label} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="off" autoFocus />
      <Button className="w-full" disabled={!named(name)} onClick={() => use(named(name)!)}>
        {tp.use}
      </Button>
    </div>
  );

  return (
    <Sheet title={tp.title} onClose={onClose}>
      {category ? (
        <div className="space-y-3">
          <button type="button" onClick={() => goTo(null)} className="min-h-11 font-semibold text-brand-800">
            ‹ {tp.back}
          </button>
          <h3 className="flex items-center gap-2 text-lg font-bold">
            {iconOf(category) && <span aria-hidden="true">{iconOf(category)}</span>}
            {tp.subsTitle(category)}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {subsFor(category, tree ?? []).map((sub) => (
              <button key={sub} type="button" className={big} onClick={() => onChoose({ category, subcategory: sub })}>
                {sub}
              </button>
            ))}
            <button type="button" className={`${big} text-slate-700`} onClick={() => onChoose({ category })}>
              {tp.noSub}
            </button>
          </div>
          {typing ? (
            otherField(tp.otherSubLabel, (sub) => onChoose({ category, subcategory: sub }))
          ) : (
            <Button variant="secondary" className="w-full" onClick={() => setTyping(true)}>
              {tp.otherSub}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Field
            label={tp.search}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tp.searchHint}
            autoComplete="off"
          />
          {query.trim().length >= 2 ? (
            <div className="space-y-2">
              {hits.length === 0 && <p className="text-slate-600">{tp.noResults}</p>}
              {hits.map((h) => (
                <button
                  key={`${h.category}|${h.sub ?? ''}`}
                  type="button"
                  className={big}
                  onClick={() => (h.sub ? onChoose({ category: h.category, subcategory: h.sub }) : goTo(h.category))}
                >
                  {iconOf(h.category) && <span aria-hidden="true">{iconOf(h.category)}</span>}
                  <span>
                    {h.sub ? (
                      <>
                        <span className="block">{h.sub}</span>
                        <span className="block text-sm font-normal text-slate-600">{h.category}</span>
                      </>
                    ) : (
                      h.category
                    )}
                  </span>
                </button>
              ))}
              {own && !hits.some((h) => !h.sub && categoryKey(h.category) === categoryKey(own)) && (
                <Button variant="secondary" className="w-full" onClick={() => goTo(own)}>
                  {tp.create(own)}
                </Button>
              )}
            </div>
          ) : (
            <>
              {groups.map((g) => (
                <section key={g.title}>
                  <h3 className="mb-1 text-sm font-semibold text-slate-600">{g.title}</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {g.names.map((n) => (
                      <button key={n} type="button" className={big} aria-pressed={n === initial} onClick={() => goTo(n)}>
                        {iconOf(n) && (
                          <span aria-hidden="true" className="text-xl">
                            {iconOf(n)}
                          </span>
                        )}
                        <span className="min-w-0">{n}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
              {more && (
                <Button variant="secondary" className="w-full" onClick={() => setShowAll(true)}>
                  {tp.showAll}
                </Button>
              )}
              {typing ? (
                otherField(tp.otherLabel, (c) => goTo(c))
              ) : (
                <Button variant="secondary" className="w-full" onClick={() => setTyping(true)}>
                  {tp.other}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

/**
 * The groups of buttons: the shop's own categories; then the app's ones for its kind of shop (all of
 * them when it chose none); and, after «Ver todas», the others. A category shows once, in the first
 * group it fits. `more`: there are others to show.
 */
function sections(tree: readonly CategoryGroup[], types: readonly string[], showAll: boolean) {
  const seen = new Set<string>();
  const take = (names: string[]) => names.filter((n) => !seen.has(categoryKey(n)) && seen.add(categoryKey(n)));
  const groups: { title: string; names: string[] }[] = [];
  const own = take(tree.map((g) => g.name));
  if (own.length) groups.push({ title: tp.yours, names: own });
  const shop = take(catalogFor(types).map((c) => c.name));
  if (shop.length) groups.push({ title: types.length ? tp.forShop : tp.all, names: shop });
  if (types.length && showAll) {
    const rest = take(CATALOG.map((c) => c.name));
    if (rest.length) groups.push({ title: tp.others, names: rest });
  }
  return { groups, more: types.length > 0 && !showAll };
}
