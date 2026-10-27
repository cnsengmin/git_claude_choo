// Every layer folder, in sidebar order. scripts/layers/check-manifests.mjs fails when a
// layers/<group>/<id>/ folder is missing here or a style.ts is not registered.
import type { LayerManifest, LayerStyle } from "./types";
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
import { style as buildingsStyle } from "./physical/buildings/style";
import { style as roadsStyle } from "./physical/roads/style";
import { style as greenWaterStyle } from "./physical/green-water/style";
import { style as landUseStyle } from "./planning/land-use/style";

export { LAYER_GROUPS, LAYER_PRESETS } from "./groups";
export type { LayerGroup, LayerGroupId, LayerManifest, LayerStatus, LayerStyle } from "./types";

export const LAYERS = [
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
  "buildings": buildingsStyle,
  "roads": roadsStyle,
  "green-water": greenWaterStyle,
  "land-use": landUseStyle,
};

// Map layer and source ids for provider-backed layers.
export const mapLayerId = (layerId: string) => `atlas-layer-${layerId}`;
export const mapSourceId = (provider: string) => `atlas-provider-${provider}`;
