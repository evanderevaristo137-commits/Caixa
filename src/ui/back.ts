/**
 * Android's back button should close the open sheet, not leave the app (and lose the sale).
 * While a sheet is open we keep one extra history entry (the "guard"); pressing back
 * consumes it and closes the top-most sheet. We never call history.back() ourselves,
 * which avoids races when one sheet closes and another opens in the same moment.
 */
const handlers: Array<() => void> = [];
let listening = false;

function isGuard(): boolean {
  const s: unknown = window.history.state;
  return typeof s === 'object' && s !== null && (s as { caixaSheet?: unknown }).caixaSheet === true;
}

function ensureGuard() {
  if (!isGuard()) window.history.pushState({ caixaSheet: true }, '');
}

function onPopState() {
  const top = handlers.pop();
  if (top) top();
  if (handlers.length > 0) ensureGuard();
}

/** On a computer, Escape behaves like the back button: it closes only the top-most sheet. */
function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || handlers.length === 0) return;
  e.preventDefault();
  handlers.pop()!();
}

/** Registers a "close" callback for the back button. Returns the unregister function. */
export function registerBackHandler(fn: () => void): () => void {
  if (!listening) {
    window.addEventListener('popstate', onPopState);
    window.addEventListener('keydown', onKeyDown);
    listening = true;
  }
  handlers.push(fn);
  ensureGuard();
  return () => {
    const i = handlers.lastIndexOf(fn);
    if (i >= 0) handlers.splice(i, 1);
  };
}
