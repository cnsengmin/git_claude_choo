import { open } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { Compression, PMTiles, type RangeResponse, type Source } from "pmtiles";
import { LayerRequestError } from "@/layers/providers/errors";

// Shared reader for providers whose tiles are PMTiles files on a GitHub Release. Releases send
// no CORS headers, so the browser cannot read them; the server reads byte ranges and returns
// single tiles. In development a local folder (e.g. dist/...) can stand in for the release.

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

// Tiles never change for a release, so the CDN may keep them.
const TILE_CACHE = "public, max-age=86400, s-maxage=31536000, immutable";

export function releasePmtiles({ releaseUrl, localDir }: { releaseUrl: string; localDir?: string }) {
  const archives = new Map<string, PMTiles>();

  const archive = (file: string) => {
    let found = archives.get(file);
    if (!found) {
      found = new PMTiles(localDir ? new LocalSource(join(localDir, file)) : new RangeSource(`${releaseUrl}/${file}`));
      archives.set(file, found);
    }
    return found;
  };

  // PMTiles caches the header promise, failed or not; start over on the next request.
  const retryable = async <T>(file: string, read: (pmtiles: PMTiles) => Promise<T>) => {
    try {
      return await read(archive(file));
    } catch (error) {
      archives.delete(file);
      throw error;
    }
  };

  return {
    metadata: (file: string) => retryable(file, async (pmtiles) => {
      const header = await pmtiles.getHeader();
      return {
        minZoom: header.minZoom,
        maxZoom: header.maxZoom,
        bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
        tileCompression: Compression[header.tileCompression],
        metadata: await pmtiles.getMetadata(),
      };
    }),

    // getZxy returns the tile already decompressed; send it gzipped again.
    tile: (file: string, z: number, x: number, y: number) => retryable(file, async (pmtiles) => {
      const tile = await pmtiles.getZxy(z, x, y);
      if (!tile) return new Response(null, { status: 204, headers: { "Cache-Control": TILE_CACHE } });
      return new Response(gzipSync(Buffer.from(tile.data)), {
        headers: { "Content-Type": "application/x-protobuf", "Content-Encoding": "gzip", "Cache-Control": TILE_CACHE },
      });
    }),
  };
}

// <z>/<x>/<y>.pbf path segments, or undefined.
export function tilePath(segments: string[]): [number, number, number] | undefined {
  const ok = segments.length === 3 && /^\d+$/.test(segments[0]) && /^\d+$/.test(segments[1]) && /^\d+\.pbf$/.test(segments[2]);
  return ok ? [segments[0], segments[1], segments[2].slice(0, -".pbf".length)].map(Number) as [number, number, number] : undefined;
}

export const badTilePath = (prefix: string) => new LayerRequestError(`expected ${prefix}/metadata or ${prefix}/<z>/<x>/<y>.pbf`);
