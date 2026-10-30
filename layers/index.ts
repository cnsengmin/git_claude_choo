// Every layer folder, in sidebar order. scripts/layers/check-manifests.mjs fails when a
// layers/<group>/<id>/ folder is missing here or a style.ts is not registered.
import type { LayerManifest, LayerStyle } from "./types";
import adminSido from "./boundaries/admin-sido/layer.json";
import adminLgu from "./boundaries/admin-lgu/layer.json";
import adminSgg from "./boundaries/admin-sgg/layer.json";
import adminDong from "./boundaries/admin-dong/layer.json";
import buildings from "./physical/buildings/layer.json";
import buildingUse from "./physical/building-use/layer.json";
import buildingAge from "./physical/building-age/layer.json";
import buildingHeight from "./physical/building-height/layer.json";
import roads from "./physical/roads/layer.json";
import greenWater from "./physical/green-water/layer.json";
import terrain from "./physical/terrain/layer.json";
import cadastral from "./physical/cadastral/layer.json";
import zoning from "./planning/zoning/layer.json";
import districtPlan from "./planning/district-plan/layer.json";
import plannedFacilities from "./planning/planned-facilities/layer.json";
import landUse from "./planning/land-use/layer.json";
import transit from "./mobility/transit/layer.json";
import walkAccess from "./mobility/walk-access/layer.json";
import populationAdmin from "./people/population-admin/layer.json";
import populationOa from "./people/population-oa/layer.json";
import sggStats2025 from "./people/sgg-stats-2025/layer.json";
import sggPanel from "./people/sgg-panel/layer.json";
import population100m from "./people/population-100m/layer.json";
import businessStats from "./people/business-stats/layer.json";
import employment from "./people/employment/layer.json";
import floatingPop from "./people/floating-pop/layer.json";
import livePoi from "./places/live-poi/layer.json";
import medical from "./places/medical/layer.json";
import foodCafe from "./places/food-cafe/layer.json";
import convenience from "./places/convenience/layer.json";
import culture from "./places/culture/layer.json";
import hotspot from "./places/hotspot/layer.json";
import { style as adminSidoStyle } from "./boundaries/admin-sido/style";
import { style as adminLguStyle } from "./boundaries/admin-lgu/style";
import { style as adminSggStyle } from "./boundaries/admin-sgg/style";
import { style as adminDongStyle } from "./boundaries/admin-dong/style";
import { style as populationOaStyle } from "./people/population-oa/style";
import { style as population100mStyle } from "./people/population-100m/style";
import { style as sggStats2025Style } from "./people/sgg-stats-2025/style";
import { style as sggPanelStyle } from "./people/sgg-panel/style";
import { style as buildingsStyle } from "./physical/buildings/style";
import { style as roadsStyle } from "./physical/roads/style";
import { style as greenWaterStyle } from "./physical/green-water/style";
import { style as landUseStyle } from "./planning/land-use/style";

export { LAYER_GROUPS, LAYER_PRESETS } from "./groups";
export type { LayerControl, LayerGroup, LayerGroupId, LayerLegend, LayerManifest, LayerStatus, LayerStyle } from "./types";

export const LAYERS = [
  adminSido,
  adminLgu,
  adminSgg,
  adminDong,
  buildings,
  buildingUse,
  buildingAge,
  buildingHeight,
  roads,
  greenWater,
  terrain,
  cadastral,
  zoning,
  districtPlan,
  plannedFacilities,
  landUse,
  transit,
  walkAccess,
  populationAdmin,
  populationOa,
  sggStats2025,
  sggPanel,
  population100m,
  businessStats,
  employment,
  floatingPop,
  livePoi,
  medical,
  foodCafe,
  convenience,
  culture,
  hotspot,
] as LayerManifest[];

export const LAYER_STYLES: Record<string, LayerStyle> = {
  "admin-sido": adminSidoStyle,
  "admin-lgu": adminLguStyle,
  "admin-sgg": adminSggStyle,
  "admin-dong": adminDongStyle,
  "buildings": buildingsStyle,
  "roads": roadsStyle,
  "green-water": greenWaterStyle,
  "land-use": landUseStyle,
  "population-oa": populationOaStyle,
  "population-100m": population100mStyle,
  "sgg-stats-2025": sggStats2025Style,
  "sgg-panel": sggPanelStyle,
};

// Map layer and source ids for provider-backed layers.
export const mapLayerId = (layerId: string) => `atlas-layer-${layerId}`;
export const mapSourceId = (provider: string) => `atlas-provider-${provider}`;
