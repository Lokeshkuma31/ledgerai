/**
 * Small SVG-path helpers for inline sparklines — pure geometry, no
 * dependency on a charting library. Used for compact per-card trend lines
 * where a full Recharts instance would be overkill; the larger charts
 * (cash flow, category donut) use components/ui/chart.tsx (Recharts).
 */

type Point = [number, number];

function toPoints(values: number[], width: number, height: number): Point[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const n = values.length;
  return values.map((v, i) => [
    n > 1 ? (i / (n - 1)) * width : width / 2,
    height - ((v - min) / range) * height,
  ]);
}

/** Catmull-Rom-ish smoothing, matching the reference design's spark curves. */
function smoothPath(points: Point[]): string {
  if (points.length < 2) {
    return points.map((p) => `M${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  }
  let d = `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i - 1] ?? points[i];
    const b = points[i];
    const c = points[i + 1];
    const e = points[i + 2] ?? c;
    const c1x = b[0] + (c[0] - a[0]) / 6;
    const c1y = b[1] + (c[1] - a[1]) / 6;
    const c2x = c[0] - (e[0] - b[0]) / 6;
    const c2y = c[1] - (e[1] - b[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${c[0].toFixed(1)} ${c[1].toFixed(1)}`;
  }
  return d;
}

export interface Sparkline {
  line: string;
  area: string;
}

/** Builds a smoothed line + filled-area path pair for a `width`x`height`
 * viewBox. Returns null paths when there isn't enough data to draw. */
export function buildSparkline(values: number[], width = 240, height = 56): Sparkline {
  const points = toPoints(values, width, height);
  if (points.length < 2) return { line: "", area: "" };
  const line = smoothPath(points);
  const area = `${line} L ${points[points.length - 1][0].toFixed(1)} ${height} L ${points[0][0].toFixed(1)} ${height} Z`;
  return { line, area };
}
