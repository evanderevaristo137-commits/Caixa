import { useSyncExternalStore } from 'react';

/** Chrome's "install this app" event (not yet in TypeScript's DOM types). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  // We keep Chrome's own install banner and also remember the event for our "Instalar app" button.
  window.addEventListener('beforeinstallprompt', (e) => {
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** True when Chrome says the app can be installed right now. */
export function useCanInstall(): boolean {
  return useSyncExternalStore(subscribe, () => deferred !== null);
}

export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null;
  notify();
  await event.prompt();
  return (await event.userChoice).outcome === 'accepted';
}
