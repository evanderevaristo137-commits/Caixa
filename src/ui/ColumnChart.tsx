import { useId, useState } from 'react';
import { compactKz } from '../domain/reports';
import { formatKz } from '../lib/money';

export interface Column {
  key: string;
  /** Axis label ("seg.", "8", "nov."). */
  label: string;
  /** Tooltip and table label ("seg., 08/11"). */
  title: string;
  valueCents: number;
  /** Extra line for the tooltip and the table (e.g. "23 vendas"). */
  detail?: string;
  isCurrent?: boolean;
}

// Geometry in SVG units; the chart scales to the card's width.
const W = 340;
const PLOT_H = 140;
const TOP = 18;
const AXIS_H = 18;
const LEFT = 42;
// Room on the right for the last column's value label.
const RIGHT = 14;
const BAR_MAX = 24;
const GAP = 2;
const RADIUS = 4;
// Single series: one hue (validated against the white card), recessive grid and ink.
const BAR = '#059669';
const BAR_HOVER = '#047857';
const GRID = '#e2e8f0';
const INK_MUTED = '#475569';
const INK = '#0f172a';

/** A clean round step for 2 gridlines above zero. */
function niceMax(max: number): number {
  if (max <= 0) return 100_000;
  const raw = max / 2;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  return step * 2;
}

/** Column with a 4px rounded top and a square base. */
function columnPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(RADIUS, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * Sales per day or month as columns. Each column answers on tap, hover or keyboard focus;
 * the biggest and the current column carry their value; "Ver tabela" lists every value.
 */
export function ColumnChart({ columns, label, tableLabel }: { columns: Column[]; label: string; tableLabel: string }) {
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const id = useId();
  const max = niceMax(Math.max(0, ...columns.map((c) => c.valueCents)));
  const slot = (W - LEFT - RIGHT) / columns.length;
  const barW = Math.max(2, Math.min(BAR_MAX, slot - GAP));
  const y = (v: number) => TOP + PLOT_H - (v / max) * PLOT_H;
  const maxIndex = columns.reduce((best, c, i) => (c.valueCents > columns[best]!.valueCents ? i : best), 0);
  const labelEvery = columns.length > 12 ? 5 : 1;
  const shown = active ?? null;
  const tip = shown === null ? null : columns[shown]!;

  return (
    <figure className="m-0">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${TOP + PLOT_H + AXIS_H}`} className="block h-auto w-full" role="group" aria-labelledby={`${id}-t`}>
          <title id={`${id}-t`}>{label}</title>
          {[0, max / 2, max].map((v) => (
            <g key={v}>
              <line x1={LEFT} x2={W - RIGHT} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={1} />
              <text x={LEFT - 4} y={y(v) + 3} textAnchor="end" fontSize={9} fill={INK_MUTED} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {compactKz(v)}
              </text>
            </g>
          ))}
          {columns.map((c, i) => {
            const x = LEFT + i * slot + (slot - barW) / 2;
            const h = (c.valueCents / max) * PLOT_H;
            const showValue = c.valueCents > 0 && (i === maxIndex || c.isCurrent);
            return (
              <g key={c.key}>
                {h > 0 && <path d={columnPath(x, y(c.valueCents), barW, h)} fill={shown === i ? BAR_HOVER : BAR} />}
                {showValue && (
                  <text x={x + barW / 2} y={y(c.valueCents) - 4} textAnchor="middle" fontSize={9} fontWeight={600} fill={INK}>
                    {compactKz(c.valueCents)}
                  </text>
                )}
                {(i % labelEvery === 0 || i === columns.length - 1) && (
                  <text
                    x={LEFT + i * slot + slot / 2}
                    y={TOP + PLOT_H + 13}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight={c.isCurrent ? 700 : 400}
                    fill={c.isCurrent ? INK : INK_MUTED}
                  >
                    {c.label}
                  </text>
                )}
                {/* The whole slot is the hit target: much bigger than the bar. */}
                <rect
                  x={LEFT + i * slot}
                  y={TOP}
                  width={slot}
                  height={PLOT_H}
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-label={`${c.title}: ${formatKz(c.valueCents)}${c.detail ? `, ${c.detail}` : ''}`}
                  onPointerEnter={() => setActive(i)}
                  onPointerLeave={() => setActive((a) => (a === i ? null : a))}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive((a) => (a === i ? null : a))}
                  onClick={() => setActive(i)}
                  className="cursor-pointer outline-none focus-visible:stroke-amber-500 focus-visible:stroke-2"
                />
              </g>
            );
          })}
        </svg>
        {tip && (
          <div
            className="pointer-events-none absolute top-0 right-0 rounded-lg bg-slate-900 px-2.5 py-1.5 text-white shadow"
            aria-hidden="true"
          >
            <p className="text-base font-bold">{formatKz(tip.valueCents)}</p>
            <p className="text-xs text-slate-200">
              {tip.title}
              {tip.detail ? ` · ${tip.detail}` : ''}
            </p>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => setTable((v) => !v)}
        aria-expanded={table}
        className="mt-1 min-h-11 text-sm font-semibold text-brand-700"
      >
        {table ? `− ${tableLabel}` : `+ ${tableLabel}`}
      </button>
      {table && (
        <table className="mt-1 w-full text-sm">
          <tbody>
            {columns.map((c) => (
              <tr key={c.key} className="border-t border-slate-100">
                <td className="py-1.5">{c.title}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums">{formatKz(c.valueCents)}</td>
                <td className="py-1.5 text-right text-slate-600 tabular-nums">{c.detail ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  );
}
