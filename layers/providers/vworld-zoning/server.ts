import { badTilePath, releasePmtiles, tilePath } from "@/layers/providers/pmtiles";

// Nationwide 용도지역 and 개발제한구역 (PMTiles) from the GitHub Release.
// ZONING_PMTILES_DIR: read local files instead (e.g. dist/zoning after
// scripts/vworld/build_zoning_pmtiles.py).
const FILE = "kr-zoning.pmtiles";
const reader = releasePmtiles({
  releaseUrl: "https://github.com/cnsengmin/git_claude_choo/releases/download/zoning-20261030",
  localDir: process.env.ZONING_PMTILES_DIR,
});

// GET /api/layers/vworld-zoning/zoning/metadata
// GET /api/layers/vworld-zoning/zoning/<z>/<x>/<y>.pbf
export async function handle(_params: URLSearchParams, path: string[] = []): Promise<unknown> {
  if (path[0] === "zoning" && path.length === 2 && path[1] === "metadata") return { layer: "zoning", ...(await reader.metadata(FILE)) };
  const zxy = path[0] === "zoning" ? tilePath(path.slice(1)) : undefined;
  if (!zxy) throw badTilePath("zoning");
  return reader.tile(FILE, ...zxy);
}
