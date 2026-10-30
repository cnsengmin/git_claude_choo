import { NextRequest, NextResponse } from "next/server";
import { getSgisAdministrativeBoundary } from "@/lib/sgis/client";

function parseYear(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function parseLowSearch(value: string | null): 0 | 1 | 2 | undefined {
  if (value === null || value === "") return undefined;
  const parsed = Number(value);
  return parsed === 0 || parsed === 1 || parsed === 2 ? parsed : undefined;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const admCd = searchParams.get("adm_cd")?.trim() || undefined;
    const admName = searchParams.get("adm_name")?.trim() || undefined;
    const sidoName = searchParams.get("sido")?.trim() || undefined;
    const sigunguName = searchParams.get("sigungu")?.trim() || undefined;
    const adminDongName = searchParams.get("dong")?.trim() || undefined;
    const year = parseYear(searchParams.get("year"));
    const lowSearchRaw = searchParams.get("low_search");
    const lowSearch = parseLowSearch(lowSearchRaw);

    if (lowSearchRaw && lowSearch === undefined) {
      return NextResponse.json({ error: "low_search must be 0, 1 or 2" }, { status: 400 });
    }
    if (!admCd && !sidoName) {
      return NextResponse.json(
        { error: "adm_cd or sido is required. Name lookup can additionally use sigungu and dong." },
        { status: 400 },
      );
    }

    const boundary = await getSgisAdministrativeBoundary({
      admCd,
      admName,
      sidoName,
      sigunguName,
      adminDongName,
      year,
      lowSearch,
    });

    return NextResponse.json(boundary);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown SGIS boundary error" },
      { status: 500 },
    );
  }
}
