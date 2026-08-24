import { EXPORT_PROFILES } from "./exports";
import { LAYER_REGISTRY } from "./layers";
import { SOURCE_REGISTRY } from "./sources";
import type { AtlasExportTarget, SpatialLevel } from "./types";

export interface AtlasExportPlanRequest {
  scope: {
    level: SpatialLevel;
    regionId?: string;
    regionCode?: string;
    regionName?: string;
    regionSnapshot?: string;
    legalCodes?: string[];
    year?: number;
  };
  layerIds: string[];
  target: AtlasExportTarget;
  outputCrs?: string;
}

export interface AtlasExportPlanLayer {
  layerId: string;
  title: string;
  status: "available" | "partial" | "planned";
  sourceId: string;
  sourceName: string;
  sourceCrs?: string;
  analysisCrs: string;
  outputFormat: string | null;
  joinKey?: string;
  warnings: string[];
}

function chooseFormat(target: AtlasExportTarget, layerFormats: string[], profileFormats: string[]) {
  const exact = profileFormats.find((format) => layerFormats.includes(format));
  if (exact) return exact;

  if (target === "qgis") {
    if (layerFormats.includes("geopackage")) return "geopackage";
    if (layerFormats.includes("geotiff")) return "geotiff";
    if (layerFormats.includes("cog")) return "cog";
    if (layerFormats.includes("csv")) return "csv";
  }

  if (target === "data") {
    return ["geoparquet", "parquet", "geojson", "csv", "cog", "geotiff"].find((format) => layerFormats.includes(format)) ?? null;
  }

  if (target === "web") {
    return ["pmtiles", "geojson", "cog", "json"].find((format) => layerFormats.includes(format)) ?? null;
  }

  return null;
}

export function buildExportPlan(request: AtlasExportPlanRequest) {
  const profile = EXPORT_PROFILES.find((item) => item.target === request.target);
  if (!profile) throw new Error(`Unknown export target: ${request.target}`);

  const uniqueLayerIds = [...new Set(request.layerIds)];
  if (!uniqueLayerIds.length) throw new Error("At least one layer is required");

  const missingLayerIds = uniqueLayerIds.filter((id) => !LAYER_REGISTRY.some((layer) => layer.id === id));
  if (missingLayerIds.length) throw new Error(`Unknown layer IDs: ${missingLayerIds.join(", ")}`);

  const layers: AtlasExportPlanLayer[] = uniqueLayerIds.map((layerId) => {
    const layer = LAYER_REGISTRY.find((item) => item.id === layerId)!;
    const source = SOURCE_REGISTRY.find((item) => item.id === layer.sourceId);
    const warnings: string[] = [];

    if (!layer.exportTargets.includes(request.target)) warnings.push(`${request.target} export is not enabled for this layer`);
    if (layer.status === "planned") warnings.push("Layer provider/ingestion is not implemented yet");
    if (layer.status === "partial") warnings.push("Layer is only partially implemented or still needs provider/runtime verification");
    if (!layer.spatialLevels.includes(request.scope.level) && !layer.spatialLevels.includes("feature") && !layer.spatialLevels.includes("raster-scene")) {
      warnings.push(`Layer is not natively published at ${request.scope.level}; an explicit join/aggregation step may be required`);
    }

    const outputFormat = layer.exportTargets.includes(request.target)
      ? chooseFormat(request.target, layer.atlasFormats, profile.primaryFormats)
      : null;
    if (layer.exportTargets.includes(request.target) && !outputFormat) warnings.push("No direct normalized format currently matches the export profile");

    return {
      layerId: layer.id,
      title: layer.title,
      status: layer.status,
      sourceId: layer.sourceId,
      sourceName: source?.name ?? layer.sourceId,
      sourceCrs: layer.sourceCrs,
      analysisCrs: layer.analysisCrs,
      outputFormat,
      joinKey: layer.joinKey,
      warnings,
    };
  });

  const outputCrs = request.outputCrs ?? profile.defaultOutputCrs ?? "preserve-source";
  const ready = layers.every((layer) => layer.status === "available" && layer.outputFormat && !layer.warnings.some((warning) => warning.includes("not enabled")));

  return {
    schemaVersion: "0.2.0",
    scope: {
      ...request.scope,
      legalCodes: [...new Set(request.scope.legalCodes ?? [])],
    },
    target: request.target,
    profile: profile.id,
    outputCrs,
    preserveSourceCrsMetadata: profile.preserveSourceCrs,
    ready,
    layers,
    provenanceRequired: true,
    notes: "This endpoint creates a reproducible extraction/export plan. It preserves the selected KIK region snapshot and admin-to-legal crosswalk when supplied, but does not claim that planned or partially implemented providers have already produced files.",
  };
}
