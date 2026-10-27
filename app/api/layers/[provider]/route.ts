import { NextRequest, NextResponse } from "next/server";
import { LayerRequestError } from "@/layers/providers/errors";
import { PROVIDERS } from "@/layers/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const handle = PROVIDERS[provider];
  if (!handle) {
    return NextResponse.json({ error: `Unknown layer provider: ${provider}` }, { status: 404 });
  }

  try {
    return NextResponse.json(await handle(request.nextUrl.searchParams));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof LayerRequestError ? 400 : 500 },
    );
  }
}
