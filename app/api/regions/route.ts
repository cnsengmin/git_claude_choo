import { NextRequest, NextResponse } from "next/server";
import { getRegionStore } from "@/lib/mois/region-store";

const regionStore = getRegionStore();

export async function GET(request: NextRequest) {
  const parentParam = request.nextUrl.searchParams.get("parent");
  const code = request.nextUrl.searchParams.get("code");
  const snapshot = regionStore.getSnapshot();

  if (code) {
    const region = regionStore.getRegion(code);
    if (!region) return NextResponse.json({ error: `Unknown region code: ${code}` }, { status: 404 });
    const path = regionStore.getPath(code);
    const levels = path.map((node, index) => {
      const parent = index === 0 ? null : path[index - 1].code;
      return {
        parent,
        selectedCode: node.code,
        options: regionStore.listChildren(parent),
      };
    });
    return NextResponse.json({
      snapshot,
      region,
      path,
      levels,
      children: regionStore.listChildren(code),
      legalLinks: region.kind === "admin-dong" ? regionStore.getAdminLegalLinks(code) : [],
    });
  }

  const parent = parentParam && parentParam.trim() ? parentParam.trim() : null;
  const children = regionStore.listChildren(parent);

  return NextResponse.json({
    snapshot,
    parent,
    children,
  });
}
