import { useMemo, useRef, useState } from 'react';
import type { SeriesPoint } from './api/marketingApi';

/**
 * Sends, opens and clicks per day.
 *
 * One y-axis for all three: they are all counts of messages, so they belong on
 * the same scale — and a second axis would let two unrelated shapes be read as
 * if they crossed.
 *
 * Every series is direct-labelled at its right-hand end as well as coloured, so
 * identity never rests on colour alone.
 */

const SERIES = [
  { key: 'sent', label: 'Sent', color: 'var(--chart-1)' },
  { key: 'opened', label: 'Opened', color: 'var(--chart-2)' },
  { key: 'clicked', label: 'Clicked', color: 'var(--chart-3)' },
] as const;

const W = 760;
const H = 240;
const PAD = { top: 16, right: 68, bottom: 26, left: 40 };

export function TrendChart({ data }: { data: SeriesPoint[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const { max, x, y, paths, ticks, labelY } = useMemo(() => {
    const highest = Math.max(1, ...data.flatMap((d) => [d.sent, d.opened, d.clicked]));
    // Round the top up to something a person would choose, so the gridlines
    // land on readable numbers. The floor of 2 keeps the midpoint a whole
    // number: these are counts of messages, and a "0.5" gridline is nonsense.
    const step = Math.pow(10, Math.floor(Math.log10(highest))) / 2 || 1;
    const top = Math.max(2, Math.ceil(highest / step) * step);

    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const xAt = (i: number) => PAD.left + (data.length <= 1 ? 0 : (i / (data.length - 1)) * plotW);
    const yAt = (v: number) => PAD.top + plotH - (v / top) * plotH;

    const line = (key: 'sent' | 'opened' | 'clicked') =>
      data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(d[key]).toFixed(1)}`).join(' ');

    // Direct labels are the encoding that stops identity resting on colour, so
    // they have to stay readable when two series finish at nearly the same
    // value. Lay them out top-down and push each one clear of the last.
    const MIN_GAP = 13;
    const last = data[data.length - 1]!;
    // `at` is the text baseline, so it sits level with the line it names.
    const placed = SERIES.map((s) => ({ key: s.key, at: yAt(last[s.key]) + 4 }))
      .sort((a, b) => a.at - b.at)
      .reduce<{ key: string; at: number }[]>((acc, item) => {
        const previous = acc[acc.length - 1];
        const at = previous && item.at - previous.at < MIN_GAP ? previous.at + MIN_GAP : item.at;
        acc.push({ key: item.key, at });
        return acc;
      }, []);

    return {
      max: top,
      x: xAt,
      y: yAt,
      paths: { sent: line('sent'), opened: line('opened'), clicked: line('clicked') },
      ticks: [0, top / 2, top],
      labelY: Object.fromEntries(placed.map((p) => [p.key, p.at])) as Record<string, number>,
    };
  }, [data]);

  if (!data.length) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Nothing sent in this period.</p>;
  }

  const point = hover === null ? null : data[hover];

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    // The SVG scales to its container, so map the pointer back through the
    // rendered width rather than assuming viewBox units.
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const plotW = W - PAD.left - PAD.right;
    const ratio = (px - PAD.left) / plotW;
    const i = Math.round(ratio * (data.length - 1));
    setHover(i >= 0 && i < data.length ? i : null);
  }

  const dayLabel = (iso: string) =>
    new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: 'auto' }}
        role="img"
        aria-label="Messages sent, opened and clicked per day"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* Recessive grid — present enough to read a value against, quiet
            enough to stay behind the data. */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke="currentColor"
              strokeWidth={1}
              className="text-border"
            />
            <text
              x={PAD.left - 8}
              y={y(t) + 4}
              textAnchor="end"
              className="fill-muted-foreground text-[11px] tabular-nums"
            >
              {t >= 1000 ? `${Math.round(t / 100) / 10}k` : t}
            </text>
          </g>
        ))}

        {/* First and last day only: a label per day would be unreadable. */}
        <text x={PAD.left} y={H - 6} className="fill-muted-foreground text-[11px]">
          {dayLabel(data[0]!.day)}
        </text>
        <text x={W - PAD.right} y={H - 6} textAnchor="end" className="fill-muted-foreground text-[11px]">
          {dayLabel(data[data.length - 1]!.day)}
        </text>

        {hover !== null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={PAD.top}
            y2={H - PAD.bottom}
            stroke="currentColor"
            strokeWidth={1}
            className="text-muted-foreground/40"
          />
        )}

        {SERIES.map((s) => (
          <path
            key={s.key}
            d={paths[s.key]}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* A ring in the surface colour keeps overlapping markers legible. */}
        {hover !== null &&
          SERIES.map((s) => (
            <circle
              key={s.key}
              cx={x(hover)}
              cy={y(data[hover]![s.key])}
              r={4}
              fill={s.color}
              stroke="hsl(var(--card))"
              strokeWidth={2}
            />
          ))}

        {/* Direct labels at the line ends — the secondary encoding that means
            identity is never carried by colour alone. */}
        {SERIES.map((s) => {
          const at = labelY[s.key]!;
          const actual = y(data[data.length - 1]![s.key]);
          return (
            <g key={s.key}>
              {/* A nudged label needs a leader back to its line, or it points
                  at the wrong series. */}
              {Math.abs(at - actual) > 1 && (
                <line
                  x1={W - PAD.right}
                  x2={W - PAD.right + 5}
                  y1={actual}
                  y2={at - 4}
                  stroke={s.color}
                  strokeWidth={1}
                />
              )}
              <text x={W - PAD.right + 8} y={at} className="fill-muted-foreground text-[11px]">
                {s.label}
              </text>
            </g>
          );
        })}
      </svg>

      {point && (
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
          <p className="mb-1 font-medium">{dayLabel(point.day)}</p>
          <dl className="space-y-0.5">
            {SERIES.map((s) => (
              <div key={s.key} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                <dt className="text-muted-foreground">{s.label}</dt>
                <dd className="ml-auto font-medium tabular-nums">{point[s.key]}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-center gap-4">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        <span className="text-xs text-muted-foreground/70">peak {max}</span>
      </div>
    </div>
  );
}
