function parseCsvLine(line) {
  return line.split(',').map((c) => c.trim());
}

function dmyToISO(dmy) {
  if (!dmy) return '';
  const [d, m, y] = dmy.split('-');
  if (!d || !m || !y) return '';
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function parseNum(val) {
  const n = parseFloat(String(val || '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function extractPeriod(lines) {
  for (const line of lines) {
    const match = line.match(/From\s+(\d{2}-\d{2}-\d{4})\s+to\s+(\d{2}-\d{2}-\d{4})/i);
    if (match) {
      return {
        period_from: dmyToISO(match[1]),
        period_to: dmyToISO(match[2]),
        month_key: dmyToISO(match[1]).slice(0, 7),
      };
    }
  }
  return null;
}

function extractBusinessName(lines) {
  const first = parseCsvLine(lines[0] || '');
  return first[0] && !first[0].toLowerCase().includes('item report') ? first[0] : '';
}

function buildAnalysis(categories, items, summary) {
  const byRevenue = [...items].sort((a, b) => b.total - a.total);
  const byQty = [...items].sort((a, b) => b.qty - a.qty);
  const categoryChart = categories.map((c) => ({
    label: c.name,
    qty: c.qty,
    amount: c.total,
  })).sort((a, b) => b.amount - a.amount);

  return {
    summary,
    category_chart: categoryChart,
    top_by_revenue: byRevenue.slice(0, 10),
    top_by_qty: byQty.slice(0, 10),
    bottom_by_revenue: [...items].sort((a, b) => a.total - b.total).slice(0, 10),
    bottom_by_qty: [...items].sort((a, b) => a.qty - b.qty).slice(0, 10),
    all_items: byRevenue,
  };
}

export function parseCafeCsv(csvText, sourceFilename = '') {
  const normalized = String(csvText || '').replace(/^\uFEFF/, '');
  const lines = normalized.split(/\r?\n/).filter((l) => l.trim());

  const period = extractPeriod(lines);
  if (!period?.month_key) {
    throw new Error('Could not find report period in CSV. Expected line like: Item Report : From 01-06-2026 to 30-06-2026');
  }

  const business_name = extractBusinessName(lines);
  const categories = [];
  const items = [];
  let currentCategory = '';
  let summary = { total_qty: 0, total_amount: 0, max_qty: 0, max_amount: 0, min_qty: 0, min_amount: 0, avg_qty: 0, avg_amount: 0 };

  for (const line of lines) {
    const cols = parseCsvLine(line);
    const col0 = cols[0] || '';
    const col1 = cols[1] || '';

    if (col0 === 'Total' && col1 === '-') {
      summary = {
        total_qty: parseNum(cols[3]),
        total_amount: parseNum(cols[4]),
        max_qty: 0,
        max_amount: 0,
        min_qty: 0,
        min_amount: 0,
        avg_qty: 0,
        avg_amount: 0,
      };
      continue;
    }
    if (col0 === 'Max' && col1 === '-') {
      summary.max_qty = parseNum(cols[3]);
      summary.max_amount = parseNum(cols[4]);
      continue;
    }
    if (col0 === 'Min' && col1 === '-') {
      summary.min_qty = parseNum(cols[3]);
      summary.min_amount = parseNum(cols[4]);
      continue;
    }
    if (col0 === 'Avg' && col1 === '-') {
      summary.avg_qty = parseNum(cols[3]);
      summary.avg_amount = parseNum(cols[4]);
      continue;
    }
    if (col0 === 'Sub Total') {
      const qty = parseNum(cols[3]);
      const total = parseNum(cols[4]);
      const cat = categories.find((c) => c.name === currentCategory);
      if (cat) {
        cat.qty = qty;
        cat.total = total;
      }
      continue;
    }
    if (col0 === 'Category') continue;

    if (col0 && !col1) {
      currentCategory = col0;
      categories.push({ name: currentCategory, qty: 0, total: 0, items: [] });
      continue;
    }

    if (col1 && col1 !== '-') {
      const item = {
        category: currentCategory || 'Uncategorized',
        item: col1,
        code: cols[2] || '',
        qty: parseNum(cols[3]),
        total: parseNum(cols[4]),
      };
      items.push(item);
      const cat = categories.find((c) => c.name === item.category);
      if (cat) cat.items.push(item);
      else {
        categories.push({ name: item.category, qty: 0, total: 0, items: [item] });
      }
    }
  }

  if (!items.length) {
    throw new Error('No cafe items found in CSV');
  }

  if (!summary.total_qty) {
    summary.total_qty = items.reduce((s, i) => s + i.qty, 0);
  }
  if (!summary.total_amount) {
    summary.total_amount = items.reduce((s, i) => s + i.total, 0);
  }

  const analysis = buildAnalysis(categories, items, summary);

  return {
    business_name,
    source_filename: sourceFilename,
    ...period,
    categories,
    items,
    analysis,
  };
}

export function formatMonthLabel(monthKey) {
  if (!monthKey) return '';
  const [y, m] = monthKey.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[parseInt(m, 10) - 1] || m} ${y}`;
}
