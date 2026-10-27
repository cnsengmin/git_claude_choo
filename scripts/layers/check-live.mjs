#!/usr/bin/env node
// Live check of layer providers against a running app (calls external services; not in CI).
//
//   node scripts/layers/check-live.mjs http://localhost:3000 [provider ...]
//
// For each provider (default: all), requests /api/layers/<provider> with the query in
// layers/providers/<provider>/check.json and tests its `expect` rules:
//   { "path": "counts.road", "min": 1 }               number at path >= min
//   { "path": "featureCollection.features", "minLength": 1 }  array length >= minLength

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const PROVIDERS_DIR = join(fileURLToPath(import.meta.url), "..", "..", "..", "layers", "providers");
const [base, ...only] = process.argv.slice(2);
if (!base) {
  console.error("usage: node scripts/layers/check-live.mjs <base-url> [provider ...]");
  process.exit(2);
}

const providers = only.length
  ? only
  : readdirSync(PROVIDERS_DIR).filter((name) => existsSync(join(PROVIDERS_DIR, name, "check.json")));
const at = (value, path) => path.split(".").reduce((node, key) => node?.[key], value);

let failed = 0;
for (const provider of providers) {
  const check = JSON.parse(readFileSync(join(PROVIDERS_DIR, provider, "check.json"), "utf8"));
  const url = `${base.replace(/\/$/, "")}/api/layers/${provider}?${new URLSearchParams(check.query)}`;
  const started = Date.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout((check.timeoutSeconds ?? 60) * 1000) });
    const body = await response.json();
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.error ?? ""}`.slice(0, 300));
    const problems = [];
    for (const rule of check.expect) {
      const value = at(body, rule.path);
      if (rule.min !== undefined && !(typeof value === "number" && value >= rule.min)) problems.push(`${rule.path} = ${value} (< ${rule.min})`);
      if (rule.minLength !== undefined && !(Array.isArray(value) && value.length >= rule.minLength)) problems.push(`${rule.path} length = ${value?.length} (< ${rule.minLength})`);
    }
    if (problems.length) throw new Error(problems.join("; "));
    const shown = check.expect.map((rule) => `${rule.path}=${rule.minLength !== undefined ? at(body, rule.path).length : at(body, rule.path)}`);
    console.log(`ok    ${provider} (${seconds}s) ${shown.join(" ")}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL  ${provider}: ${error.message}`);
  }
}
process.exit(failed ? 1 : 0);
