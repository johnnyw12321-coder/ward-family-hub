/**
 * Minimal RFC 4180 CSV writer. Cells that could be interpreted as formulas by
 * spreadsheet apps (=, +, -, @, tab, CR) are prefixed with an apostrophe to
 * prevent CSV injection — except plain numbers, which stay numeric.
 */
export type CsvCell = string | number | boolean | null | undefined;

const NUMERIC = /^-?\d+(\.\d+)?$/;

export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s) && !NUMERIC.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(header: string[], rows: CsvCell[][]): string {
  // BOM so Excel opens UTF-8 correctly (e.g. names with accents).
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
