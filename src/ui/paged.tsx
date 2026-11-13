import { useState } from 'react';
import { t } from '../i18n/pt-AO';
import { Button } from './kit';

/**
 * Long lists drawn in parts: the first `page` items, and «Ver mais» for the next ones. Drawing
 * hundreds of rows at once is slow on cheap phones. When `resetKey` changes (a new search, another
 * category), the list starts again from the first part.
 */
export function usePaged<T>(items: T[], page: number, resetKey: unknown = null) {
  const [state, setState] = useState({ key: resetKey, shown: page });
  // A new search starts from the top (derived state, set while rendering: no extra effect).
  if (!Object.is(state.key, resetKey)) setState({ key: resetKey, shown: page });
  const shown = Object.is(state.key, resetKey) ? state.shown : page;
  return {
    visible: items.length > shown ? items.slice(0, shown) : items,
    /** How many are not drawn yet. */
    rest: Math.max(0, items.length - shown),
    more: () => setState((s) => ({ ...s, shown: s.shown + page })),
  };
}

/** «Ver mais N» under a list drawn in parts (nothing when everything is drawn). */
export function ShowMore({ rest, page, onClick, className = '' }: { rest: number; page: number; onClick: () => void; className?: string }) {
  if (rest <= 0) return null;
  return (
    <Button variant="secondary" className={`w-full ${className}`} onClick={onClick}>
      {t.common.showMore(Math.min(page, rest))}
    </Button>
  );
}
