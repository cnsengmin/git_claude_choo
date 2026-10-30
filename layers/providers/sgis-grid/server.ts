import { badTilePath, releasePmtiles, tilePath } from "@/layers/providers/pmtiles";

// SGIS 100 m grid statistics (PMTiles) from the GitHub Release.
// GRID_100M_PMTILES_DIR: read local files instead (e.g. dist/grid-100m after
// build_release_grid_pmtiles.py).
const FILE = "kr-grid-100m.pmtiles";
const reader = releasePmtiles({
  releaseUrl: "https://github.com/cnsengmin/git_claude_choo/releases/download/grid-100m-20261030",
  localDir: process.env.GRID_100M_PMTILES_DIR,
});

// GET /api/layers/sgis-grid/grid/metadata
// GET /api/layers/sgis-grid/grid/<z>/<x>/<y>.pbf
export async function handle(_params: URLSearchParams, path: string[] = []): Promise<unknown> {
  if (path[0] === "grid" && path.length === 2 && path[1] === "metadata") return { layer: "grid", ...(await reader.metadata(FILE)) };
  const zxy = path[0] === "grid" ? tilePath(path.slice(1)) : undefined;
  if (!zxy) throw badTilePath("grid");
  return reader.tile(FILE, ...zxy);
}
