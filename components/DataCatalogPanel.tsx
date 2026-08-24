"use client";

import { useEffect, useMemo, useState } from "react";

type SpatialLevel = "sigungu" | "admin-dong" | "grid-1km" | "grid-500m" | "grid-100m";
type ExportTarget = "data" | "qgis" | "mcp" | "cad" | "web";
type LayerStatus = "available" | "partial" | "planned";

type CatalogLayer = {
  id: string;
  title: string;
  group: string;
  entityType: string;
  sourceId: string;
  fallbackSourceIds?: string[];
  sourceCrs?: string;
  analysisCrs: string;
  spatialLevels: string[];
  atlasFormats: string[];
  exportTargets: string[];
  status: LayerStatus;
  notes: string;
};

type CatalogSource = {
  id: string;
  name: string;
  official: boolean;
  agentGrade: "A" | "B" | "C" | "D";
};

type CatalogResponse = {
  schemaVersion: string;
  defaults: { analysisCrs: string; regionFirst: boolean; preserveNativeIds: boolean };
  sources: CatalogSource[];
  layers: CatalogLayer[];
};

type ExportPlan = {
  ready: boolean;
  outputCrs: string;
  target: ExportTarget;
  layers: Array<{
    layerId: string;
    title: string;
    status: LayerStatus;
    sourceName: string;
    outputFormat: string | null;
    warnings: string[];
  }>;
};

const LEVELS: Array<{ id: SpatialLevel; label: string; description: string }> = [
  { id: "sigungu", label: "시군구", description: "기초 지역 통계" },
  { id: "admin-dong", label: "읍면동", description: "생활권·행정동 통계" },
  { id: "grid-1km", label: "1km", description: "전국 비교 격자" },
  { id: "grid-500m", label: "500m", description: "중간 공간 단위" },
  { id: "grid-100m", label: "100m", description: "세부 공간통계" },
];

const EXPORTS: Array<{ id: ExportTarget; label: string }> = [
  { id: "data", label: "Data" },
  { id: "qgis", label: "QGIS" },
  { id: "mcp", label: "MCP" },
  { id: "cad", label: "CAD" },
  { id: "web", label: "Web" },
];

const GROUP_LABEL: Record<string, string> = {
  administration: "행정·경계",
  statistics: "통계",
  built: "건축·도시형태",
  planning: "토지·계획",
  mobility: "교통",
  places: "시설·POI",
  environment: "환경·위성",
};

export default function DataCatalogPanel() {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [level, setLevel] = useState<SpatialLevel>("admin-dong");
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState<ExportTarget>("qgis");
  const [year, setYear] = useState(2024);
  const [regionCode, setRegionCode] = useState("");
  const [plan, setPlan] = useState<ExportPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/catalog")
      .then(async (response) => {
        if (!response.ok) throw new Error(`catalog ${response.status}`);
        return response.json() as Promise<CatalogResponse>;
      })
      .then((payload) => {
        if (!cancelled) setCatalog(payload);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "카탈로그를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const sourceMap = useMemo(() => new Map((catalog?.sources ?? []).map((source) => [source.id, source])), [catalog]);

  const visibleLayers = useMemo(() => {
    if (!catalog) return [];
    return catalog.layers.filter((layer) => {
      if (layer.spatialLevels.includes(level)) return true;
      if (layer.spatialLevels.includes("feature")) return level === "sigungu" || level === "admin-dong";
      if (layer.spatialLevels.includes("raster-scene")) return level === "sigungu" || level === "admin-dong";
      return false;
    });
  }, [catalog, level]);

  const grouped = useMemo(() => {
    const map = new Map<string, CatalogLayer[]>();
    visibleLayers.forEach((layer) => {
      const items = map.get(layer.group) ?? [];
      items.push(layer);
      map.set(layer.group, items);
    });
    return [...map.entries()];
  }, [visibleLayers]);

  function toggleLayer(layerId: string) {
    setSelected((current) => current.includes(layerId) ? current.filter((id) => id !== layerId) : [...current, layerId]);
    setPlan(null);
  }

  async function makePlan() {
    if (!selected.length) return;
    setPlanning(true);
    setError(null);
    try {
      const response = await fetch("/api/export/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: { level, regionCode: regionCode.trim() || undefined, year },
          layerIds: selected,
          target,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `export plan ${response.status}`);
      setPlan(payload as ExportPlan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export plan 생성에 실패했습니다.");
    } finally {
      setPlanning(false);
    }
  }

  if (loading) return <section className="catalog-panel"><div className="site-intro"><strong>Data Catalog</strong><p>공통 레이어를 불러오는 중입니다…</p></div></section>;

  return (
    <section className="catalog-panel">
      <div className="site-intro">
        <strong>Region-first Data Catalog</strong>
        <p>지역 단위를 정하고 필요한 레이어만 선택합니다. 아직 모든 레이어를 하나의 지도에 합치지 않고, 분석·추출 시점에 결합합니다.</p>
      </div>

      <div className="catalog-scope">
        <label>
          <span>공간 단위</span>
          <select value={level} onChange={(event) => { setLevel(event.target.value as SpatialLevel); setSelected([]); setPlan(null); }}>
            {LEVELS.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.description}</option>)}
          </select>
        </label>
        <label>
          <span>기준연도</span>
          <select value={year} onChange={(event) => { setYear(Number(event.target.value)); setPlan(null); }}>
            {[2026, 2025, 2024, 2023, 2022, 2021, 2020].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>

      <label className="region-code-field">
        <span>지역코드 <small>선택 입력 · Registry 연결 전</small></span>
        <input value={regionCode} onChange={(event) => { setRegionCode(event.target.value); setPlan(null); }} placeholder="예: 행정동/시군구 공식코드" />
      </label>

      <div className="catalog-rule-strip">
        <span>분석 CRS <b>{catalog?.defaults.analysisCrs ?? "EPSG:5179"}</b></span>
        <span>Native ID <b>보존</b></span>
        <span>선택 <b>{selected.length}</b></span>
      </div>

      {error && <div className="error compact">{error}</div>}

      <div className="catalog-groups">
        {grouped.map(([group, layers]) => (
          <section className="catalog-group" key={group}>
            <div className="catalog-group-title"><strong>{GROUP_LABEL[group] ?? group}</strong><span>{layers.length}</span></div>
            {layers.map((layer) => {
              const source = sourceMap.get(layer.sourceId);
              return (
                <label className="catalog-layer" key={layer.id}>
                  <input type="checkbox" checked={selected.includes(layer.id)} onChange={() => toggleLayer(layer.id)} />
                  <div>
                    <b>{layer.title}</b>
                    <small>{source?.name ?? layer.sourceId} · Agent {source?.agentGrade ?? "?"}</small>
                    <small>{layer.atlasFormats.slice(0, 3).join(" · ")}</small>
                  </div>
                  <span className={`layer-status ${layer.status}`}>{layer.status}</span>
                </label>
              );
            })}
          </section>
        ))}
      </div>

      <div className="catalog-export">
        <div className="catalog-export-heading">
          <div><strong>Extract / Export</strong><small>현재는 재현 가능한 추출 계획을 생성합니다.</small></div>
          <select value={target} onChange={(event) => { setTarget(event.target.value as ExportTarget); setPlan(null); }}>
            {EXPORTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>
        <button type="button" disabled={!selected.length || planning} onClick={makePlan}>{planning ? "계획 생성 중…" : `선택 레이어 ${selected.length}개 Export Plan`}</button>
      </div>

      {plan && (
        <div className="export-plan-card">
          <div className="export-plan-head"><strong>{plan.target.toUpperCase()} plan</strong><span>{plan.ready ? "READY" : "PARTIAL"}</span></div>
          <small>출력 CRS · {plan.outputCrs}</small>
          <div className="export-plan-layers">
            {plan.layers.map((layer) => (
              <div key={layer.layerId}>
                <b>{layer.title}</b>
                <span>{layer.outputFormat ?? "변환 필요"}</span>
                <small>{layer.sourceName}</small>
                {layer.warnings.slice(0, 1).map((warning) => <em key={warning}>{warning}</em>)}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
