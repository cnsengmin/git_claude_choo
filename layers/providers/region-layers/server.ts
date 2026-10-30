import { LayerRequestError } from "@/layers/providers/errors";
import { badTilePath, releasePmtiles, tilePath } from "@/layers/providers/pmtiles";

// Region-layer boundary tiles (PMTiles, one file per level) from the GitHub Release.
// REGION_LAYERS_PMTILES_DIR: read local files instead (e.g. dist/region-layers after
// build_release_pmtiles.py).
export const LEVELS = ["sido", "lgu", "sgg", "admdong"] as const;
type Level = (typeof LEVELS)[number];

const reader = releasePmtiles({
  releaseUrl: "https://github.com/cnsengmin/git_claude_choo/releases/download/region-layers-20261027",
  localDir: process.env.REGION_LAYERS_PMTILES_DIR,
});

const asLevel = (value: string | undefined): Level => {
  if (!LEVELS.includes(value as Level)) throw new LayerRequestError(`level must be one of ${LEVELS.join(", ")}`);
  return value as Level;
};

// GET /api/layers/region-layers/<level>/metadata
// GET /api/layers/region-layers/<level>/<z>/<x>/<y>.pbf
export async function handle(_params: URLSearchParams, path: string[] = []): Promise<unknown> {
  const level = asLevel(path[0]);
  const file = `kr-region-layers-${level}.pmtiles`;
  if (path.length === 2 && path[1] === "metadata") return { level, ...(await reader.metadata(file)) };
  const zxy = tilePath(path.slice(1));
  if (!zxy) throw badTilePath("<level>");
  return reader.tile(file, ...zxy);
}
