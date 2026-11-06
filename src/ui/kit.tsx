import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { registerBackHandler } from './back';
import { formatKz } from '../lib/money';

type Variant = 'primary' | 'secondary' | 'danger' | 'dangerSolid' | 'ghost' | 'whatsapp';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white active:bg-brand-800 disabled:bg-slate-300 disabled:text-slate-500',
  secondary: 'bg-white text-slate-900 border-2 border-slate-300 active:bg-slate-100',
  danger: 'bg-white text-red-700 border-2 border-red-300 active:bg-red-50',
  dangerSolid: 'bg-red-700 text-white active:bg-red-800',
  ghost: 'bg-transparent text-brand-700 active:bg-brand-50',
  whatsapp: 'bg-[#1a8d4a] text-white active:bg-[#146f3a]',
};

export function Button({
  variant = 'primary',
  big = false,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; big?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={`${VARIANTS[variant]} ${big ? 'min-h-16 text-xl' : 'min-h-12 text-base'} rounded-xl px-4 font-semibold transition-colors ${className}`}
    />
  );
}

export function LinkButton({
  href,
  children,
  className = '',
  onClick,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <a
      href={href}
      onClick={onClick}
      target="_blank"
      rel="noopener noreferrer"
      className={`${VARIANTS.whatsapp} flex min-h-14 items-center justify-center gap-2 rounded-xl px-4 text-lg font-semibold ${className}`}
    >
      {children}
    </a>
  );
}

export function Field({
  label,
  error,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string | null; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
      <input
        {...props}
        className={`min-h-12 w-full rounded-xl border-2 bg-white px-3 text-lg ${error ? 'border-red-500' : 'border-slate-300'} focus:border-brand-700 focus:outline-none`}
      />
      {hint && !error && <span className="mt-1 block text-sm text-slate-500">{hint}</span>}
      {error && <span className="mt-1 block text-sm font-medium text-red-700">{error}</span>}
    </label>
  );
}

export function Money({ cents, className = '' }: { cents: number; className?: string }) {
  return <span className={`tabular-nums ${className}`}>{formatKz(cents)}</span>;
}

/** Bottom sheet: slides over the screen, easy to reach with one thumb. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const unregisterBack = registerBackHandler(() => close.current());
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      unregisterBack();
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="mx-auto flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl bg-slate-50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="min-h-12 min-w-12 rounded-full text-2xl text-slate-600 active:bg-slate-200"
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mx-4 my-8 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-6 text-center text-slate-600">
      <p className="text-base">{children}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-label="A carregar">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-200" />
      ))}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  const bg = /\bbg-/.test(className) ? '' : 'bg-white';
  return <div className={`rounded-2xl p-4 shadow-sm ${bg} ${className}`}>{children}</div>;
}

/** Accent-insensitive search helper. */
export function normalise(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
