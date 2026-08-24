export type AgentAccessGrade = "A" | "B" | "C" | "D";

export type SourceCategory =
  | "statistics"
  | "spatial-statistics"
  | "vector"
  | "raster"
  | "poi"
  | "facility"
  | "mixed";

export type AccessMethod =
  | "public-api"
  | "api-key"
  | "oauth"
  | "wms"
  | "wfs"
  | "wmts"
  | "file-download"
  | "manual-download"
  | "stac"
  | "local-cache";

export type SpatialLevel =
  | "national"
  | "sido"
  | "sigungu"
  | "admin-dong"
  | "legal-dong"
  | "grid-1km"
  | "grid-500m"
  | "grid-100m"
  | "feature"
  | "raster-scene";

export type AtlasEntityType = "region" | "grid" | "feature" | "raster" | "statistic";

export type AtlasLayerStatus = "available" | "partial" | "planned";

export type AtlasExportTarget = "web" | "data" | "qgis" | "cad" | "mcp";

export interface AtlasCrsDefinition {
  id: string;
  epsg: number;
  label: string;
  role: "source" | "analysis" | "display" | "supported";
  unit: "degree" | "metre";
  notes: string;
}

export interface AtlasSourceManifest {
  id: string;
  name: string;
  category: SourceCategory;
  official: boolean;
  agentGrade: AgentAccessGrade;
  accessMethods: AccessMethod[];
  requiresEnv?: string[];
  sourceFormats: string[];
  spatialLevels: SpatialLevel[];
  preferredFor: string[];
  fallbackIds?: string[];
  licenseNote: string;
  notes: string;
}

export interface AtlasLayerManifest {
  id: string;
  title: string;
  group: "administration" | "statistics" | "built" | "planning" | "mobility" | "places" | "environment";
  entityType: AtlasEntityType;
  geometryType?: "point" | "line" | "polygon" | "raster" | "none";
  sourceId: string;
  fallbackSourceIds?: string[];
  nativeIdField?: string;
  sourceCrs?: string;
  analysisCrs: string;
  spatialLevels: SpatialLevel[];
  temporalType: "static" | "annual" | "periodic" | "realtime" | "scene";
  sourceFormats: string[];
  atlasFormats: string[];
  exportTargets: AtlasExportTarget[];
  joinKey?: string;
  status: AtlasLayerStatus;
  notes: string;
}

export interface AtlasRegionRef {
  atlasRegionId: string;
  regionType: "sido" | "sigungu" | "admin-dong" | "legal-dong";
  officialCode: string;
  name: string;
  validFrom?: string;
  validTo?: string | null;
  boundaryVersion?: string;
}

export interface AtlasGridRef {
  atlasGridId: string;
  nativeGridId: string;
  gridSystem: string;
  gridSizeM: 100 | 500 | 1000;
  crs: string;
}
