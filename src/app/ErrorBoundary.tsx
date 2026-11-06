import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from '../i18n/pt-AO';

/** Last line of defence: an unexpected error shows a recovery screen instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // Stays on the phone (no external error service in phase 1).
    console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-extrabold">{t.errors.title}</h1>
        <p className="text-lg text-slate-700">{t.errors.body}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-14 w-full rounded-xl bg-brand-700 px-4 text-xl font-semibold text-white active:bg-brand-800"
        >
          {t.errors.reload}
        </button>
      </div>
    );
  }
}
