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
const hPath = args.h;
const bPath = args.b;
const mixPath = args.mix;
const snapshot = String(args.date ?? "").replace(/[^0-9]/g, "");
const outDir = resolve(String(args["out-dir"] ?? `data/generated/kik-${snapshot || "snapshot"}`));

if (!hPath || !bPath || !mixPath || snapshot.length !== 8) {
  console.error("Usage: npm run data:kik -- --h <KIKcd_H.YYYYMMDD> --b <KIKcd_B.YYYYMMDD> --mix <KIKmix.YYYYMMDD> --date YYYYMMDD [--out-dir <dir>]");
  process.exit(1);
}

const decoder = new TextDecoder("euc-kr");

function splitLines(bytes) {
  const rows = [];
  let start = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    if (bytes[i] !== 0x0a) continue;
    let end = i;
    if (end > start && bytes[end - 1] === 0x0d) end -= 1;
    rows.push(bytes.subarray(start, end));
    start = i + 1;
  }
  if (start < bytes.length) rows.push(bytes.subarray(start));
  return rows;
}

function field(line, start, end) {
  return decoder.decode(line.subarray(start, end)).trim();
}

function dateIso(value) {
  const digits = String(value ?? "").replace(/[^0-9]/g, "");
  if (digits.length !== 8) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseH(bytes) {
  return splitLines(bytes).slice(1).filter((line) => line.length).map((line) => ({
    code: field(line, 0, 10),
    sidoName: field(line, 11, 41),
    sigunguName: field(line, 42, 72),
    eupMyeonDongName: field(line, 73, 103),
    createdAt: field(line, 104, 112),
    abolishedAt: field(line, 113, 121),
  }));
}

function parseB(bytes) {
  return splitLines(bytes).slice(1).filter((line) => line.length).map((line) => ({
    code: field(line, 0, 10),
    sidoName: field(line, 11, 41),
    sigunguName: field(line, 42, 72),
    eupMyeonDongName: field(line, 73, 103),
    dongRiName: field(line, 104, 134),
    createdAt: field(line, 135, 143),
    abolishedAt: field(line, 144, 152),
  }));
}

function parseMix(bytes) {
  return splitLines(bytes).slice(1).filter((line) => line.length).map((line) => ({
    adminCode: field(line, 0, 10),
    sidoName: field(line, 11, 41),
    sigunguName: field(line, 42, 72),
    eupMyeonDongName: field(line, 73, 103),
    legalCode: field(line, 104, 114),
    dongRiName: field(line, 115, 145),
    createdAt: field(line, 146, 154),
    abolishedAt: field(line, 155, 163),
  }));
}

function regionKind(row) {
  if (row.eupMyeonDongName) return "admin-dong";
  if (/^\d{2}0{8}$/.test(row.code)) return "sido";
  return "sigungu";
}

function displayName(row) {
  return row.eupMyeonDongName || row.sigunguName || row.sidoName;
}

function legalDisplayName(row) {
  if (row.eupMyeonDongName && row.dongRiName) return `${row.eupMyeonDongName} ${row.dongRiName}`;
  return row.dongRiName || row.eupMyeonDongName || row.sigunguName || row.sidoName;
}

function parentFinder(rows) {
  const byCode = new Map(rows.map((row) => [row.code, row]));
  return (row) => {
    for (let cut = 9; cut >= 1; cut -= 1) {
      const candidateCode = `${row.code.slice(0, cut)}${"0".repeat(10 - cut)}`;
      if (candidateCode === row.code) continue;
      const candidate = byCode.get(candidateCode);
      if (!candidate) continue;
      // This prevents false prefix parents across special/renamed top-level code families.
      if (candidate.sidoName !== row.sidoName) continue;
      return candidateCode;
    }
    return null;
  };
}

function legalKind(row) {
  if (row.eupMyeonDongName || row.dongRiName) return "legal-dong";
  if (/^\d{2}0{8}$/.test(row.code)) return "sido";
  return "sigungu";
}

function compactJson(value) {
  return JSON.stringify(value);
}

const [hBytes, bBytes, mixBytes] = await Promise.all([
  readFile(resolve(hPath)),
  readFile(resolve(bPath)),
  readFile(resolve(mixPath)),
]);

const hRows = parseH(hBytes);
const bRows = parseB(bBytes);
const mixRows = parseMix(mixBytes);

const findAdminParent = parentFinder(hRows);
const adminNodes = [];
const adminOrphans = [];
for (const row of hRows) {
  const kind = regionKind(row);
  const parentCode = kind === "sido" ? null : findAdminParent(row);
  const normalized = {
    code: row.code,
    name: displayName(row),
    kind,
    parentCode,
    createdAt: dateIso(row.createdAt),
    abolishedAt: dateIso(row.abolishedAt),
    sidoName: row.sidoName,
    sigunguName: row.sigunguName || null,
    eupMyeonDongName: row.eupMyeonDongName || null,
  };
  if (kind !== "sido" && !parentCode) adminOrphans.push(normalized);
  adminNodes.push(normalized);
}

const findLegalParent = parentFinder(bRows);
const legalNodes = bRows.map((row) => ({
  code: row.code,
  name: legalDisplayName(row),
  kind: legalKind(row),
  parentCode: legalKind(row) === "sido" ? null : findLegalParent(row),
  createdAt: dateIso(row.createdAt),
  abolishedAt: dateIso(row.abolishedAt),
  sidoName: row.sidoName,
  sigunguName: row.sigunguName || null,
  eupMyeonDongName: row.eupMyeonDongName || null,
  dongRiName: row.dongRiName || null,
}));

const legalByCode = new Map(legalNodes.map((row) => [row.code, row]));
const crosswalk = new Map();
for (const row of mixRows) {
  if (!row.adminCode || !row.legalCode) continue;
  const links = crosswalk.get(row.adminCode) ?? [];
  if (!links.some((item) => item.legalCode === row.legalCode)) {
    links.push({
      legalCode: row.legalCode,
      legalName: legalByCode.get(row.legalCode)?.name ?? row.dongRiName ?? "",
      createdAt: dateIso(row.createdAt),
      abolishedAt: dateIso(row.abolishedAt),
    });
  }
  crosswalk.set(row.adminCode, links);
}

const rootSidos = adminNodes.filter((node) => node.kind === "sido" && !node.parentCode);
const activeAdminNodes = adminNodes.filter((node) => !node.abolishedAt);
const activeLegalNodes = legalNodes.filter((node) => !node.abolishedAt);

await mkdir(outDir, { recursive: true });
await Promise.all([
  writeFile(join(outDir, "admin-regions.json"), compactJson({ snapshotDate: dateIso(snapshot), nodes: adminNodes })),
  writeFile(join(outDir, "legal-regions.json"), compactJson({ snapshotDate: dateIso(snapshot), nodes: legalNodes })),
  writeFile(join(outDir, "admin-legal-crosswalk.json"), compactJson({ snapshotDate: dateIso(snapshot), links: Object.fromEntries(crosswalk) })),
]);

const manifest = {
  schemaVersion: "0.1.0",
  snapshotDate: dateIso(snapshot),
  generatedAt: new Date().toISOString(),
  source: {
    admin: { file: basename(hPath), sha256: sha256(hBytes), rows: hRows.length },
    legal: { file: basename(bPath), sha256: sha256(bBytes), rows: bRows.length },
    crosswalk: { file: basename(mixPath), sha256: sha256(mixBytes), rows: mixRows.length },
  },
  output: {
    adminRegions: adminNodes.length,
    activeAdminRegions: activeAdminNodes.length,
    legalRegions: legalNodes.length,
    activeLegalRegions: activeLegalNodes.length,
    adminCodesWithCrosswalk: crosswalk.size,
    rootSidos: rootSidos.map((row) => ({ code: row.code, name: row.name })),
    adminOrphans: adminOrphans.map((row) => ({ code: row.code, name: row.name, sidoName: row.sidoName })),
  },
  policy: {
    preserveNativeCodesAsStrings: true,
    hierarchy: "longest zero-padded native-code prefix within the same source sidoName; non-standard orphan offices are reported, not silently attached",
    crosswalk: "KIKmix remains a versioned relation table and is not permanently merged into admin/legal region rows",
    boundaryGeometry: "not inferred from KIK code files; attach a separately versioned boundary dataset",
  },
};

await writeFile(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

console.log(JSON.stringify(manifest, null, 2));
