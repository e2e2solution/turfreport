/** 0 = lowest (red), 1 = highest (green) */
export function computeValueScore(value, min, max) {
  const v = Number(value) || 0;
  const lo = Number(min) ?? 0;
  const hi = Number(max) ?? 0;
  if (hi <= lo) return 0.5;
  return Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
}

export function cafeYearValueRange(months, monthKey, currentTotal) {
  const year = monthKey?.slice(0, 4) || '';
  const totals = (months || [])
    .filter((m) => String(m.month_key || '').startsWith(year))
    .map((m) => Number(m.grand_total) || 0);
  if (currentTotal != null) totals.push(Number(currentTotal) || 0);
  if (!totals.length) return { min: 0, max: 0 };
  return { min: Math.min(...totals), max: Math.max(...totals) };
}

export function dailyMonthValueRange(reports, paymentDate, currentTotal) {
  const month = paymentDate?.slice(0, 7) || '';
  const totals = (reports || [])
    .filter((r) => String(r.payment_date || '').startsWith(month))
    .map((r) => Number(r.collection?.total) || 0);
  if (currentTotal != null) totals.push(Number(currentTotal) || 0);
  if (!totals.length) return { min: 0, max: 0 };
  return { min: Math.min(...totals), max: Math.max(...totals) };
}

const GREEN = [72, 187, 120];
const RED = [229, 62, 62];
const MID = [251, 191, 36];

function lerpRgb(a, b, t) {
  return a.map((c, i) => Math.round(c + (b[i] - c) * t));
}

function scoreToRgb(score, layerIndex) {
  const bias = layerIndex === 0 ? 0.12 : layerIndex === 2 ? -0.12 : 0;
  const t = Math.max(0, Math.min(1, score + bias));
  if (t >= 0.5) {
    const local = (t - 0.5) * 2;
    return lerpRgb(MID, GREEN, local);
  }
  const local = t * 2;
  return lerpRgb(RED, MID, local);
}

function lerpNum(a, b, t) {
  return a + (b - a) * t;
}

export function buildValueWaveLayers(score) {
  const opacities = [0.38, 0.48, 0.58];
  const lengths = [0.018, 0.014, 0.022];
  /* score 0 = shallow water at bottom; score 1 = high fill */
  const lowY = [0.8, 0.88, 0.95];
  const highY = [0.38, 0.48, 0.58];
  const lowAmp = [5, 7, 4];
  const highAmp = [14, 18, 10];

  return [0, 1, 2].map((i) => {
    const y = lerpNum(lowY[i], highY[i], score);
    const amp = lerpNum(lowAmp[i], highAmp[i], score);
    const [r, g, b] = scoreToRgb(score, i);
    return {
      amp,
      length: lengths[i],
      y,
      fill: `rgba(${r}, ${g}, ${b}, ${opacities[i]})`,
    };
  });
}

export function heroGradientForScore(score, variant) {
  const [r, g, b] = scoreToRgb(score, 1);
  const base = variant === 'cafe'
    ? [26, 74, 122]
    : [26, 54, 93];
  const mix = 0.35;
  const R = Math.round(base[0] + (r - base[0]) * mix);
  const G = Math.round(base[1] + (g - base[1]) * mix);
  const B = Math.round(base[2] + (b - base[2]) * mix);
  return `linear-gradient(165deg, rgb(${R},${G},${B}) 0%, #1a365d 55%, #1a202c 100%)`;
}
