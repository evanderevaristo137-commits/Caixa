import { useId, useState, type ReactNode } from 'react';
import { ICON, LineIcon } from '../../ui/icons';

export type MoreSectionId = 'store' | 'money' | 'safety' | 'help';

const KEY = 'caixa.moreOpen';

function readOpen(fallback: MoreSectionId[]): MoreSectionId[] {
  try {
    const saved = sessionStorage.getItem(KEY);
    return saved ? (JSON.parse(saved) as MoreSectionId[]) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Which «Mais» sections are open. They stay as they were while the app is open (going to another
 * tab and back), so the owner never has to open the same section twice.
 */
export function useOpenSections(initial: MoreSectionId[]) {
  const [open, setOpen] = useState(() => new Set(readOpen(initial)));
  const toggle = (id: MoreSectionId) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        sessionStorage.setItem(KEY, JSON.stringify([...next]));
      } catch {
        // Without storage the sections simply start closed next time.
      }
      return next;
    });
  return [open, toggle] as const;
}

/**
 * One group of «Mais»: a big button with what is inside, and its cards below when it is open.
 * Closed sections are not drawn at all (faster on a cheap phone).
 */
export function MoreSection({
  icon,
  title,
  hint,
  open,
  onToggle,
  children,
}: {
  icon: string;
  title: string;
  hint: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const contentId = useId();
  return (
    <section className="space-y-3">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={onToggle}
          className={`flex min-h-16 w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-sm active:bg-slate-50 ${open ? 'ring-2 ring-brand-600' : ''}`}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <LineIcon d={icon} className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-bold">{title}</span>
            <span className="block text-sm text-slate-600">{hint}</span>
          </span>
          <LineIcon
            d={ICON.chevronDown}
            className={`h-6 w-6 text-slate-500 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </h2>
      {open && (
        <div id={contentId} className="space-y-3">
          {children}
        </div>
      )}
    </section>
  );
}
