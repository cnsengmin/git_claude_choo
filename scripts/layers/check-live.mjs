#!/usr/bin/env node
// Live check of layer providers against a running app (calls external services; not in CI).
//
//   node scripts/layers/check-live.mjs http://localhost:3000 [provider ...]
//
// For each provider (default: all), sends the requests in layers/providers/<provider>/check.json
// to /api/layers/<provider>[/<path>] and tests each request's `expect` rules:
//   { "path": "counts.road", "min": 1 }                       JSON number at path >= min
//   { "path": "featureCollection.features", "minLength": 1 }   JSON array length >= minLength
//   { "path": "level", "equals": "sgg" }                       JSON value at path equals
//   { "minBytes": 1000 }                                        response body size (tiles)
//   { "contains": "1111000000" }                                body contains this text (tiles)

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

function test(rule, body, json) {
  if (rule.minBytes !== undefined) return body.length >= rule.minBytes ? `${body.length}B` : `${body.length} bytes (< ${rule.minBytes})!`;
  if (rule.contains !== undefined) return body.includes(Buffer.from(rule.contains)) ? `has ${rule.contains}` : `no "${rule.contains}"!`;
  const value = at(json, rule.path);
  if (rule.min !== undefined) return typeof value === "number" && value >= rule.min ? `${rule.path}=${value}` : `${rule.path} = ${value} (< ${rule.min})!`;
  if (rule.minLength !== undefined) return Array.isArray(value) && value.length >= rule.minLength ? `${rule.path}=${value.length}` : `${rule.path} length = ${value?.length} (< ${rule.minLength})!`;
  if (rule.equals !== undefined) return value === rule.equals ? `${rule.path}=${value}` : `${rule.path} = ${JSON.stringify(value)} (≠ ${JSON.stringify(rule.equals)})!`;
  return `unknown rule ${JSON.stringify(rule)}!`;
}

let failed = 0;
for (const provider of providers) {
  const check = JSON.parse(readFileSync(join(PROVIDERS_DIR, provider, "check.json"), "utf8"));
  for (const request of check.requests) {
    const url = `${base.replace(/\/$/, "")}/api/layers/${provider}${request.path ? `/${request.path}` : ""}`
      + (request.query ? `?${new URLSearchParams(request.query)}` : "");
    const label = `${provider}${request.path ? `/${request.path}` : ""}`;
    const started = Date.now();
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout((check.timeoutSeconds ?? 60) * 1000) });
      const body = Buffer.from(await response.arrayBuffer());
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.toString("utf8", 0, 300)}`);
      const json = (response.headers.get("content-type") ?? "").includes("json") ? JSON.parse(body.toString("utf8")) : undefined;
      const results = request.expect.map((rule) => test(rule, body, json));
      const bad = results.filter((result) => result.endsWith("!"));
      if (bad.length) throw new Error(bad.map((result) => result.slice(0, -1)).join("; "));
      console.log(`ok    ${label} (${seconds}s) ${results.join(" ")}`);
    } catch (error) {
      failed += 1;
      console.log(`FAIL  ${label}: ${error.message}`);
    }
  }
}
process.exit(failed ? 1 : 0);
