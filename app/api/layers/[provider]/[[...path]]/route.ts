import { NextRequest, NextResponse } from "next/server";
import { LayerRequestError } from "@/layers/providers/errors";
import { PROVIDERS } from "@/layers/server";

// GET /api/layers/<provider>[/<path...>]: JSON from the provider, or its own Response (tiles).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string; path?: string[] }> },
) {
  const { provider, path = [] } = await params;
  const handle = PROVIDERS[provider];
  if (!handle) {
    return NextResponse.json({ error: `Unknown layer provider: ${provider}` }, { status: 404 });
  }

  try {
    const result = await handle(request.nextUrl.searchParams, path);
    return result instanceof Response ? result : NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof LayerRequestError ? 400 : 500 },
    );
  }
}
