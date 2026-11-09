import { addDaysToDateString } from '../lib/dates';

/** Payments that fall due within this many days count as "soon". */
export const SOON_DAYS = 2;

/** One payment with a due date (a customer who owes, or a supplier the shop owes). */
export interface DueItem {
  /** "YYYY-MM-DD" */
  dueDate: string;
}

/** The digital payments alarm (credit for stock), as computed by the app on day `on`. */
export interface DigitalAlertInfo {
  /** "YYYY-MM-DD": the alarm covers the 7 complete days before it. */
  on: string;
  alarm: boolean;
  belowMinimum: boolean;
  shareBp: number;
  minShareBp?: number;
}

export interface DailyAlert {
  title: string;
  body: string;
  /** Screen opened by a tap. */
  hash: string;
}

const pct = (bp: number) => `${Math.round(bp / 100)}%`;

function dueText(items: DueItem[], today: string): string {
  const soonLimit = addDaysToDateString(today, SOON_DAYS);
  const overdue = items.filter((i) => i.dueDate < today).length;
  const dueToday = items.filter((i) => i.dueDate === today).length;
  const soon = items.filter((i) => i.dueDate > today && i.dueDate <= soonLimit).length;
  const parts: string[] = [];
  if (overdue) parts.push(`${overdue} em atraso`);
  if (dueToday) parts.push(dueToday === 1 ? '1 vence hoje' : `${dueToday} vencem hoje`);
  if (soon) parts.push(soon === 1 ? '1 vence nos próximos dias' : `${soon} vencem nos próximos dias`);
  return parts.join(' · ');
}

/**
 * The one notification of the day, from what the app prepared: customers' and suppliers'
 * payments by due date, and the digital payments alarm (trusted only when it was computed
 * today or yesterday). public/sw-alerts.js builds the same text with the app closed;
 * a test checks that both always say the same.
 */
export function dailyAlert(today: string, credit: DueItem[], suppliers: DueItem[], digital: DigitalAlertInfo | null): DailyAlert | null {
  const sections: { title: string; label: string; text: string; hash: string }[] = [];
  const customers = dueText(credit, today);
  if (customers) sections.push({ title: 'Pagamentos de clientes', label: 'Clientes', text: customers, hash: '#/credit' });
  const owed = dueText(suppliers, today);
  if (owed) sections.push({ title: 'Pagamentos a fornecedores', label: 'Fornecedores', text: owed, hash: '#/today' });
  const fresh = digital !== null && (digital.on === today || digital.on === addDaysToDateString(today, -1));
  if (fresh && digital.alarm) {
    const text =
      digital.belowMinimum && digital.minShareBp !== undefined
        ? `abaixo do mínimo do contrato: ${pct(digital.shareBp)} (mínimo ${pct(digital.minShareBp)})`
        : `desceram muito nos últimos 7 dias: ${pct(digital.shareBp)} dos recebimentos`;
    sections.push({ title: 'Pagamentos digitais', label: 'Pagamentos digitais', text, hash: '#/today' });
  }
  if (sections.length === 0) return null;
  if (sections.length === 1) {
    const only = sections[0]!;
    const body = only.text.charAt(0).toUpperCase() + only.text.slice(1);
    const tail = only.hash === '#/credit' ? 'Toque para ver e lembrar os clientes.' : 'Toque para ver.';
    return { title: only.title, body: `${body}. ${tail}`, hash: only.hash };
  }
  return { title: 'Avisos da loja', body: `${sections.map((x) => `${x.label}: ${x.text}`).join('. ')}. Toque para ver.`, hash: '#/today' };
}

/** What the background checker needs (stored on the phone only): one line per customer who owes. */
export interface BackgroundAlertItem {
  name: string;
  /** "YYYY-MM-DD" */
  dueDate: string;
}
