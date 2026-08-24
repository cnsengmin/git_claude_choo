import { NextRequest, NextResponse } from "next/server";
import {
  CRS_REGISTRY,
  EXPORT_PROFILES,
  GRID_SYSTEM_REGISTRY,
  INDICATOR_REGISTRY,
  REGION_REGISTRY_META,
} from "@/lib/atlas-registry";

export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind");

  const payload = {
    schemaVersion: "0.2.0",
    region: REGION_REGISTRY_META,
    grids: GRID_SYSTEM_REGISTRY,
    crs: CRS_REGISTRY,
    indicators: INDICATOR_REGISTRY,
    exports: EXPORT_PROFILES,
  };

  if (!kind) return NextResponse.json(payload);

  if (kind === "region") return NextResponse.json({ schemaVersion: payload.schemaVersion, region: payload.region });
  if (kind === "grid") return NextResponse.json({ schemaVersion: payload.schemaVersion, grids: payload.grids });
  if (kind === "crs") return NextResponse.json({ schemaVersion: payload.schemaVersion, crs: payload.crs });
  if (kind === "indicator") return NextResponse.json({ schemaVersion: payload.schemaVersion, indicators: payload.indicators });
  if (kind === "export") return NextResponse.json({ schemaVersion: payload.schemaVersion, exports: payload.exports });

  return NextResponse.json(
    { error: `Unknown registry kind: ${kind}`, allowed: ["region", "grid", "crs", "indicator", "export"] },
    { status: 400 },
  );
}
