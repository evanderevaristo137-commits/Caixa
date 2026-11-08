/**
 * Phone notifications for customers' payments. Without a server, Android runs our check in the
 * background (Periodic Background Sync, installed app only) at times it chooses.
 */
export type AlertPermission = NotificationPermission | 'unsupported';

const TAG = 'caixa-credit-alerts';
const TWELVE_HOURS = 12 * 60 * 60 * 1000;

interface PeriodicSyncRegistration extends ServiceWorkerRegistration {
  periodicSync?: { register(tag: string, options: { minInterval: number }): Promise<void> };
}

export function alertPermission(): AlertPermission {
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported';
  return Notification.permission;
}

/** Asks Android to run the background check about twice a day (silently ignored where unsupported). */
export async function registerPeriodicCheck(): Promise<void> {
  try {
    if (alertPermission() !== 'granted') return;
    const reg = (await navigator.serviceWorker.ready) as PeriodicSyncRegistration;
    if (!reg.periodicSync) return;
    const status = await navigator.permissions.query({ name: 'periodic-background-sync' as PermissionName });
    if (status.state === 'granted') await reg.periodicSync.register(TAG, { minInterval: TWELVE_HOURS });
  } catch {
    /* not available on this phone: the in-app alerts still work */
  }
}

export async function enableAlerts(): Promise<AlertPermission> {
  if (alertPermission() === 'unsupported') return 'unsupported';
  const result = await Notification.requestPermission();
  if (result === 'granted') await registerPeriodicCheck();
  return result;
}

export async function showNotification(title: string, body: string): Promise<boolean> {
  try {
    if (alertPermission() !== 'granted') return false;
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, { body, tag: TAG, icon: 'icon-192.png', data: { hash: '#/credit' } });
    return true;
  } catch {
    return false;
  }
}
