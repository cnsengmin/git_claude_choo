#!/usr/bin/env node
// Structure check for layers/ (no network; runs in CI).
//
//   node scripts/layers/check-manifests.mjs
//
// Every layers/<group>/<id>/layer.json is valid, sits in its own group/id folder and is
// listed in layers/index.ts; provider layers have a style.ts registered in LAYER_STYLES;
// each provider has server.ts, README.md and check.json and is registered in layers/server.ts;
// preset layer ids exist.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");
const LAYERS_DIR = join(ROOT, "layers");
const GROUPS = ["boundaries", "physical", "planning", "mobility", "people", "places"];
const STATUSES = ["available", "partial", "planned"];
const REQUIRED = ["id", "group", "label", "description", "status", "source"];

const errors = [];
const fail = (message) => errors.push(message);
const read = (...parts) => readFileSync(join(LAYERS_DIR, ...parts), "utf8");

const indexTs = read("index.ts");
const serverTs = read("server.ts");
const groupsTs = read("groups.ts");

const ids = new Set();
let count = 0;
for (const group of GROUPS) {
  const groupDir = join(LAYERS_DIR, group);
  if (!existsSync(groupDir)) continue;
  for (const id of readdirSync(groupDir)) {
    const dir = join(groupDir, id);
    const where = relative(ROOT, dir).replaceAll("\\", "/");
    const manifestPath = join(dir, "layer.json");
    if (!existsSync(manifestPath)) {
      fail(`${where}: no layer.json`);
      continue;
    }
    count += 1;
    let layer;
    try {
      layer = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch (error) {
      fail(`${where}/layer.json: ${error.message}`);
      continue;
    }
    for (const key of REQUIRED) {
      if (typeof layer[key] !== "string" || layer[key] === "") fail(`${where}/layer.json: missing ${key}`);
    }
    if (layer.id !== id) fail(`${where}/layer.json: id "${layer.id}" differs from folder "${id}"`);
    if (layer.group !== group) fail(`${where}/layer.json: group "${layer.group}" differs from folder "${group}"`);
    if (!STATUSES.includes(layer.status)) fail(`${where}/layer.json: status "${layer.status}" is not one of ${STATUSES.join(", ")}`);
    if (ids.has(id)) fail(`${where}: duplicate layer id "${id}"`);
    ids.add(id);
    if (!indexTs.includes(`"./${group}/${id}/layer.json"`)) fail(`${where}: not imported in layers/index.ts`);

    const hasStyle = existsSync(join(dir, "style.ts"));
    const registered = indexTs.includes(`"${id}": `);
    if (hasStyle !== registered) fail(`${where}: style.ts ${hasStyle ? "exists but is not" : "is missing but is"} registered in LAYER_STYLES`);
    if (layer.provider) {
      if (!hasStyle) fail(`${where}: provider layer needs a style.ts`);
      const providerDir = join(LAYERS_DIR, "providers", layer.provider);
      for (const file of ["server.ts", "README.md", "check.json"]) {
        if (!existsSync(join(providerDir, file))) fail(`${where}: provider "${layer.provider}" has no ${file}`);
      }
      if (!serverTs.includes(`"${layer.provider}":`)) fail(`${where}: provider "${layer.provider}" is not registered in layers/server.ts`);
    }
    if (layer.requiresEnv !== undefined && !(Array.isArray(layer.requiresEnv) && layer.requiresEnv.every((name) => /^[A-Z][A-Z0-9_]*$/.test(name)))) {
      fail(`${where}/layer.json: requiresEnv must be a list of environment variable names`);
    }
  }
}

for (const [, list] of groupsTs.matchAll(/layerIds:\s*\[([^\]]*)\]/g)) {
  for (const [, id] of list.matchAll(/"([^"]+)"/g)) {
    if (!ids.has(id)) fail(`layers/groups.ts: preset layer "${id}" has no folder`);
  }
}

if (errors.length) {
  console.error(`layers: ${errors.length} problem(s)`);
  for (const message of errors) console.error(`  - ${message}`);
  process.exit(1);
}
console.log(`layers: ${count} manifests OK`);
