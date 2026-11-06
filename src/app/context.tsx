import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CaixaDB, DB_NAMES, type DataMode } from '../data/db';
import { Store } from '../data/store';
import { FakePaymentProvider, type PaymentProvider } from '../providers/payment';
import { requestPersistentStorage } from '../lib/storage';
import { ensureFreshDemo, seedDemo } from '../data/demo-seed';

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

interface AppState {
  mode: DataMode;
  store: Store;
  payments: PaymentProvider;
  setMode: (mode: DataMode) => Promise<void>;
  resetDemo: () => Promise<void>;
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

  // Ask Chrome to never clear our data when the phone runs out of space.
  useEffect(() => {
    void requestPersistentStorage();
  }, []);

  // Opening the app in demo mode on a new day renews the example data.
  useEffect(() => {
    if (mode !== 'demo') return;
    void ensureFreshDemo(storeFor('demo').db);
  }, [mode]);

  const resetDemo = useCallback(async () => {
    await seedDemo(storeFor('demo').db);
  }, []);

  const value = useMemo(
    () => ({ mode, store: storeFor(mode), payments, setMode, resetDemo, toast, showToast }),
    [mode, setMode, resetDemo, toast, showToast],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}
