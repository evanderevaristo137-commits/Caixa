import { useEffect, useRef, useState, type HTMLAttributes } from 'react';

/** The windows open now, the top-most last: only that one keeps the focus. */
const open: HTMLElement[] = [];
let listening = false;
let backwards = false;

const CAN_FOCUS = 'a[href], button, input, select, textarea, summary, [tabindex], [contenteditable="true"]';

/** What Tab can reach inside a window, in order (shown and enabled only). */
function tabStops(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(CAN_FOCUS)).filter(
    (el) =>
      el.tabIndex >= 0 &&
      !el.hasAttribute('disabled') &&
      !(el instanceof HTMLInputElement && el.type === 'hidden') &&
      (typeof el.checkVisibility === 'function' ? el.checkVisibility() : el.getClientRects().length > 0),
  );
}

const lost = (el: Element | null) => !el || el === document.body;

/** Tab on the last stop goes to the first, and Shift+Tab on the first to the last. */
function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Tab') return;
  backwards = e.shiftKey;
  const top = open.at(-1);
  if (!top) return;
  const stops = tabStops(top);
  const active = document.activeElement;
  const first = stops[0];
  const last = stops.at(-1);
  if (!first || !last) {
    e.preventDefault();
    top.focus({ preventScroll: true });
  } else if (!top.contains(active)) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  } else if (e.shiftKey && (active === first || active === top)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

/** Anything else that takes the focus out of the top window (a radio group, a script) brings it back. */
function onFocusIn(e: FocusEvent) {
  const top = open.at(-1);
  if (!top || !(e.target instanceof Node) || top.contains(e.target)) return;
  const stops = tabStops(top);
  const next = backwards ? stops.at(-1) : stops[0];
  if (next) next.focus();
  else top.focus({ preventScroll: true });
}

/**
 * Keyboard and screen-reader focus for a window over the app: it goes into the window when it
 * opens (the reader announces its title), Tab never leaves it, and when it closes the focus goes
 * back to the button that opened it. A field with `autoFocus` inside keeps its focus.
 */
function useModalFocus() {
  const ref = useRef<HTMLDivElement>(null);
  // Read while rendering, before anything inside the window takes the focus.
  const [opener] = useState(() => (lost(document.activeElement) ? null : (document.activeElement as HTMLElement)));
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!listening) {
      document.addEventListener('keydown', onKeyDown, true);
      document.addEventListener('focusin', onFocusIn);
      listening = true;
    }
    open.push(el);
    if (!el.contains(document.activeElement)) el.focus({ preventScroll: true });
    return () => {
      const i = open.lastIndexOf(el);
      if (i >= 0) open.splice(i, 1);
      // Only when the focus went with the window: otherwise it was moved on purpose.
      const active = document.activeElement;
      if (!lost(active) && !el.contains(active)) return;
      const top = open.at(-1);
      if (opener?.isConnected && (!top || top.contains(opener))) opener.focus({ preventScroll: true });
      else top?.focus({ preventScroll: true });
    };
  }, [opener]);
  return ref;
}

type ModalProps = Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'tabIndex'> & { role?: 'dialog' | 'alertdialog' };

/**
 * A window over the app (a sheet, a question, a full screen): `role="dialog"`, `aria-modal`, and
 * the focus kept inside while it is open. Give it a name with `aria-label` or `aria-labelledby`.
 */
export function Modal({ role = 'dialog', className = '', children, ...rest }: ModalProps) {
  const ref = useModalFocus();
  return (
    <div ref={ref} role={role} aria-modal="true" tabIndex={-1} className={`outline-none ${className}`} {...rest}>
      {children}
    </div>
  );
}
