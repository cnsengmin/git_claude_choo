import { NextRequest, NextResponse } from "next/server";
import { CRS_REGISTRY, LAYER_REGISTRY, SOURCE_REGISTRY } from "@/lib/atlas-registry";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const source = searchParams.get("source");
  const group = searchParams.get("group");
  const status = searchParams.get("status");

  const layers = LAYER_REGISTRY.filter((layer) => {
    if (source && layer.sourceId !== source && !(layer.fallbackSourceIds ?? []).includes(source)) return false;
    if (group && layer.group !== group) return false;
    if (status && layer.status !== status) return false;
    return true;
  });

  const referencedSourceIds = new Set<string>();
  layers.forEach((layer) => {
    referencedSourceIds.add(layer.sourceId);
    (layer.fallbackSourceIds ?? []).forEach((id) => referencedSourceIds.add(id));
  });

  const sources = source
    ? SOURCE_REGISTRY.filter((item) => item.id === source || referencedSourceIds.has(item.id))
    : SOURCE_REGISTRY;

  return NextResponse.json({
    app: "atlas-kr",
    schemaVersion: "0.1.0",
    defaults: {
      analysisCrs: "EPSG:5179",
      webCoordinateCrs: "EPSG:4326",
      displayCrs: "EPSG:3857",
    },
    filters: { source, group, status },
    counts: {
      sources: sources.length,
      layers: layers.length,
      crs: CRS_REGISTRY.length,
    },
    crs: CRS_REGISTRY,
    sources,
    layers,
  });
}
