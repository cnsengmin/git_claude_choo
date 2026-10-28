import { badTilePath, releasePmtiles, tilePath } from "@/layers/providers/pmtiles";

// Census population on 2025 output areas (PMTiles) from the GitHub Release.
// OA_POPULATION_PMTILES_DIR: read local files instead (e.g. dist/oa-population after
// build_release_oa_pmtiles.py).
const FILE = "kr-oa-population.pmtiles";
const reader = releasePmtiles({
  releaseUrl: "https://github.com/cnsengmin/git_claude_choo/releases/download/oa-population-20261029",
  localDir: process.env.OA_POPULATION_PMTILES_DIR,
});

// GET /api/layers/sgis-oa/oa/metadata
// GET /api/layers/sgis-oa/oa/<z>/<x>/<y>.pbf
export async function handle(_params: URLSearchParams, path: string[] = []): Promise<unknown> {
  if (path[0] === "oa" && path.length === 2 && path[1] === "metadata") return { layer: "oa", ...(await reader.metadata(FILE)) };
  const zxy = path[0] === "oa" ? tilePath(path.slice(1)) : undefined;
  if (!zxy) throw badTilePath("oa");
  return reader.tile(FILE, ...zxy);
}
