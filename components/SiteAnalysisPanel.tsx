"use client";

import { useMemo, useState } from "react";
import {
  SITE_LAYER_GROUPS,
  SITE_LAYERS,
  SITE_PRESETS,
  type SiteLayerStatus,
} from "@/lib/site-analysis/catalog";

type Center = { lng: number; lat: number };

type Props = {
  center: Center;
  radius: number;
  onRadiusChange: (radius: number) => void;
  onExploreLayer: (layerId: string) => void;
};

const DEFAULT_LAYERS = SITE_PRESETS.neighborhood.layerIds;

const statusLabel = (status: SiteLayerStatus) => {
  if (status === "available") return "연결됨";
  if (status === "partial") return "POI 보완";
  return "다음";
};

export default function SiteAnalysisPanel({ center, radius, onRadiusChange, onExploreLayer }: Props) {
  const [selected, setSelected] = useState<string[]>(DEFAULT_LAYERS);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);

  const selectedDefinitions = useMemo(
    () => SITE_LAYERS.filter((layer) => selected.includes(layer.id)),
    [selected],
  );

  const availableCount = selectedDefinitions.filter((layer) => layer.status === "available").length;
  const partialCount = selectedDefinitions.filter((layer) => layer.status === "partial").length;
  const plannedCount = selectedDefinitions.filter((layer) => layer.status === "planned").length;
  const explorable = selectedDefinitions.find((layer) => layer.status !== "planned");

  function toggleLayer(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setSnapshotAt(null);
  }

  function applyPreset(key: string) {
    const preset = SITE_PRESETS[key];
    if (!preset) return;
    setSelected(preset.layerIds);
    setSnapshotAt(null);
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
        <div><b>{partialCount}</b><span>POI 보완</span></div>
        <div><b>{plannedCount}</b><span>다음 구현</span></div>
      </div>

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
          title={explorable ? `${explorable.label} 실제 조회 화면으로 이동` : "현재 선택한 레이어는 아직 데이터 연결 전입니다."}
        >
          연결 데이터 확인
        </button>
      </div>

      {snapshotAt && (
        <div className="site-snapshot">
          <strong>분석 구성 준비 완료</strong>
          <p>
            반경 {radius >= 1000 ? `${radius / 1000}km` : `${radius}m`} · {selected.length}개 레이어 · {new Date(snapshotAt).toLocaleString("ko-KR")}
          </p>
          <small>현재 단계에서는 범위와 레이어 카탈로그를 확정합니다. 실제 데이터가 연결되는 순서대로 동일한 구성에 지도·통계·다이어그램 결과가 채워집니다.</small>
        </div>
      )}
    </div>
  );
}
