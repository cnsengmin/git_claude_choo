import { NextResponse } from "next/server";
import { isVworldConfigured } from "@/lib/vworld/client";
import { VWORLD_LAYER_REGISTRY } from "@/lib/vworld/layers";

export async function GET() {
  return NextResponse.json({
    provider: "vworld",
    configured: isVworldConfigured(),
    policy: "Only verified/catalogued services are exposed; exact WFS type names must be runtime-verified before automated extraction.",
    layers: VWORLD_LAYER_REGISTRY,
  });
}
