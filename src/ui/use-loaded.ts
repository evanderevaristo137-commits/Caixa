import { useEffect, useState } from 'react';

/**
 * Loads data once, and again when `deps` change, without following later changes.
 * For reports, which read thousands of sales and need not move while they are open:
 * following every record read (useLiveQuery) is slow on cheap phones. Live screens keep useLiveQuery.
 */
export function useLoaded<T>(load: () => Promise<T>, deps: readonly unknown[]): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    let cancelled = false;
    void load().then((v) => {
      if (!cancelled) setValue(v);
    });
    return () => {
      cancelled = true;
    };
    // The caller lists what the load depends on, as with useLiveQuery.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
