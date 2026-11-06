import { Fragment, useEffect, useState } from 'react';
import { useApp } from './app/context';
import { t } from './i18n/pt-AO';
import { SellScreen } from './screens/sell/SellScreen';

// All screens are in the main bundle on purpose: with lazy-loaded screens, a new version
// published while the app is open would delete the old screen files and break the next tap.
import CreditScreen from './screens/credit/CreditScreen';
import TodayScreen from './screens/today/TodayScreen';
import ProductsScreen from './screens/products/ProductsScreen';
import SettingsScreen from './screens/SettingsScreen';
import { UpdateBanner } from './app/UpdateBanner';

const TABS = ['sell', 'credit', 'today', 'products', 'settings'] as const;
type Tab = (typeof TABS)[number];

const ICONS: Record<Tab, string> = {
  sell: 'M3 3h2l2.4 12.2a2 2 0 0 0 2 1.8h8.2a2 2 0 0 0 2-1.6L21 8H6M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  credit: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  today: 'M3 3v18h18M7 15l4-4 3 3 6-7',
  products: 'M21 8 12 3 3 8v8l9 5 9-5V8ZM3 8l9 5 9-5M12 13v8',
  settings: 'M4 6h16M4 12h16M4 18h16',
};

function readTab(): Tab {
  const h = window.location.hash.replace('#/', '');
  return (TABS as readonly string[]).includes(h) ? (h as Tab) : 'sell';
}

export function App() {
  const { mode, toast } = useApp();
  const [tab, setTab] = useState<Tab>(readTab);

  useEffect(() => {
    const onHash = () => setTab(readTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (next: Tab) => {
    window.location.hash = `#/${next}`;
    window.scrollTo(0, 0);
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      {mode === 'demo' && (
        <div className="sticky top-0 z-30 bg-amber-400 px-4 py-1.5 text-center text-sm font-bold text-amber-950">{t.demoBanner}</div>
      )}
      <UpdateBanner />
      <main className="flex-1 pb-24">
        <Fragment key={mode}>
          {tab === 'sell' && <SellScreen />}
          {tab === 'credit' && <CreditScreen />}
          {tab === 'today' && <TodayScreen />}
          {tab === 'products' && <ProductsScreen />}
          {tab === 'settings' && <SettingsScreen />}
        </Fragment>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => go(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${tab === id ? 'text-brand-700' : 'text-slate-500'}`}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth={tab === id ? 2.5 : 2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={ICONS[id]} />
              </svg>
              {t.tabs[id]}
            </button>
          ))}
        </div>
      </nav>
      {toast && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-20 z-50 mx-auto max-w-md rounded-xl bg-slate-900 px-4 py-3 text-center font-semibold text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
