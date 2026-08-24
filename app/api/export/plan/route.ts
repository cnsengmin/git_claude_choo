import { NextRequest, NextResponse } from "next/server";
import { buildExportPlan } from "@/lib/atlas-registry/export-plan";
import type { AtlasExportTarget, SpatialLevel } from "@/lib/atlas-registry/types";

const TARGETS = new Set<AtlasExportTarget>(["web", "data", "qgis", "cad", "mcp"]);
const LEVELS = new Set<SpatialLevel>([
  "national", "sido", "sigungu", "admin-dong", "legal-dong",
  "grid-1km", "grid-500m", "grid-100m", "feature", "raster-scene",
]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const target = String(body?.target ?? "") as AtlasExportTarget;
    const level = String(body?.scope?.level ?? "") as SpatialLevel;
    const layerIds = Array.isArray(body?.layerIds) ? body.layerIds.map(String) : [];

    if (!TARGETS.has(target)) return NextResponse.json({ error: "Invalid export target" }, { status: 400 });
    if (!LEVELS.has(level)) return NextResponse.json({ error: "Invalid spatial level" }, { status: 400 });

    const plan = buildExportPlan({
      scope: {
        level,
        regionId: body?.scope?.regionId ? String(body.scope.regionId) : undefined,
        regionCode: body?.scope?.regionCode ? String(body.scope.regionCode) : undefined,
        year: body?.scope?.year ? Number(body.scope.year) : undefined,
      },
      layerIds,
      target,
      outputCrs: body?.outputCrs ? String(body.outputCrs) : undefined,
    });

    return NextResponse.json(plan);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to build export plan" }, { status: 400 });
  }
}
