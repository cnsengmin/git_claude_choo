export type AgentAccessGrade = "A" | "B" | "C" | "D";

export type SourceCategory =
  | "administration"
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

export type AtlasRegionType = "sido" | "sigungu" | "admin-dong" | "legal-dong";
export type AtlasRegionRelationType = "rename" | "split" | "merge" | "new" | "abolished" | "boundary-change" | "admin-legal-crosswalk";
export type AtlasEntityType = "region" | "relation" | "grid" | "feature" | "raster" | "statistic";
export type AtlasLayerStatus = "available" | "partial" | "planned";
export type AtlasExportTarget = "web" | "data" | "qgis" | "cad" | "mcp";
export type AtlasDatasetVerification = "source-verified" | "catalogued" | "runtime-verified" | "manual";

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

export interface AtlasDatasetManifest {
  id: string;
  title: string;
  sourceId: string;
  authority: string;
  official: boolean;
  agentGrade: AgentAccessGrade;
  accessMethod: AccessMethod;
  requiresEnv?: string[];
  dataPageUrl: string;
  sourceFormats: string[];
  atlasFormats: string[];
  spatialLevels: SpatialLevel[];
  sourceCrs?: string;
  nativeIdField?: string;
  referenceDate?: string;
  updateCycle: string;
  verification: AtlasDatasetVerification;
  status: AtlasLayerStatus;
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
  regionType: AtlasRegionType;
  officialCode: string;
  name: string;
  sourceId?: string;
  sourceDatasetId?: string;
  sourceRecordId?: string;
  parentAtlasRegionId?: string | null;
  parentOfficialCode?: string | null;
  revisionDate?: string;
  validFrom?: string;
  validTo?: string | null;
  boundaryVersion?: string;
  legalCode?: string | null;
  residentCode?: string | null;
  cadastralCode?: string | null;
}

export interface AtlasRegionRelation {
  id: string;
  relationType: AtlasRegionRelationType;
  fromRegionIds: string[];
  toRegionIds: string[];
  effectiveDate?: string;
  sourceId: string;
  sourceRecordId?: string;
  notes?: string;
}

export interface AtlasGridRef {
  atlasGridId: string;
  nativeGridId: string;
  gridSystem: string;
  gridSizeM: 100 | 500 | 1000;
  crs: string;
}

export interface AtlasGridSystemDefinition {
  id: string;
  providerId: string;
  title: string;
  sizesM: Array<100 | 500 | 1000>;
  crs: string;
  nativeIdPolicy: "preserve";
  notes: string;
}

export interface AtlasIndicatorDefinition {
  id: string;
  title: string;
  category: "population" | "household" | "business" | "employment" | "building" | "mobility" | "environment" | "facility";
  unit: string;
  spatialLevels: SpatialLevel[];
  preferredSourceIds: string[];
  notes: string;
}

export interface AtlasExportProfile {
  id: string;
  title: string;
  target: AtlasExportTarget;
  primaryFormats: string[];
  preserveSourceCrs: boolean;
  defaultOutputCrs?: string;
  notes: string;
}
