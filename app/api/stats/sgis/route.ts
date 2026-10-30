import { NextRequest, NextResponse } from "next/server";
import { getSgisStatsSnapshot } from "@/lib/sgis/client";

function asNumber(value: string | null): number | undefined {
  if (value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const x = asNumber(searchParams.get("x"));
    const y = asNumber(searchParams.get("y"));
    const year = asNumber(searchParams.get("year"));
    const admCd = searchParams.get("adm_cd")?.trim() || undefined;
    const admName = searchParams.get("adm_name")?.trim() || undefined;
    const themeCd = searchParams.get("theme_cd")?.trim() || undefined;

    if (!admCd && (x === undefined || y === undefined)) {
      return NextResponse.json({ error: "x/y or adm_cd is required" }, { status: 400 });
    }
    if (x !== undefined && (x < -180 || x > 180)) {
      return NextResponse.json({ error: "x is outside the WGS84 longitude range" }, { status: 400 });
    }
    if (y !== undefined && (y < -90 || y > 90)) {
      return NextResponse.json({ error: "y is outside the WGS84 latitude range" }, { status: 400 });
    }

    const result = await getSgisStatsSnapshot({
      center: x !== undefined && y !== undefined ? { lng: x, lat: y } : undefined,
      admCd,
      admName,
      year,
      themeCd,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown SGIS error" },
      { status: 500 },
    );
  }
}
