import { NextRequest, NextResponse } from "next/server";
import { searchHiraHospitals } from "@/lib/poi/providers/hira";

const asNumber = (value: string | null) => {
  if (value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const lng = asNumber(searchParams.get("x"));
    const lat = asNumber(searchParams.get("y"));
    const radius = asNumber(searchParams.get("radius")) ?? 1200;
    const query = searchParams.get("query")?.trim() || undefined;

    if (lng === undefined || lat === undefined) {
      return NextResponse.json({ error: "x and y are required numbers" }, { status: 400 });
    }
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
      return NextResponse.json({ error: "x/y are outside valid WGS84 longitude/latitude ranges" }, { status: 400 });
    }

    const result = await searchHiraHospitals({ lat, lng, radius, query });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
