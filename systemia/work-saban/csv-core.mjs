import { createHash } from 'node:crypto';

export const MAX_CSV_BYTES = 256 * 1024;
export const MAX_CSV_ROWS = 2000;
export const sha256 = value => 'sha256:' + createHash('sha256').update(value).digest('hex');

export function parseSalesCsv(csvText) {
  if (typeof csvText !== 'string') throw new Error('csv_text_required');
  if (Buffer.byteLength(csvText, 'utf8') > MAX_CSV_BYTES) throw new Error('csv_too_large');
  const input = csvText.replace(/^\uFEFF/, '');
  const records = [];
  let fields = [], field = '', quoted = false, afterQuote = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; afterQuote = true; }
      } else { field += ch; }
      continue;
    }
    if (afterQuote && ![',', '\r', '\n'].includes(ch)) throw new Error('csv_invalid_quote_termination');
    if (ch === '"') {
      if (field || afterQuote) throw new Error('csv_invalid_quote_position');
      quoted = true;
    } else if (ch === ',') {
      fields.push(field); field = ''; afterQuote = false;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      fields.push(field);
      if (fields.some(f => f !== '')) records.push(fields);
      fields = []; field = ''; afterQuote = false;
      if (records.length > MAX_CSV_ROWS + 1) throw new Error('csv_too_many_rows');
    } else { field += ch; }
  }
  if (quoted) throw new Error('csv_unclosed_quote');
  fields.push(field);
  if (fields.some(f => f !== '')) records.push(fields);
  if (records.length < 3) throw new Error('csv_needs_two_rows');
  if (records.length > MAX_CSV_ROWS + 1) throw new Error('csv_too_many_rows');

  const headers = records[0].map(f => f.trim().toLowerCase());
  if (new Set(headers).size !== headers.length) throw new Error('csv_duplicate_header');
  const monthIndex = headers.indexOf('month'), revenueIndex = headers.indexOf('revenue');
  if (monthIndex < 0 || revenueIndex < 0) throw new Error('csv_requires_month_and_revenue');
  const rows = records.slice(1).map((values, index) => {
    if (values.length !== headers.length) throw new Error('csv_wrong_column_count_row_' + (index + 2));
    const month = values[monthIndex].trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('csv_invalid_month_row_' + (index + 2));
    const revenue = values[revenueIndex].trim();
    if (!/^-?\d{1,9}(?:\.\d{1,2})?$/.test(revenue)) throw new Error('csv_invalid_revenue_row_' + (index + 2));
    const negative = revenue.startsWith('-');
    const [whole, fractional = ''] = (negative ? revenue.slice(1) : revenue).split('.');
    const cents = (negative ? -1n : 1n) * (BigInt(whole) * 100n + BigInt((fractional + '00').slice(0, 2)));
    return { month, cents };
  });
  return { rows, source_sha256: sha256(Buffer.from(csvText, 'utf8')) };
}

export function usd(centsString) {
  const value = BigInt(centsString);
  const abs = value < 0n ? -value : value;
  return (value < 0n ? '-$' : '$') + (abs / 100n).toLocaleString('en-US') + '.' + String(abs % 100n).padStart(2, '0');
}

export function calculateRevenue(rows) {
  const groups = new Map();
  for (const row of rows) groups.set(row.month, (groups.get(row.month) ?? 0n) + row.cents);
  const months = [...groups.keys()].sort();
  if (months.length < 2) throw new Error('csv_requires_two_distinct_months');
  const totals = months.map(month => ({ month, cents: groups.get(month).toString(), display: usd(groups.get(month)) }));
  const previous = groups.get(months.at(-2));
  const current = groups.get(months.at(-1));
  const delta = current - previous;
  const percent_change = previous === 0n ? null : Math.round(Number(delta) / Math.abs(Number(previous)) * 1000) / 10;
  return {
    row_count: rows.length,
    monthly: totals,
    previous_month: months.at(-2),
    current_month: months.at(-1),
    previous_revenue: usd(previous),
    current_revenue: usd(current),
    change_cents: delta.toString(),
    change_display: usd(delta),
    percent_change,
  };
}
