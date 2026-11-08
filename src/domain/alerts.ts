import type { CreditAlerts } from './credit';

/** Text of the phone notification about customers' payments (null when there is nothing to say). */
export function alertNotificationText(a: Pick<CreditAlerts, 'overdue' | 'today' | 'soon'>): { title: string; body: string } | null {
  const parts: string[] = [];
  if (a.overdue.length) parts.push(`${a.overdue.length} em atraso`);
  if (a.today.length) parts.push(a.today.length === 1 ? '1 vence hoje' : `${a.today.length} vencem hoje`);
  if (a.soon.length) parts.push(a.soon.length === 1 ? '1 vence nos próximos dias' : `${a.soon.length} vencem nos próximos dias`);
  if (parts.length === 0) return null;
  return { title: 'Pagamentos de clientes', body: `${parts.join(' · ')}. Toque para ver e lembrar os clientes.` };
}

/** What the background checker needs (stored on the phone only): one line per customer who owes. */
export interface BackgroundAlertItem {
  name: string;
  /** "YYYY-MM-DD" */
  dueDate: string;
}
