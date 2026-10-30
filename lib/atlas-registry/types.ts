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
  | "restricted-analysis"
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
export type AtlasRegionRelationType =
  | "rename"
  | "recode"
  | "split"
  | "merge"
  | "reorganize"
  | "absorbed"
  | "new"
  | "abolished"
  | "boundary-change"
  | "admin-legal-crosswalk";
/** lgu: 기초 단위(일반구를 시로 합침), sgg: 일반구 구분 시군구, admdong: 행정동. */
export type AtlasLayerLevel = "lgu" | "sgg" | "admdong";
export type AtlasCrosswalkMethod =
  | "code_1to1"
  | "recode"
  | "area_abolished_code"
  | "area_ceded_to_new"
  | "event_1to1_no_polygon";
export type AtlasEntityType = "region" | "relation" | "grid" | "feature" | "raster" | "statistic";
export type AtlasLayerStatus = "available" | "partial" | "planned";
export type AtlasLayerRole = "analysis" | "reference";
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
  role?: AtlasLayerRole;
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

/** A dated set of units in force (`kr-{level}@{referenceDate}`), built from the MOIS registry. */
export interface AtlasLayerVersion {
  id: string;
  level: AtlasLayerLevel;
  referenceDate: string;
  unitCount: number;
  /** admdongkor boundary version drawn for this layer (YYYYMMDD). */
  boundaryVersion: string;
  /** How the boundary version's units compare with the layer's units. */
  status: string;
}

/** One link between neighbouring layers. Shares sum to 1 per source (wSrc*) and per target (wTgt*). */
export interface AtlasCrosswalkEdge {
  level: AtlasLayerLevel;
  fromLayer: string;
  toLayer: string;
  fromCode: string;
  toCode: string;
  wSrc: number;
  wTgt: number;
  wSrcPop: number;
  wTgtPop: number;
  method: AtlasCrosswalkMethod;
  eventIds: string[];
  /** Census year of the population weights (2015 / 2020 / 2024); null when no event touched the unit. */
  popYear: number | null;
}

/** A row of a chained crosswalk from any layer to a base layer (crosswalk/{level}_to_{base}.csv). */
export interface AtlasCrosswalkRow {
  fromDate: string;
  toDate: string;
  fromCode: string;
  fromSido: string;
  fromName: string;
  toCode: string;
  toSido: string;
  toName: string;
  wSrc: number;
  wSrcPop: number;
  wTgt: number;
  wTgtPop: number;
  /** True when some step of the path split the unit. */
  alloc: boolean;
}

/** Another code system's code for a layer unit. Never derived by cutting digits. */
export interface AtlasCodeMapEntry {
  layer: string;
  /** e.g. KOSTAT5_7 (5-digit sigungu, through 2021) or KOSTAT5_8 (from 2022). */
  codeSystem: string;
  code: string;
  /** MOIS 10-digit code of the layer unit. */
  baseCode: string;
  method: string;
  /** boundary_polygon (boundary version codes) or official_linkage (국가데이터처 연계정보). */
  evidence: string;
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
