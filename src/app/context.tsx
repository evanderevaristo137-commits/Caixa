import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CaixaDB, DB_NAMES, type DataMode } from '../data/db';
import { Store } from '../data/store';
import { FakePaymentProvider, type PaymentProvider } from '../providers/payment';
import { requestPersistentStorage } from '../lib/storage';
import { t } from '../i18n/pt-AO';
import { ensureFreshDemo, seedDemo } from '../data/demo-seed';
import type { DemoKind } from '../data/demo-profiles';
import { useBackgroundAlerts } from './use-background-alerts';
import { recordError } from '../lib/error-log';

const MODE_KEY = 'caixa.mode';

function readMode(): DataMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'demo' ? 'demo' : 'store';
  } catch {
    return 'store';
  }
}

const stores = new Map<DataMode, Store>();
function storeFor(mode: DataMode): Store {
  let s = stores.get(mode);
  if (!s) {
    s = new Store(new CaixaDB(DB_NAMES[mode]));
    stores.set(mode, s);
  }
  return s;
}

/** The real shop's data, whatever mode the screens are in (for checks that concern the shop, like the clock). */
export const realShopStore = () => storeFor('store');
/** The demonstration's data, whatever mode the screens are in (to know which example shop it holds). */
export const demoShopStore = () => storeFor('demo');

interface AppState {
  mode: DataMode;
  store: Store;
  payments: PaymentProvider;
  setMode: (mode: DataMode) => Promise<void>;
  resetDemo: () => Promise<void>;
  /** Fills the demonstration with another example shop and shows it. */
  setDemoKind: (kind: DemoKind) => Promise<void>;
  toast: string | null;
  showToast: (msg: string) => void;
}

const Ctx = createContext<AppState | null>(null);
const payments = new FakePaymentProvider();

export function AppProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<DataMode>(readMode);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 2500);
  }, []);

  const setMode = useCallback(async (next: DataMode) => {
    if (next === 'demo') await ensureFreshDemo(storeFor('demo').db);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* private mode: the choice just isn't remembered */
    }
    setModeState(next);
  }, []);

  // Safety net: any action that fails unexpectedly tells the user instead of failing silently,
  // and is kept in the error log on the phone.
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      recordError('promise', e.reason);
      showToast(t.errors.generic);
    };
    const onError = (e: ErrorEvent) => recordError('page', e.error ?? e.message);
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onError);
    };
  }, [showToast]);

  useBackgroundAlerts(storeFor('store'));

  // Ask Chrome to never clear our data when the phone runs out of space.
  useEffect(() => {
    void requestPersistentStorage();
  }, []);

  // Opening the app in demo mode on a new day renews the example data.
  useEffect(() => {
    if (mode !== 'demo') return;
    // A new day's demo starts again from the sample data (employees included): read them again.
    void ensureFreshDemo(storeFor('demo').db).then(() => storeFor('demo').staff.load());
  }, [mode]);

  const resetDemo = useCallback(async () => {
    await seedDemo(storeFor('demo').db);
    await storeFor('demo').staff.load();
  }, []);

  const setDemoKind = useCallback(
    async (kind: DemoKind) => {
      await seedDemo(storeFor('demo').db, new Date(), kind);
      await storeFor('demo').staff.load();
      await setMode('demo');
    },
    [setMode],
  );

  const value = useMemo(
    () => ({ mode, store: storeFor(mode), payments, setMode, resetDemo, setDemoKind, toast, showToast }),
    [mode, setMode, resetDemo, setDemoKind, toast, showToast],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}
