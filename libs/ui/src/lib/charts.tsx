import * as React from 'react';
import { cn } from './utils';

/**
 * Minimal chart primitives (plain div/SVG, no charting library) following the
 * dataviz skill's method: status colors for state, the categorical chart-1/2/3
 * tokens for series identity, thin marks with rounded data-ends, a 2px surface
 * gap between touching segments, and direct labels rather than color-only reads.
 */

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  className?: string;
}

/**
 * Horizontal bar chart — magnitude comparison. Bars grow from a single left
 * baseline with a square base and a rounded data-end; the value is always a
 * direct label outside the bar (never clipped, never hover-only).
 */
export function HorizontalBarChart({
  data,
  max,
  barClassName = 'bg-primary',
  formatValue = (v: number) => v.toLocaleString(),
  labelWidthClassName = 'w-24',
}: {
  data: BarDatum[];
  max?: number;
  barClassName?: string;
  formatValue?: (value: number) => string;
  labelWidthClassName?: string;
}) {
  const safeMax = Math.max(max ?? 0, ...data.map((d) => d.value), 1);

  return (
    <div className="space-y-2.5">
      {data.map((d) => {
        // A nonzero value never collapses to an invisible sliver — floor it to a
        // small but clearly visible width so every bar still reads as a bar.
        const pct = d.value > 0 ? Math.max((d.value / safeMax) * 100, 2) : 0;
        return (
          <div key={d.key} className="flex items-center gap-3">
            <span className={cn('shrink-0 truncate text-sm text-muted-foreground', labelWidthClassName)} title={d.label}>
              {d.label}
            </span>
            <div className="relative h-5 flex-1 rounded-sm bg-muted">
              <div
                className={cn('h-full rounded-r-[4px] transition-[width] duration-300 ease-out', d.className ?? barClassName)}
                style={{ width: `${pct}%` }}
                title={`${d.label}: ${formatValue(d.value)}`}
              />
            </div>
            <span className="w-14 shrink-0 text-right text-sm font-medium tabular-nums">{formatValue(d.value)}</span>
          </div>
        );
      })}
    </div>
  );
}

