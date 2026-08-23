"use client";

import { useMemo, useState } from "react";
import {
  SITE_LAYER_GROUPS,
  SITE_LAYERS,
  SITE_PRESETS,
  type SiteLayerStatus,
} from "@/lib/site-analysis/catalog";

type Center = { lng: number; lat: number };
type OsmCounts = { building: number; road: number; landuse: number; "green-water": number };

export type OpenContextState = {
  loading: boolean;
  error?: string;
  counts?: OsmCounts;
  radius?: number;
  retrievedAt?: string;
  warning?: string;
};

type Props = {
  center: Center;
  radius: number;
  onRadiusChange: (radius: number) => void;
  onExploreLayer: (layerId: string) => void;
  onSelectionChange: (layerIds: string[]) => void;
  onLoadOpenContext: () => void;
  openContext: OpenContextState;
};

export const DEFAULT_SITE_LAYERS = SITE_PRESETS.neighborhood.layerIds;
const OSM_LAYER_IDS = new Set(["buildings", "roads", "green-water", "land-use"]);

const statusLabel = (status: SiteLayerStatus) => {
  if (status === "available") return "연결됨";
  if (status === "partial") return "보완";
  return "다음";
};

export default function SiteAnalysisPanel({
  center,
  radius,
  onRadiusChange,
  onExploreLayer,
  onSelectionChange,
  onLoadOpenContext,
  openContext,
}: Props) {
  const [selected, setSelected] = useState<string[]>(DEFAULT_SITE_LAYERS);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);

  const selectedDefinitions = useMemo(
    () => SITE_LAYERS.filter((layer) => selected.includes(layer.id)),
    [selected],
  );

  const availableCount = selectedDefinitions.filter((layer) => layer.status === "available").length;
  const partialCount = selectedDefinitions.filter((layer) => layer.status === "partial").length;
  const plannedCount = selectedDefinitions.filter((layer) => layer.status === "planned").length;
  const explorable = selectedDefinitions.find((layer) => ["live-poi", "medical", "food-cafe", "convenience", "culture"].includes(layer.id));
  const hasOsmLayer = selected.some((id) => OSM_LAYER_IDS.has(id));

  function commitSelection(next: string[]) {
    setSelected(next);
    onSelectionChange(next);
    setSnapshotAt(null);
  }

  function toggleLayer(id: string) {
    commitSelection(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  }

  function applyPreset(key: string) {
    const preset = SITE_PRESETS[key];
    if (!preset) return;
    commitSelection(preset.layerIds);
  }

  return (
    <div className="site-panel">
      <div className="site-intro">
        <strong>Site Analysis Mode</strong>
        <p>대상지 범위를 정하고 Physical → Planning → Mobility → People & Economy → Places 레이어를 한 번에 구성합니다.</p>
      </div>

      <div className="site-scope-card">
        <div>
          <span className="eyebrow">분석 중심</span>
          <strong>{center.lat.toFixed(5)}, {center.lng.toFixed(5)}</strong>
        </div>
        <label>
          <span>분석 반경</span>
          <select value={radius} onChange={(event) => onRadiusChange(Number(event.target.value))}>
            <option value={100}>100m · 필지/건물</option>
            <option value={500}>500m · 근린권</option>
            <option value={1000}>1km · 생활권</option>
            <option value={3000}>3km · 도시맥락</option>
          </select>
        </label>
      </div>

      <div className="preset-row" aria-label="Site analysis presets">
        {Object.entries(SITE_PRESETS).map(([key, preset]) => (
          <button type="button" key={key} onClick={() => applyPreset(key)}>{preset.label}</button>
        ))}
      </div>

      <div className="analysis-summary">
        <div><b>{selected.length}</b><span>선택 레이어</span></div>
        <div><b>{availableCount}</b><span>API 연결</span></div>
        <div><b>{partialCount}</b><span>오픈/POI 보완</span></div>
        <div><b>{plannedCount}</b><span>다음 구현</span></div>
      </div>

      <section className="open-context-card">
        <div className="open-context-heading">
          <div>
            <strong>Open-source context</strong>
            <small>OSM Overpass로 건물·도로·토지이용·녹지/수계를 즉시 확인합니다.</small>
          </div>
          <span>ODbL</span>
        </div>
        <button type="button" onClick={onLoadOpenContext} disabled={!hasOsmLayer || openContext.loading}>
          {openContext.loading ? "OSM 불러오는 중…" : "선택 지역 OSM 컨텍스트 불러오기"}
        </button>
        {!hasOsmLayer && <small className="open-context-note">건물·도로·녹지/하천·토지이용 중 하나를 선택하면 사용할 수 있습니다.</small>}
        {openContext.error && <div className="error compact">{openContext.error}</div>}
        {openContext.counts && (
          <div className="osm-counts">
            <span>건물 <b>{openContext.counts.building}</b></span>
            <span>도로 <b>{openContext.counts.road}</b></span>
            <span>토지이용 <b>{openContext.counts.landuse}</b></span>
            <span>녹지·수계 <b>{openContext.counts["green-water"]}</b></span>
          </div>
        )}
        {openContext.retrievedAt && <small className="open-context-note">© OpenStreetMap contributors · 조회 {new Date(openContext.retrievedAt).toLocaleString("ko-KR")}</small>}
        {openContext.warning && <small className="open-context-note">{openContext.warning}</small>}
      </section>

      <div className="layer-groups">
        {SITE_LAYER_GROUPS.map((group) => {
          const layers = SITE_LAYERS.filter((layer) => layer.group === group.id);
          return (
            <section className="layer-group" key={group.id}>
              <div className="layer-group-heading">
                <div>
                  <strong>{group.label}</strong>
                  <small>{group.description}</small>
                </div>
                <span>{layers.filter((layer) => selected.includes(layer.id)).length}/{layers.length}</span>
              </div>

              <div className="layer-checks">
                {layers.map((layer) => (
                  <label className="layer-check" key={layer.id} title={`${layer.description} · ${layer.source}`}>
                    <input
                      type="checkbox"
                      checked={selected.includes(layer.id)}
                      onChange={() => toggleLayer(layer.id)}
                    />
                    <span className="layer-check-copy">
                      <b>{layer.label}</b>
                      <small>{layer.source}</small>
                    </span>
                    <span className={`layer-status ${layer.status}`}>{statusLabel(layer.status)}</span>
                  </label>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <div className="site-actions">
        <button type="button" className="primary" onClick={() => setSnapshotAt(new Date().toISOString())}>
          현재 분석 구성 확정
        </button>
        <button
          type="button"
          disabled={!explorable}
          onClick={() => explorable && onExploreLayer(explorable.id)}
          title={explorable ? `${explorable.label} 실제 조회 화면으로 이동` : "선택한 Places 레이어 중 연결 가능한 데이터가 없습니다."}
        >
          POI/공식 데이터 확인
        </button>
      </div>

      {snapshotAt && (
        <div className="site-snapshot">
          <strong>분석 구성 준비 완료</strong>
          <p>
            반경 {radius >= 1000 ? `${radius / 1000}km` : `${radius}m`} · {selected.length}개 레이어 · {new Date(snapshotAt).toLocaleString("ko-KR")}
          </p>
          <small>OSM은 즉시 맥락 확인용 보완 레이어이며, 건물대장·지적·도시계획·SGIS 등 공식 데이터가 연결되는 순서대로 동일한 구성에 분석 결과가 채워집니다.</small>
        </div>
      )}
    </div>
  );
}
