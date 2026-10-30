import { NextRequest, NextResponse } from "next/server";
import {
  previewAdminDongClassification,
  previewLegalDongCodes,
  previewSgisGridStatistics,
} from "@/lib/atlas-registry";

const MAX_TEXT_BYTES = 5_000_000;

export async function GET() {
  return NextResponse.json({
    schemaVersion: "0.1.0",
    purpose: "Preview normalization of official Korean region/grid text before persistence or export.",
    maxTextBytes: MAX_TEXT_BYTES,
    kinds: {
      "legal-dong": {
        datasetId: "mois-legal-dong-codes",
        required: ["kind", "text"],
        optional: ["limit"],
      },
      "admin-classification": {
        datasetId: "kostat-admin-dong-classification-20250704",
        required: ["kind", "text"],
        optional: ["limit"],
      },
      "sgis-grid": {
        datasetId: "sgis-small-area-grid",
        required: ["kind", "text", "gridSizeM", "year", "indicatorId", "unit"],
        optional: ["idField", "valueField", "limit"],
      },
    },
    notes: [
      "Codes are treated as strings and are never numerically coerced.",
      "This endpoint previews normalization only; it does not persist uploaded data.",
      "Large national files should later use a batch/ETL path rather than a Vercel request body.",
    ],
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const text = typeof body.text === "string" ? body.text : "";
    const size = new TextEncoder().encode(text).byteLength;

    if (!text.trim()) return NextResponse.json({ error: "text is required" }, { status: 400 });
    if (size > MAX_TEXT_BYTES) {
      return NextResponse.json(
        { error: `Preview input is limited to ${MAX_TEXT_BYTES} bytes; use a representative sample for this endpoint.` },
        { status: 413 },
      );
    }

    const limit = Number.isFinite(Number(body.limit)) ? Number(body.limit) : 50;

    if (body.kind === "legal-dong") {
      return NextResponse.json(previewLegalDongCodes(text, limit));
    }

    if (body.kind === "admin-classification") {
      return NextResponse.json(previewAdminDongClassification(text, limit));
    }

    if (body.kind === "sgis-grid") {
      const gridSizeM = Number(body.gridSizeM);
      if (![100, 500, 1000].includes(gridSizeM)) {
        return NextResponse.json({ error: "gridSizeM must be 100, 500 or 1000" }, { status: 400 });
      }
      const year = Number(body.year);
      if (!Number.isInteger(year) || year < 1900 || year > 2100) {
        return NextResponse.json({ error: "year must be a four-digit integer" }, { status: 400 });
      }
      if (typeof body.indicatorId !== "string" || !body.indicatorId.trim()) {
        return NextResponse.json({ error: "indicatorId is required" }, { status: 400 });
      }
      if (typeof body.unit !== "string" || !body.unit.trim()) {
        return NextResponse.json({ error: "unit is required" }, { status: 400 });
      }

      return NextResponse.json(previewSgisGridStatistics(text, {
        gridSizeM: gridSizeM as 100 | 500 | 1000,
        year,
        indicatorId: body.indicatorId.trim(),
        unit: body.unit.trim(),
        idField: typeof body.idField === "string" ? body.idField : undefined,
        valueField: typeof body.valueField === "string" ? body.valueField : undefined,
        limit,
      }));
    }

    return NextResponse.json(
      { error: `Unknown kind: ${String(body.kind)}`, allowed: ["legal-dong", "admin-classification", "sgis-grid"] },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to preview registry ingestion" },
      { status: 500 },
    );
  }
}
