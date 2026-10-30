#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

function argsFrom(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

const args = argsFrom(process.argv.slice(2));
const inputPath = args.input;
const gridSize = Number(args["grid-size"] ?? 100);
const year = Number(args.year);
const indicatorId = String(args.indicator ?? "").trim();
const unit = String(args.unit ?? "").trim();
const idField = args["id-field"] ? String(args["id-field"]) : null;
const valueField = args["value-field"] ? String(args["value-field"]) : null;
const outDir = resolve(String(args["out-dir"] ?? `data/generated/sgis-${gridSize}m-${year}-${indicatorId.replace(/[^a-z0-9.-]/gi, "-")}`));

if (!inputPath || ![100, 500, 1000].includes(gridSize) || !Number.isInteger(year) || !indicatorId || !unit) {
  console.error("Usage: npm run data:sgis-grid -- --input <file> --grid-size 100|500|1000 --year YYYY --indicator <id> --unit <unit> [--id-field <header>] [--value-field <header>] [--out-dir <dir>]");
  process.exit(1);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function cleanText(text) {
  return text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function splitQuoted(line, delimiter) {
  const out = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      out.push(value.trim());
      value = "";
    } else value += char;
  }
  out.push(value.trim());
  return out;
}

function detectDelimiter(line) {
  return ["\t", ",", "|"]
    .map((delimiter) => ({ delimiter, count: splitQuoted(line, delimiter).length }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
}

function normalizeHeader(value) {
  return String(value).toLowerCase().replace(/[\s_()\-./]/g, "");
}

function resolveHeader(headers, requested, aliases) {
  if (requested) {
    const exact = headers.find((header) => header === requested);
    if (exact) return exact;
    const normalized = headers.find((header) => normalizeHeader(header) === normalizeHeader(requested));
    if (normalized) return normalized;
    throw new Error(`Requested header not found: ${requested}`);
  }
  const aliasSet = new Set(aliases.map(normalizeHeader));
  return headers.find((header) => aliasSet.has(normalizeHeader(header))) ?? null;
}

function parseNumber(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return { value: null, reason: "blank" };
  if (/^(na|n\/a|null|bsca|-|x|\*)$/i.test(value)) return { value: null, reason: "suppressed-or-missing" };
  const cleaned = value.replace(/,/g, "");
  const number = Number(cleaned);
  if (!Number.isFinite(number)) return { value: null, reason: "non-numeric" };
  return { value: number, reason: null };
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

const bytes = await readFile(resolve(inputPath));
const text = cleanText(new TextDecoder("utf-8").decode(bytes));
const lines = text.split("\n").filter((line) => line.trim().length > 0);
if (lines.length < 2) throw new Error("Input does not contain a header and data rows");

const delimiter = detectDelimiter(lines[0]);
const headers = splitQuoted(lines[0], delimiter);
const gridHeader = resolveHeader(headers, idField, ["gid", "gridid", "gridcd", "grid100mcd", "grid500mcd", "grid1kcd", "boundarycd", "경계코드", "격자코드"]);
const valueHeader = resolveHeader(headers, valueField, ["val", "value", "값", "인구수", "사업체수", "종사자수"]);
if (!gridHeader || !valueHeader) {
  throw new Error(`Unable to resolve grid/value headers. headers=${headers.join(", ")}`);
}

const gridIndex = headers.indexOf(gridHeader);
const valueIndex = headers.indexOf(valueHeader);
const rows = [];
const seen = new Set();
const duplicateIds = new Set();
const nullReasons = new Map();

for (const line of lines.slice(1)) {
  const cells = splitQuoted(line, delimiter);
  const nativeGridId = String(cells[gridIndex] ?? "").trim();
  if (!nativeGridId) continue;
  if (seen.has(nativeGridId)) duplicateIds.add(nativeGridId);
  seen.add(nativeGridId);
  const parsed = parseNumber(cells[valueIndex]);
  if (parsed.reason) nullReasons.set(parsed.reason, (nullReasons.get(parsed.reason) ?? 0) + 1);
  rows.push({
    atlas_grid_id: `sgis:${gridSize}m:${nativeGridId}`,
    native_grid_id: nativeGridId,
    grid_size_m: gridSize,
    source_crs: "EPSG:5179",
    reference_year: year,
    indicator_id: indicatorId,
    value: parsed.value,
    unit,
    source_id: "sgis",
  });
}

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, "statistics.json"), JSON.stringify({
  schemaVersion: "0.1.0",
  rows,
}));

const csvHeader = ["atlas_grid_id", "native_grid_id", "grid_size_m", "source_crs", "reference_year", "indicator_id", "value", "unit", "source_id"];
const csv = [
  csvHeader.join(","),
  ...rows.map((row) => csvHeader.map((key) => csvEscape(row[key])).join(",")),
].join("\n");
await writeFile(join(outDir, "statistics.csv"), csv);

const manifest = {
  schemaVersion: "0.1.0",
  generatedAt: new Date().toISOString(),
  source: {
    provider: "SGIS",
    file: basename(inputPath),
    sha256: sha256(bytes),
    originalHeaders: headers,
    delimiter: delimiter === "\t" ? "tab" : delimiter,
    sourceCrs: "EPSG:5179",
  },
  mapping: {
    gridIdField: gridHeader,
    valueField: valueHeader,
    gridSizeM: gridSize,
    year,
    indicatorId,
    unit,
  },
  validation: {
    inputRows: lines.length - 1,
    normalizedRows: rows.length,
    uniqueNativeGridIds: seen.size,
    duplicateNativeGridIds: duplicateIds.size,
    nullValues: rows.filter((row) => row.value === null).length,
    nullReasons: Object.fromEntries(nullReasons),
  },
  policy: {
    preserveNativeGridId: true,
    atlasGridId: `sgis:${gridSize}m:<native-id>`,
    confidentiality: "Missing/suppressed values remain null and are never silently converted to zero.",
    geometry: "This artifact contains statistics only. Join boundary geometry separately on native_grid_id.",
  },
};
await writeFile(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
