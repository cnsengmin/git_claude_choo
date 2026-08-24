import { NextRequest, NextResponse } from "next/server";
import { getMvpRegion, getMvpRegionPath, listMvpRegionChildren, MVP_REGION_SNAPSHOT } from "@/lib/mois/mvp-regions";

export async function GET(request: NextRequest) {
  const parentParam = request.nextUrl.searchParams.get("parent");
  const code = request.nextUrl.searchParams.get("code");

  if (code) {
    const region = getMvpRegion(code);
    if (!region) return NextResponse.json({ error: `Unknown MVP region code: ${code}` }, { status: 404 });
    return NextResponse.json({
      snapshot: MVP_REGION_SNAPSHOT,
      region,
      path: getMvpRegionPath(code),
      children: listMvpRegionChildren(code),
    });
  }

  const parent = parentParam && parentParam.trim() ? parentParam.trim() : null;
  const children = listMvpRegionChildren(parent);

  return NextResponse.json({
    snapshot: MVP_REGION_SNAPSHOT,
    parent,
    children,
  });
}
