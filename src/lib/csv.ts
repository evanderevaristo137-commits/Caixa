/** Spreadsheet files (CSV) that open straight in Excel in Portuguese. */

/** Kz with a decimal comma, no thousands separator, for spreadsheets. */
export const kzNumber = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

function csvCell(v: string | number): string {
  const s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number)[][]): string {
  // BOM so Excel opens accents correctly; ';' because Excel in Portuguese uses ',' for decimals.
  return '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
