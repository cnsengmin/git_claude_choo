import { readFileSync } from "node:fs";

/** Parse RFC 4180 CSV text (quoted fields, doubled quotes, CRLF or LF) into rows keyed by header. */
export function parseCsv(text: string): Record<string, string>[] {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && body[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...data] = rows;
  if (!header) return [];
  return data
    .filter((r) => r.length > 1 || r[0] !== "")
    .map((r) => Object.fromEntries(header.map((name, j) => [name, r[j] ?? ""])));
}

export function readCsv(path: string) {
  return parseCsv(readFileSync(path, "utf8"));
}

export function toNumber(value: string) {
  if (value === "") return Number.NaN;
  return Number(value);
}

export function splitCodes(value: string) {
  return value ? value.split("|").filter(Boolean) : [];
}
