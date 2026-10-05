import { useState } from 'react';

interface Datum {
  label: string;
  value: number;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** Gráfico de colunas de uma série (ex.: receita por mês). */
export function BarChart({ data, format, height = 240, ariaLabel }: {
  data: Datum[]; format: (v: number) => string; height?: number; ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = height, padL = 64, padR = 12, padT = 16, padB = 28;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const min = Math.min(0, ...data.map((d) => d.value));
  const range = max - min || 1;
  const y = (v: number) => padT + ((max - v) / range) * (H - padT - padB);
  const band = (W - padL - padR) / Math.max(1, data.length);
  const bw = Math.min(44, band * 0.6);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => min + t * range);

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className="chart__grid" />
            <text x={padL - 8} y={y(t)} className="chart__tick" textAnchor="end" dominantBaseline="middle">{format(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = padL + band * i + (band - bw) / 2;
          const top = y(Math.max(0, d.value));
          const h = Math.max(d.value === 0 ? 0 : 1, Math.abs(y(d.value) - y(0)));
          const r = Math.min(4, bw / 2, h);
          // barra com cantos arredondados apenas na extremidade do dado
          const path = d.value >= 0
            ? `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${top + h} Z`
            : `M${x},${y(0)} V${y(0) + h - r} Q${x},${y(0) + h} ${x + r},${y(0) + h} H${x + bw - r} Q${x + bw},${y(0) + h} ${x + bw},${y(0) + h - r} V${y(0)} Z`;
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)}>
              <rect x={padL + band * i} y={padT} width={band} height={H - padT - padB} fill="transparent" />
              <path d={path} className={`chart__bar ${d.value < 0 ? 'chart__bar--neg' : ''} ${hover === i ? 'is-hover' : ''}`} />
              <text x={padL + band * i + band / 2} y={H - 8} className="chart__tick" textAnchor="middle">{d.label}</text>
            </g>
          );
        })}
        <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} className="chart__axis" />
      </svg>
      {hover !== null && data[hover] && (
        <div className="chart__tip" style={{ left: `${((padL + band * hover + band / 2) / W) * 100}%` }}>
          <span>{data[hover].label}</span>
          <strong>{format(data[hover].value)}</strong>
        </div>
      )}
    </div>
  );
}

/** Barras horizontais para composição (ex.: despesas por categoria). */
export function HBarList({ data, format }: { data: Datum[]; format: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="hbars">
      {data.map((d) => (
        <div key={d.label} className="hbar" title={`${d.label}: ${format(d.value)}`}>
          <span className="hbar__label">{d.label}</span>
          <div className="hbar__track"><div className="hbar__fill" style={{ width: `${(d.value / max) * 100}%` }} /></div>
          <span className="hbar__value">{format(d.value)}</span>
        </div>
      ))}
    </div>
  );
}
