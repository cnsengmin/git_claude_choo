import { NextRequest, NextResponse } from "next/server";
import { searchKakaoPoi } from "@/lib/poi/providers/kakao";

const asNumber = (value: string | null) => {
  if (value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const query = searchParams.get("query")?.trim();
    if (!query) return NextResponse.json({ error: "query is required" }, { status: 400 });

    const x = asNumber(searchParams.get("x"));
    const y = asNumber(searchParams.get("y"));
    const radius = asNumber(searchParams.get("radius"));
    const rect = searchParams.get("rect") || undefined;
    const sort = searchParams.get("sort") === "distance" ? "distance" : "accuracy";

    if (sort === "distance" && (x === undefined || y === undefined)) {
      return NextResponse.json({ error: "x and y are required when sort=distance" }, { status: 400 });
    }

    const result = await searchKakaoPoi({ query, x, y, radius, rect, sort, size: 15 });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
