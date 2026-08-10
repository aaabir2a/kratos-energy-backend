// Minimal RFC-4180 CSV writer. Values are quoted only when they need to be,
// and embedded quotes are doubled.
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s: string;
  if (value instanceof Date) s = value.toISOString();
  else if (typeof value === 'boolean') s = value ? 'Yes' : 'No';
  else s = String(value);

  // Guard against CSV formula injection when the file is opened in Excel.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;

  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCell).join(',')];
  for (const row of rows) lines.push(row.map(escapeCell).join(','));
  // BOM so Excel reads UTF-8 (names/addresses with accents) correctly.
  return '﻿' + lines.join('\r\n');
}
