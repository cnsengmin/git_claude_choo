import { NextRequest, NextResponse } from "next/server";
import { isKosisConfigured, searchKosis } from "@/lib/kosis/client";

export async function GET(request: NextRequest) {
  if (!isKosisConfigured()) {
    return NextResponse.json({ error: "KOSIS_API_KEY is not configured" }, { status: 503 });
  }

  const query = request.nextUrl.searchParams.get("query")?.trim() ?? "";
  const orgId = request.nextUrl.searchParams.get("orgId") ?? undefined;
  const page = Number(request.nextUrl.searchParams.get("page") ?? 1);
  const pageSize = Number(request.nextUrl.searchParams.get("pageSize") ?? 20);
  const sort = request.nextUrl.searchParams.get("sort") === "DATE" ? "DATE" : "RANK";

  if (!query) return NextResponse.json({ error: "query is required" }, { status: 400 });

  try {
    const results = await searchKosis(query, { orgId, page, pageSize, sort });
    return NextResponse.json({ provider: "kosis", query, results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "KOSIS search failed" }, { status: 502 });
  }
}
