import { useEffect, useState } from 'react';
import { t } from '../i18n/pt-AO';

const CHECK_EVERY_MS = 60 * 60 * 1000;

/**
 * When a new version has been installed in the background, offer to reload.
 * Never reloads by itself: the shopkeeper may be in the middle of a sale.
 */
export function UpdateBanner() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // On the very first visit the service worker takes control too; that is not an update.
    const hadController = !!navigator.serviceWorker.controller;
    const onControllerChange = () => {
      if (hadController) setReady(true);
    };
    let lastCheck = Date.now();
    // Phones keep the app open for days: look for a new version when it comes back to the front (at most hourly).
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastCheck < CHECK_EVERY_MS) return;
      lastCheck = Date.now();
      navigator.serviceWorker
        .getRegistration()
        .then((r) => r?.update())
        .catch(() => undefined);
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!ready) return null;
  return (
    <div role="status" className="flex items-center justify-between gap-3 bg-brand-800 px-4 py-2 text-white">
      <span className="text-sm font-semibold">{t.update.available}</span>
      <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-lg bg-white px-4 font-bold text-brand-800">
        {t.update.action}
      </button>
    </div>
  );
}
