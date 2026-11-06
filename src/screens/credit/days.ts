/** Colour of the "há N dias" badge: grey up to a week, amber up to a month, red after. */
export function daysClass(days: number | undefined): string {
  if (days === undefined) return 'bg-slate-100 text-slate-600';
  if (days > 30) return 'bg-red-100 text-red-800';
  if (days > 7) return 'bg-amber-100 text-amber-900';
  return 'bg-slate-100 text-slate-700';
}
