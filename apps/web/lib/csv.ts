// CSV for the pipeline export (PRD F1.10). RFC 4180 quoting, CRLF line ends, and a guard against
// spreadsheet formula injection: a cell that starts with = + - @ (or a tab/CR) gets a leading
// apostrophe, so a job title like "=HYPERLINK(...)" opens as text in Excel or Sheets.

export type CsvCell = string | number | null | undefined;

export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: CsvCell[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
