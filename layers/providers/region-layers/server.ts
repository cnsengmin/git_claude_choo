import { open } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { Compression, PMTiles, type RangeResponse, type Source } from "pmtiles";
import { LayerRequestError } from "@/layers/providers/errors";

// Region-layer boundary tiles (PMTiles, one file per level) from the GitHub Release. The
// release does not send CORS headers, so the browser cannot read it directly; this provider
// reads byte ranges on the server and returns single tiles.
//
// REGION_LAYERS_PMTILES_DIR: read local files instead (e.g. dist/region-layers after
// build_release_pmtiles.py). REGION_LAYERS_PMTILES_URL: another base URL with range support.
const RELEASE_URL = "https://github.com/cnsengmin/git_claude_choo/releases/download/region-layers-20261027";
export const LEVELS = ["lgu", "sgg", "admdong"] as const;
type Level = (typeof LEVELS)[number];

class LocalSource implements Source {
  constructor(private readonly path: string) {}

  getKey() {
    return this.path;
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const file = await open(this.path, "r");
    try {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await file.read(buffer, 0, length, offset);
      return { data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + bytesRead) };
    } finally {
      await file.close();
    }
  }
}

class RangeSource implements Source {
  constructor(private readonly url: string) {}

  getKey() {
    return this.url;
  }

  async getBytes(offset: number, length: number, signal?: AbortSignal): Promise<RangeResponse> {
    const response = await fetch(this.url, {
      headers: { Range: `bytes=${offset}-${offset + length - 1}` },
      signal,
    });
    if (response.status !== 206 && response.status !== 200) {
      throw new Error(`PMTiles range request failed: ${response.status} ${this.url}`);
    }
    const data = await response.arrayBuffer();
    // A server that ignores Range returns the whole file.
    return { data: response.status === 200 ? data.slice(offset, offset + length) : data };
  }
}

const archives = new Map<Level, PMTiles>();

function archive(level: Level) {
  let found = archives.get(level);
  if (!found) {
    const file = `kr-region-layers-${level}.pmtiles`;
    const dir = process.env.REGION_LAYERS_PMTILES_DIR;
    const base = process.env.REGION_LAYERS_PMTILES_URL || RELEASE_URL;
    found = new PMTiles(dir ? new LocalSource(join(dir, file)) : new RangeSource(`${base.replace(/\/$/, "")}/${file}`));
    archives.set(level, found);
  }
  return found;
}

const asLevel = (value: string | undefined): Level => {
  if (!LEVELS.includes(value as Level)) throw new LayerRequestError(`level must be one of ${LEVELS.join(", ")}`);
  return value as Level;
};

// GET /api/layers/region-layers/<level>/metadata
// GET /api/layers/region-layers/<level>/<z>/<x>/<y>.pbf
export async function handle(_params: URLSearchParams, path: string[] = []): Promise<unknown> {
  const level = asLevel(path[0]);
  try {
    return await read(level, path);
  } catch (error) {
    // PMTiles caches the header promise, failed or not; start over on the next request.
    archives.delete(level);
    throw error;
  }
}

async function read(level: Level, path: string[]): Promise<unknown> {
  const pmtiles = archive(level);

  if (path.length === 2 && path[1] === "metadata") {
    const header = await pmtiles.getHeader();
    return {
      level,
      minZoom: header.minZoom,
      maxZoom: header.maxZoom,
      bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
      tileCompression: Compression[header.tileCompression],
      metadata: await pmtiles.getMetadata(),
    };
  }

  const isTile = path.length === 4 && /^\d+$/.test(path[1]) && /^\d+$/.test(path[2]) && /^\d+\.pbf$/.test(path[3]);
  if (!isTile) throw new LayerRequestError("expected <level>/metadata or <level>/<z>/<x>/<y>.pbf");
  const [z, x, y] = [path[1], path[2], path[3].slice(0, -".pbf".length)].map(Number);

  // getZxy returns the tile already decompressed; send it gzipped again (tiles hold every
  // layer date, so a z10 tile is ~300 KB raw). Tiles never change for a release, so the CDN
  // may keep them.
  const tile = await pmtiles.getZxy(z, x, y);
  const cache = "public, max-age=86400, s-maxage=31536000, immutable";
  if (!tile) return new Response(null, { status: 204, headers: { "Cache-Control": cache } });
  return new Response(gzipSync(Buffer.from(tile.data)), {
    headers: { "Content-Type": "application/x-protobuf", "Content-Encoding": "gzip", "Cache-Control": cache },
  });
}
