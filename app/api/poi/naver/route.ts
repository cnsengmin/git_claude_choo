import { NextRequest, NextResponse } from "next/server";
import { searchNaverPoi } from "@/lib/poi/providers/naver";

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get("query")?.trim();
    if (!query) return NextResponse.json({ error: "query is required" }, { status: 400 });

    const sort = request.nextUrl.searchParams.get("sort") === "comment" ? "comment" : "random";
    const result = await searchNaverPoi(query, sort);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
