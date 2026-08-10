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

// RFC-4180 reader: handles quoted fields, embedded commas/newlines and doubled
// quotes. Returns raw rows (first row is the header).
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } // escaped quote
        else quoted = false;
      } else cell += ch;
      continue;
    }

    if (ch === '"') { quoted = true; continue; }
    if (ch === ',') { row.push(cell); cell = ''; continue; }
    if (ch === '\r') continue; // handled by \n
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += ch;
  }
  // trailing cell / row (file may not end with a newline)
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }

  // Drop fully blank rows — trailing newlines are common in spreadsheet exports.
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}
