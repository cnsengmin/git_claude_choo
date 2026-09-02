import { NextRequest, NextResponse } from "next/server";
import { searchGoogleNearby } from "@/lib/poi/providers/google";

type Body = {
  lat?: number;
  lng?: number;
  radius?: number;
  includedTypes?: string[];
  maxResultCount?: number;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Body;
    if (!Number.isFinite(body.lat) || !Number.isFinite(body.lng) || !Number.isFinite(body.radius)) {
      return NextResponse.json({ error: "lat, lng and radius are required numbers" }, { status: 400 });
    }

    const result = await searchGoogleNearby({
      lat: body.lat as number,
      lng: body.lng as number,
      radius: body.radius as number,
      includedTypes: body.includedTypes,
      maxResultCount: body.maxResultCount,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
