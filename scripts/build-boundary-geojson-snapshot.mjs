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
const regionType = String(args["region-type"] ?? "").trim();
const codeField = String(args["code-field"] ?? "").trim();
const nameField = String(args["name-field"] ?? "").trim();
const sourceId = String(args.source ?? "sgis").trim();
const datasetId = String(args.dataset ?? "sgis-boundary-snapshot").trim();
const referenceDate = String(args["reference-date"] ?? "").trim();
const sourceCrs = String(args["source-crs"] ?? "EPSG:5179").trim();
const outDir = resolve(String(args["out-dir"] ?? `data/generated/boundary-${regionType || "snapshot"}`));

if (!inputPath || !regionType || !codeField || !nameField || !referenceDate) {
  console.error("Usage: npm run data:boundary -- --input <geojson> --region-type sido|sigungu|admin-dong|legal-dong --code-field <field> --name-field <field> --reference-date YYYY-MM-DD [--source sgis] [--dataset <id>] [--source-crs EPSG:5179] [--out-dir <dir>]");
  process.exit(1);
}
if (!["sido", "sigungu", "admin-dong", "legal-dong"].includes(regionType)) {
  throw new Error(`Unsupported region type: ${regionType}`);
}

const bytes = await readFile(resolve(inputPath));
const text = new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
const parsed = JSON.parse(text);
if (parsed?.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
  throw new Error("Input must be a GeoJSON FeatureCollection");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function bboxOfCoordinates(value, bbox) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
    const x = value[0];
    const y = value[1];
    bbox[0] = Math.min(bbox[0], x);
    bbox[1] = Math.min(bbox[1], y);
    bbox[2] = Math.max(bbox[2], x);
    bbox[3] = Math.max(bbox[3], y);
    return;
  }
  value.forEach((item) => bboxOfCoordinates(item, bbox));
}

const seenCodes = new Set();
const duplicateCodes = new Set();
const geometryTypes = new Map();
const missingCode = [];
const missingName = [];
const normalizedFeatures = [];
const bbox = [Infinity, Infinity, -Infinity, -Infinity];

for (let index = 0; index < parsed.features.length; index += 1) {
  const feature = parsed.features[index];
  if (!feature || feature.type !== "Feature") continue;
  const props = feature.properties && typeof feature.properties === "object" ? feature.properties : {};
  const officialCode = String(props[codeField] ?? "").trim();
  const name = String(props[nameField] ?? "").trim();
  if (!officialCode) missingCode.push(index);
  if (!name) missingName.push(index);
  if (officialCode) {
    if (seenCodes.has(officialCode)) duplicateCodes.add(officialCode);
    seenCodes.add(officialCode);
  }

  const geometryType = feature.geometry?.type ?? "null";
  geometryTypes.set(geometryType, (geometryTypes.get(geometryType) ?? 0) + 1);
  if (feature.geometry?.coordinates) bboxOfCoordinates(feature.geometry.coordinates, bbox);

  normalizedFeatures.push({
    type: "Feature",
    id: officialCode ? `${regionType}:${officialCode}:${referenceDate}` : undefined,
    geometry: feature.geometry ?? null,
    properties: {
      ...props,
      atlas_region_id: officialCode ? `${regionType}:${officialCode}:${referenceDate}` : null,
      official_code: officialCode || null,
      region_name: name || null,
      region_type: regionType,
      boundary_reference_date: referenceDate,
      source_id: sourceId,
      source_dataset_id: datasetId,
      source_crs: sourceCrs,
    },
  });
}

const finiteBbox = bbox.every(Number.isFinite) ? bbox : null;
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, "boundary.geojson"), JSON.stringify({
  type: "FeatureCollection",
  features: normalizedFeatures,
}));

const manifest = {
  schemaVersion: "0.1.0",
  generatedAt: new Date().toISOString(),
  source: {
    provider: sourceId,
    datasetId,
    file: basename(inputPath),
    sha256: sha256(bytes),
    sourceCrs,
    referenceDate,
  },
  mapping: {
    regionType,
    codeField,
    nameField,
    atlasCodeField: "official_code",
    atlasNameField: "region_name",
  },
  validation: {
    inputFeatures: parsed.features.length,
    normalizedFeatures: normalizedFeatures.length,
    uniqueCodes: seenCodes.size,
    duplicateCodes: [...duplicateCodes].slice(0, 100),
    missingCodeFeatureIndexes: missingCode.slice(0, 100),
    missingNameFeatureIndexes: missingName.slice(0, 100),
    geometryTypes: Object.fromEntries(geometryTypes),
    bbox: finiteBbox,
  },
  policy: {
    preserveNativeProperties: true,
    preserveOfficialCodeAsString: true,
    sourceCrsIsMetadataOnly: "This script does not reproject coordinates. Convert SHP to GeoJSON in a known CRS before running, or keep source CRS explicit and do not treat the output as web-ready until reprojection is verified.",
    codeSnapshotIndependent: "Boundary reference date is independent from KIK code snapshot and statistics year.",
  },
};

await writeFile(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
