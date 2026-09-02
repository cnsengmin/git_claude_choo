import { NextRequest, NextResponse } from "next/server";
import { fetchKosisStatistics, isKosisConfigured, normalizeKosisStatisticRow } from "@/lib/kosis/client";

export async function POST(request: NextRequest) {
  if (!isKosisConfigured()) {
    return NextResponse.json({ error: "KOSIS_API_KEY is not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const required = ["orgId", "tableId", "itemId", "objectLevel1", "periodType"] as const;
    for (const field of required) {
      if (!body?.[field]) return NextResponse.json({ error: `${field} is required` }, { status: 400 });
    }

    const raw = await fetchKosisStatistics({
      orgId: String(body.orgId),
      tableId: String(body.tableId),
      itemId: String(body.itemId),
      objectLevel1: String(body.objectLevel1),
      periodType: String(body.periodType),
      startPeriod: body.startPeriod ? String(body.startPeriod) : undefined,
      endPeriod: body.endPeriod ? String(body.endPeriod) : undefined,
      latestCount: body.latestCount ? Number(body.latestCount) : undefined,
      objectLevels: body.objectLevels ?? undefined,
      outputFields: Array.isArray(body.outputFields) ? body.outputFields.map(String) : undefined,
    });

    return NextResponse.json({
      provider: "kosis",
      rawCount: raw.length,
      rows: raw.map(normalizeKosisStatisticRow),
      raw,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "KOSIS data request failed" }, { status: 502 });
  }
}
