import { formatMonthLabel } from './cafeCsv.js';
import { getCafeReportFromSqlite } from './cafeStore.js';

export function previousMonthKey(monthKey) {
  const [y, m] = String(monthKey).split('-').map(Number);
  if (!y || !m) return null;
  const d = new Date(y, m - 2, 1);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yy}-${mm}`;
}

function pctChange(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev === 0) {
    if (cur === 0) return 0;
    return null; // new / no baseline
  }
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

function delta(current, previous) {
  return Math.round(((Number(current) || 0) - (Number(previous) || 0)) * 100) / 100;
}

function itemKey(row) {
  return `${row.category || ''}||${row.item || ''}||${row.code || ''}`;
}

function indexItems(items = []) {
  const map = new Map();
  for (const row of items) {
    map.set(itemKey(row), row);
  }
  return map;
}

function indexCategories(categories = []) {
  const map = new Map();
  for (const row of categories) {
    map.set(row.name, row);
  }
  return map;
}

function buildInsights(current, previous, compare) {
  const positives = [];
  const drawbacks = [];
  const improve = [];

  const revPct = compare.summary.revenue.pct;
  const qtyPct = compare.summary.qty.pct;

  if (revPct == null) {
    positives.push('No previous-month cafe upload yet — this month is your baseline.');
    improve.push('Upload last month’s CSV so you can track growth every month.');
  } else if (revPct > 5) {
    positives.push(`Revenue is up ${revPct}% vs ${compare.previous_label}.`);
  } else if (revPct < -5) {
    drawbacks.push(`Revenue is down ${Math.abs(revPct)}% vs ${compare.previous_label}.`);
  } else {
    positives.push(`Revenue is roughly flat (${revPct}% vs ${compare.previous_label}).`);
  }

  if (qtyPct != null && qtyPct > 5) {
    positives.push(`Items sold (qty) up ${qtyPct}% — more customer visits or basket size.`);
  } else if (qtyPct != null && qtyPct < -5) {
    drawbacks.push(`Quantity sold down ${Math.abs(qtyPct)}% — fewer units moved.`);
  }

  if (compare.gainers?.length) {
    const top = compare.gainers[0];
    positives.push(`Biggest gainer: ${top.item} (+${formatMoney(top.delta)}). Push this item harder.`);
  }
  if (compare.losers?.length) {
    const top = compare.losers[0];
    drawbacks.push(`Biggest drop: ${top.item} (${formatMoney(top.delta)}). Check stock, taste, or price.`);
  }
  if (compare.new_items?.length) {
    positives.push(`${compare.new_items.length} new item(s) this month — test which ones stick.`);
  }
  if (compare.missing_items?.length) {
    drawbacks.push(`${compare.missing_items.length} item(s) sold last month but not this month.`);
    improve.push('Review discontinued / zero-sale items: bring back favourites or clear slow stock.');
  }

  const cats = compare.categories || [];
  const weakCats = cats.filter((c) => c.pct != null && c.pct < -10).slice(0, 3);
  const strongCats = cats.filter((c) => c.pct != null && c.pct > 10).slice(0, 3);
  for (const c of strongCats) {
    positives.push(`Category ${c.name} up ${c.pct}% — keep promo / visibility high.`);
  }
  for (const c of weakCats) {
    drawbacks.push(`Category ${c.name} down ${Math.abs(c.pct)}%.`);
    improve.push(`For ${c.name}: combo offers with turf bookings, sample trays, or peak-hour discounts.`);
  }

  // Always give actionable market tips
  improve.push('Bundle cafe with turf slots (e.g. match + cold drink) on WhatsApp / counter posters.');
  improve.push('Promote top sellers at peak evenings; move low sellers near the counter with a small deal.');
  improve.push('Track weekends vs weekdays next month — push staff to upsell during busy turf hours.');

  if (current?.analysis?.bottom_by_revenue?.length) {
    const low = current.analysis.bottom_by_revenue.slice(0, 3).map((r) => r.item).join(', ');
    improve.push(`Lowest revenue items now: ${low}. Cut, remake recipe, or run a clearance promo.`);
  }

  return {
    positives: unique(positives).slice(0, 8),
    drawbacks: unique(drawbacks).slice(0, 8),
    improve: unique(improve).slice(0, 8),
  };
}

function formatMoney(n) {
  const v = Number(n) || 0;
  const sign = v > 0 ? '+' : '';
  return `${sign}₹${Math.abs(v).toLocaleString('en-IN')}`;
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
}

/**
 * Compare cafe report for monthKey against previous calendar month (if uploaded).
 */
export async function buildCafeMonthCompare(monthKey) {
  const current = await getCafeReportFromSqlite(monthKey);
  if (!current) return null;

  const prevKey = previousMonthKey(monthKey);
  const previous = prevKey ? await getCafeReportFromSqlite(prevKey) : null;

  const curItems = current.items || current.analysis?.all_items || [];
  const prevItems = previous?.items || previous?.analysis?.all_items || [];
  const curMap = indexItems(curItems);
  const prevMap = indexItems(prevItems);

  const itemRows = [];
  const allKeys = new Set([...curMap.keys(), ...prevMap.keys()]);
  for (const key of allKeys) {
    const cur = curMap.get(key);
    const prev = prevMap.get(key);
    const curTotal = cur?.total || 0;
    const prevTotal = prev?.total || 0;
    const curQty = cur?.qty || 0;
    const prevQty = prev?.qty || 0;
    itemRows.push({
      category: cur?.category || prev?.category || '',
      item: cur?.item || prev?.item || '',
      code: cur?.code || prev?.code || '',
      current_qty: curQty,
      previous_qty: prevQty,
      qty_delta: delta(curQty, prevQty),
      current_total: curTotal,
      previous_total: prevTotal,
      total_delta: delta(curTotal, prevTotal),
      pct: pctChange(curTotal, prevTotal),
      status: !prev ? 'new' : !cur ? 'missing' : 'both',
    });
  }

  itemRows.sort((a, b) => Math.abs(b.total_delta) - Math.abs(a.total_delta));

  const catMapCur = indexCategories(current.categories || []);
  const catMapPrev = indexCategories(previous?.categories || []);
  const catNames = new Set([...catMapCur.keys(), ...catMapPrev.keys()]);
  const categories = [...catNames].map((name) => {
    const cur = catMapCur.get(name);
    const prev = catMapPrev.get(name);
    const curTotal = cur?.total || 0;
    const prevTotal = prev?.total || 0;
    return {
      name,
      current_total: curTotal,
      previous_total: prevTotal,
      delta: delta(curTotal, prevTotal),
      pct: pctChange(curTotal, prevTotal),
      current_qty: cur?.qty || 0,
      previous_qty: prev?.qty || 0,
    };
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const revenueCur = Number(current.grand_total) || 0;
  const revenuePrev = Number(previous?.grand_total) || 0;
  const qtyCur = Number(current.grand_qty) || 0;
  const qtyPrev = Number(previous?.grand_qty) || 0;

  const compare = {
    month_key: monthKey,
    label: current.label || formatMonthLabel(monthKey),
    previous_month_key: prevKey,
    previous_label: previous ? (previous.label || formatMonthLabel(prevKey)) : formatMonthLabel(prevKey),
    has_previous: Boolean(previous),
    summary: {
      revenue: {
        current: revenueCur,
        previous: revenuePrev,
        delta: delta(revenueCur, revenuePrev),
        pct: previous ? pctChange(revenueCur, revenuePrev) : null,
      },
      qty: {
        current: qtyCur,
        previous: qtyPrev,
        delta: delta(qtyCur, qtyPrev),
        pct: previous ? pctChange(qtyCur, qtyPrev) : null,
      },
      items: {
        current: curItems.length,
        previous: prevItems.length,
        delta: curItems.length - prevItems.length,
      },
      categories: {
        current: (current.categories || []).length,
        previous: (previous?.categories || []).length,
        delta: (current.categories || []).length - (previous?.categories || []).length,
      },
    },
    categories,
    gainers: itemRows.filter((r) => r.status === 'both' && r.total_delta > 0).slice(0, 10),
    losers: itemRows.filter((r) => r.status === 'both' && r.total_delta < 0).slice(0, 10),
    new_items: itemRows.filter((r) => r.status === 'new').slice(0, 15),
    missing_items: itemRows.filter((r) => r.status === 'missing').slice(0, 15),
    items: itemRows,
  };

  compare.insights = buildInsights(current, previous, compare);

  return {
    current,
    previous,
    compare,
  };
}

export function cafeCompareToCsv(payload) {
  const { compare } = payload;
  const lines = [];
  const esc = (v) => {
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  lines.push(['Metric', 'Current', 'Previous', 'Change', 'Change %'].map(esc).join(','));
  lines.push(['Revenue', compare.summary.revenue.current, compare.summary.revenue.previous, compare.summary.revenue.delta, compare.summary.revenue.pct ?? ''].map(esc).join(','));
  lines.push(['Qty', compare.summary.qty.current, compare.summary.qty.previous, compare.summary.qty.delta, compare.summary.qty.pct ?? ''].map(esc).join(','));
  lines.push([]);
  lines.push(['Category', 'Current Total', 'Previous Total', 'Delta', 'Pct'].map(esc).join(','));
  for (const c of compare.categories) {
    lines.push([c.name, c.current_total, c.previous_total, c.delta, c.pct ?? ''].map(esc).join(','));
  }
  lines.push([]);
  lines.push(['Status', 'Category', 'Item', 'Code', 'Current Qty', 'Previous Qty', 'Current Total', 'Previous Total', 'Delta', 'Pct'].map(esc).join(','));
  for (const r of compare.items) {
    lines.push([
      r.status, r.category, r.item, r.code,
      r.current_qty, r.previous_qty, r.current_total, r.previous_total, r.total_delta, r.pct ?? '',
    ].map(esc).join(','));
  }
  lines.push([]);
  lines.push(['Type', 'Insight'].map(esc).join(','));
  for (const t of compare.insights.positives) lines.push(['Positive', t].map(esc).join(','));
  for (const t of compare.insights.drawbacks) lines.push(['Drawback', t].map(esc).join(','));
  for (const t of compare.insights.improve) lines.push(['Improve', t].map(esc).join(','));

  return `\uFEFF${lines.join('\n')}`;
}

export function cafeReportItemsToCsv(report) {
  const items = report.items || report.analysis?.all_items || [];
  const esc = (v) => {
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [['Category', 'Item', 'Code', 'Qty', 'Total'].map(esc).join(',')];
  for (const row of items) {
    lines.push([row.category, row.item, row.code, row.qty, row.total].map(esc).join(','));
  }
  return `\uFEFF${lines.join('\n')}`;
}
