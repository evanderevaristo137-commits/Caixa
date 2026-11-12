import { useCallback, useRef, useState } from 'react';

/**
 * For buttons that save something. While one save is running the other taps are ignored, so a
 * double tap (common on slow phones, where saving takes a moment) never records the same thing twice.
 * `busy` is for disabling the button; the check itself does not wait for the screen to redraw.
 */
export function useBusy() {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (action: () => unknown): Promise<void> => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);
  return [busy, run] as const;
}
