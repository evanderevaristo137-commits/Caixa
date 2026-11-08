import { barRuns, ean13Modules, isValidEan13 } from '../domain/barcode';

// Module grid of one EAN-13 symbol: quiet zones of 11 modules (left) and 7 (right) around 95 modules.
const LEFT = 11;
const WIDTH = LEFT + 95 + 7;
const BAR_H = 50;
const GUARD_H = 56;
const HEIGHT = GUARD_H + 10;
const isGuard = (x: number) => x < 3 || (x >= 45 && x < 50) || x >= 92;

/** An EAN-13 barcode drawn as SVG: sharp at any size and on paper. Nothing is drawn for an invalid code. */
export function BarcodeSvg({ code, className = '' }: { code: string; className?: string }) {
  if (!isValidEan13(code)) return null;
  const runs = barRuns(ean13Modules(code));
  const digit = { fontSize: 9, fontFamily: 'ui-monospace, monospace', fill: '#000' };
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={className}
      role="img"
      aria-label={`Código de barras ${code}`}
      shapeRendering="crispEdges"
    >
      <rect width={WIDTH} height={HEIGHT} fill="#fff" />
      {runs.map(([x, w]) => (
        <rect key={x} x={LEFT + x} y={0} width={w} height={isGuard(x) ? GUARD_H : BAR_H} fill="#000" />
      ))}
      <text x={LEFT - 2} y={HEIGHT - 1} textAnchor="end" {...digit}>
        {code[0]}
      </text>
      <text x={LEFT + 24} y={HEIGHT - 1} textAnchor="middle" letterSpacing={1.2} {...digit}>
        {code.slice(1, 7)}
      </text>
      <text x={LEFT + 71} y={HEIGHT - 1} textAnchor="middle" letterSpacing={1.2} {...digit}>
        {code.slice(7)}
      </text>
    </svg>
  );
}
