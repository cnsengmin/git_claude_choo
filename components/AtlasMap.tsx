"use client";

import maplibregl, { type AddLayerObject, type GeoJSONSource, type Map as MapLibreMap, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { FormEvent, useEffect, useRef, useState } from "react";
import SiteAnalysisPanel, { DEFAULT_SITE_LAYERS, type OpenContextState } from "@/components/SiteAnalysisPanel";
import { LAYER_STYLES, LAYERS, mapLayerId, mapSourceId } from "@/layers";
import type { OsmContextResponse } from "@/layers/providers/osm-overpass/server";
import { BASEMAP_STYLE } from "@/lib/map/basemap";
import type { AtlasPoi, PoiSearchResponse } from "@/lib/poi/types";

type Provider = "kakao" | "naver" | "google" | "hira";
type ProviderStatus = { configured: boolean; requires: string[]; note?: string };
type StatusResponse = { providers: Record<Provider, ProviderStatus> };
type AppMode = "explore" | "site";
type MapCenter = { lng: number; lat: number };
type CircleFeature = {
  type: "Feature";
  properties: Record<string, never>;
  geometry: { type: "Polygon"; coordinates: number[][][] };
};

const PROVIDERS: { id: Provider; label: string; description: string }[] = [
  { id: "kakao", label: "Kakao", description: "현재 지도 주변 POI" },
  { id: "naver", label: "Naver", description: "국내 상호·장소 검색" },
  { id: "google", label: "Google", description: "글로벌 POI·평점" },
  { id: "hira", label: "HIRA 공식", description: "심평원 의료기관" },
];

const INITIAL_CENTER: MapCenter = { lng: 126.9568, lat: 37.3943 };
const ANALYSIS_SOURCE = "atlas-site-analysis-area";
const ANALYSIS_FILL = "atlas-site-analysis-fill";
const ANALYSIS_LINE = "atlas-site-analysis-line";
const OSM_PROVIDER = "osm-overpass";
const OSM_SOURCE = mapSourceId(OSM_PROVIDER);
// Layers drawn from the Overpass response, bottom to top (layers/<group>/<id>/style.ts).
const OSM_LAYERS = LAYERS
  .filter((layer) => layer.provider === OSM_PROVIDER && LAYER_STYLES[layer.id])
  .sort((a, b) => LAYER_STYLES[a.id].order - LAYER_STYLES[b.id].order);
// Layers drawn from provider vector tiles (boundaries, output-area population), set to the
// date or year chosen in the sidebar. Each gets an invisible fill underneath so a click
// inside a unit finds it.
const TILE_LAYERS = LAYERS
  .filter((layer) => layer.provider && LAYER_STYLES[layer.id]?.tiles)
  .sort((a, b) => LAYER_STYLES[a.id].order - LAYER_STYLES[b.id].order);
const pickLayerId = (layerId: string) => `${mapLayerId(layerId)}-pick`;
const LAYER_BY_PICK = new Map(TILE_LAYERS.map((layer) => [pickLayerId(layer.id), layer.id]));
const LAYER_TIMES = new Map(TILE_LAYERS.flatMap((layer) => {
  const time = LAYER_STYLES[layer.id].time;
  return time ? [[time.key, time] as const] : [];
}));
const INITIAL_TIMES = Object.fromEntries([...LAYER_TIMES.values()].map((time) => [time.key, time.initial]));
const timeLabel = (key: string, value: string) => {
  const time = LAYER_TIMES.get(key);
  return `${time?.label ?? key} ${time?.options.find((option) => option.value === value)?.label ?? value}`;
};

function addTileLayers(map: MapLibreMap) {
  TILE_LAYERS.forEach((layer) => {
    const { order: _order, tiles, time: _time, describe: _describe, legend: _legend, ...style } = LAYER_STYLES[layer.id];
    if (!tiles) return;
    const source = mapSourceId(`${layer.provider}-${tiles.path}`);
    if (!map.getSource(source)) {
      map.addSource(source, {
        type: "vector",
        tiles: [`${window.location.origin}/api/layers/${layer.provider}/${tiles.path}/{z}/{x}/{y}.pbf`],
        minzoom: tiles.minzoom,
        maxzoom: tiles.maxzoom,
      });
    }
    const common = { source, "source-layer": tiles.sourceLayer, layout: { visibility: "none" as const } };
    map.addLayer({ id: pickLayerId(layer.id), type: "fill", ...common, paint: { "fill-color": "#000000", "fill-opacity": 0 } });
    map.addLayer({ id: mapLayerId(layer.id), ...common, ...style } as AddLayerObject);
  });
}

// One line per clicked feature from its layer's describe(), topmost layer first, under the
// dates or years in use.
function featurePopup(features: maplibregl.MapGeoJSONFeature[], times: Record<string, string>) {
  const lines = new Set<string>();
  const keys = new Set<string>();
  [...features]
    .map((feature) => ({ feature, layerId: LAYER_BY_PICK.get(feature.layer.id) ?? "" }))
    .filter(({ layerId }) => LAYER_STYLES[layerId]?.describe)
    .sort((a, b) => LAYER_STYLES[b.layerId].order - LAYER_STYLES[a.layerId].order)
    .forEach(({ feature, layerId }) => {
      const { describe, time } = LAYER_STYLES[layerId];
      if (time) keys.add(time.key);
      lines.add(describe!(feature.properties, time ? times[time.key] : undefined));
    });

  const root = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = [...keys].map((key) => timeLabel(key, times[key])).join(" · ");
  root.append(title);
  lines.forEach((text) => {
    const line = document.createElement("div");
    line.textContent = text;
    root.append(line);
  });
  return root;
}

const googleTypesFromQuery = (query: string): string[] | undefined => {
  if (query.includes("편의점")) return ["convenience_store"];
  if (query.includes("약국")) return ["pharmacy"];
  if (query.includes("병원") || query.includes("의원")) return ["hospital", "doctor"];
  if (query.includes("카페") || query.includes("커피")) return ["cafe"];
  if (query.includes("영화")) return ["movie_theater"];
  if (query.includes("음식") || query.includes("맛집") || query.includes("식당")) return ["restaurant"];
  return undefined;
};

const isMedicalQuery = (query: string) => /병원|의원|의료|클리닉|내과|외과|치과|한의/u.test(query);
const formatRadius = (radius: number) => radius >= 1000 ? `${(radius / 1000).toFixed(1)}km` : `${radius}m`;

function circleFeature(center: MapCenter, radiusM: number, steps = 96): CircleFeature {
  const earthRadius = 6371008.8;
  const angular = radiusM / earthRadius;
  const lat1 = center.lat * Math.PI / 180;
  const lng1 = center.lng * Math.PI / 180;
  const coordinates: number[][] = [];

  for (let index = 0; index <= steps; index += 1) {
    const bearing = (index / steps) * Math.PI * 2;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angular)
      + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
    );
    const lng2 = lng1 + Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );
    coordinates.push([lng2 * 180 / Math.PI, lat2 * 180 / Math.PI]);
  }

  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coordinates] },
  };
}

function setLayerVisibility(map: MapLibreMap, layerId: string, visible: boolean) {
  if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
}

export default function AtlasMap() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const [mode, setMode] = useState<AppMode>("explore");
  const [mapCenter, setMapCenter] = useState<MapCenter>(INITIAL_CENTER);
  const [query, setQuery] = useState("카페");
  const [provider, setProvider] = useState<Provider>("kakao");
  const [radius, setRadius] = useState(1200);
  const [siteRadius, setSiteRadius] = useState(1000);
  const [siteLayerIds, setSiteLayerIds] = useState<string[]>(DEFAULT_SITE_LAYERS);
  const [openContext, setOpenContext] = useState<OpenContextState>({ loading: false });
  const [layerTimes, setLayerTimes] = useState<Record<string, string>>(INITIAL_TIMES);
  const layerTimesRef = useRef(layerTimes);
  const [mapReady, setMapReady] = useState(false);
  const [data, setData] = useState<PoiSearchResponse | null>(null);
  const [providerStatus, setProviderStatus] = useState<StatusResponse["providers"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/status")
      .then(async (response) => {
        if (!response.ok) throw new Error(`status ${response.status}`);
        return response.json() as Promise<StatusResponse>;
      })
      .then((payload) => {
        if (!cancelled) setProviderStatus(payload.providers);
      })
      .catch(() => {
        if (!cancelled) setProviderStatus(null);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: BASEMAP_STYLE,
      center: [INITIAL_CENTER.lng, INITIAL_CENTER.lat],
      zoom: 14,
      pitch: 35,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    const syncCenter = () => {
      const center = map.getCenter();
      setMapCenter({ lng: center.lng, lat: center.lat });
    };
    map.on("moveend", syncCenter);
    map.once("load", () => {
      addTileLayers(map);
      setMapReady(true);
    });
    const showFeatures = (event: maplibregl.MapMouseEvent) => {
      const layers = TILE_LAYERS.map((layer) => pickLayerId(layer.id))
        .filter((id) => map.getLayer(id) && map.getLayoutProperty(id, "visibility") !== "none");
      if (!layers.length) return;
      const features = map.queryRenderedFeatures(event.point, { layers });
      if (!features.length) return;
      new maplibregl.Popup({ offset: 8 }).setLngLat(event.lngLat).setDOMContent(featurePopup(features, layerTimesRef.current)).addTo(map);
    };
    map.on("click", showFeatures);
    mapRef.current = map;

    return () => {
      map.off("moveend", syncCenter);
      map.off("click", showFeatures);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const updateArea = () => {
      const feature = circleFeature(mapCenter, siteRadius);
      const source = map.getSource(ANALYSIS_SOURCE) as GeoJSONSource | undefined;
      if (!source) {
        map.addSource(ANALYSIS_SOURCE, { type: "geojson", data: feature });
        map.addLayer({
          id: ANALYSIS_FILL,
          type: "fill",
          source: ANALYSIS_SOURCE,
          paint: { "fill-color": "#315efb", "fill-opacity": 0.08 },
        });
        map.addLayer({
          id: ANALYSIS_LINE,
          type: "line",
          source: ANALYSIS_SOURCE,
          paint: { "line-color": "#315efb", "line-width": 2, "line-opacity": 0.78 },
        });
      } else {
        source.setData(feature);
      }

      const visibility = mode === "site";
      setLayerVisibility(map, ANALYSIS_FILL, visibility);
      setLayerVisibility(map, ANALYSIS_LINE, visibility);
    };

    if (map.isStyleLoaded()) updateArea();
    else map.once("load", updateArea);
  }, [mapCenter, mode, siteRadius]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const siteVisible = mode === "site";
    OSM_LAYERS.forEach((layer) => setLayerVisibility(map, mapLayerId(layer.id), siteVisible && siteLayerIds.includes(layer.id)));
    TILE_LAYERS.forEach((layer) => {
      const visible = siteVisible && siteLayerIds.includes(layer.id);
      setLayerVisibility(map, mapLayerId(layer.id), visible);
      setLayerVisibility(map, pickLayerId(layer.id), visible);
    });
  }, [mode, siteLayerIds, mapReady]);

  useEffect(() => {
    layerTimesRef.current = layerTimes;
    const map = mapRef.current;
    if (!map || !mapReady) return;
    TILE_LAYERS.forEach((layer) => {
      const time = LAYER_STYLES[layer.id].time;
      if (!time) return;
      const { filter, paint } = time.apply(layerTimes[time.key]);
      if (filter) {
        map.setFilter(mapLayerId(layer.id), filter);
        map.setFilter(pickLayerId(layer.id), filter);
      }
      Object.entries(paint ?? {}).forEach(([name, value]) => map.setPaintProperty(mapLayerId(layer.id), name, value));
    });
  }, [layerTimes, mapReady]);

  useEffect(() => {
    setOpenContext({ loading: false });
    const map = mapRef.current;
    const source = map?.getSource(OSM_SOURCE) as GeoJSONSource | undefined;
    if (source) source.setData({ type: "FeatureCollection", features: [] });
  }, [mapCenter, siteRadius]);

  useEffect(() => {
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    const map = mapRef.current;
    if (!map || !data) return;

    const points = data.items.filter((item) => Number.isFinite(item.lng) && Number.isFinite(item.lat));
    points.forEach((item) => {
      const marker = new maplibregl.Marker()
        .setLngLat([item.lng as number, item.lat as number])
        .setPopup(new maplibregl.Popup({ offset: 18 }).setText(`${item.name} · ${item.categoryPath || item.category}`))
        .addTo(map);
      markersRef.current.push(marker);
    });

    if (points.length > 1) {
      const first = points[0];
      const bounds = points.reduce(
        (acc, item) => acc.extend([item.lng as number, item.lat as number]),
        new maplibregl.LngLatBounds([first.lng as number, first.lat as number], [first.lng as number, first.lat as number]),
      );
      map.fitBounds(bounds, { padding: 70, maxZoom: 16 });
    }
  }, [data]);

  function selectProvider(next: Provider) {
    setProvider(next);
    setData(null);
    setError(null);
    if (next === "hira" && !isMedicalQuery(query)) setQuery("병원");
  }

  function openExplorableLayer(layerId: string) {
    setMode("explore");
    setData(null);
    setError(null);

    if (layerId === "medical") {
      setProvider("hira");
      setQuery("병원");
      setRadius(siteRadius);
      return;
    }

    setProvider("kakao");
    setRadius(siteRadius);
    if (layerId === "convenience") setQuery("편의점");
    else if (layerId === "culture") setQuery("영화관");
    else if (layerId === "food-cafe") setQuery("카페");
    else setQuery("카페");
  }

  async function loadOpenContext() {
    const map = mapRef.current;
    if (!map) return;
    setOpenContext({ loading: true });

    try {
      const params = new URLSearchParams({
        x: String(mapCenter.lng),
        y: String(mapCenter.lat),
        radius: String(siteRadius),
      });
      const response = await fetch(`/api/layers/${OSM_PROVIDER}?${params}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `OSM request failed: ${response.status}`);
      const osm = payload as OsmContextResponse;

      const apply = () => {
        const source = map.getSource(OSM_SOURCE) as GeoJSONSource | undefined;
        if (source) source.setData(osm.featureCollection);
        else {
          map.addSource(OSM_SOURCE, { type: "geojson", data: osm.featureCollection });
          OSM_LAYERS.forEach((layer) => {
            const { order: _order, ...style } = LAYER_STYLES[layer.id];
            map.addLayer({ id: mapLayerId(layer.id), source: OSM_SOURCE, ...style } as AddLayerObject);
          });
        }

        OSM_LAYERS.forEach((layer) => setLayerVisibility(map, mapLayerId(layer.id), mode === "site" && siteLayerIds.includes(layer.id)));
      };

      if (map.isStyleLoaded()) apply();
      else map.once("load", apply);

      setOpenContext({
        loading: false,
        counts: osm.counts,
        radius: osm.radius,
        retrievedAt: osm.retrievedAt,
        warning: osm.warning,
      });
    } catch (err) {
      setOpenContext({ loading: false, error: err instanceof Error ? err.message : "OSM 컨텍스트 조회 중 오류가 발생했습니다." });
    }
  }

  async function runSearch(event?: FormEvent) {
    event?.preventDefault();
    const map = mapRef.current;
    if (!map || !query.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const center = map.getCenter();
      let response: Response;

      if (provider === "kakao") {
        const params = new URLSearchParams({
          query: query.trim(),
          x: String(center.lng),
          y: String(center.lat),
          radius: String(radius),
          sort: "distance",
        });
        response = await fetch(`/api/poi/kakao?${params}`);
      } else if (provider === "naver") {
        const params = new URLSearchParams({ query: query.trim(), sort: "comment" });
        response = await fetch(`/api/poi/naver?${params}`);
      } else if (provider === "hira") {
        const params = new URLSearchParams({
          query: query.trim(),
          x: String(center.lng),
          y: String(center.lat),
          radius: String(radius),
        });
        response = await fetch(`/api/poi/hira?${params}`);
      } else {
        response = await fetch("/api/poi/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lat: center.lat,
            lng: center.lng,
            radius,
            includedTypes: googleTypesFromQuery(query),
            maxResultCount: 15,
          }),
        });
      }

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Request failed: ${response.status}`);
      setData(payload as PoiSearchResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "검색 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  const mappedCount = data?.items.filter((item) => item.lat !== undefined && item.lng !== undefined).length ?? 0;
  const official = data?.sourceKind === "official" || data?.provider === "hira";
  const providerInfo = PROVIDERS.find((item) => item.id === provider);
  const selectedStatus = providerStatus?.[provider];
  const activeRadius = mode === "site" ? siteRadius : radius;
  const activeTimeKeys = [...new Set(TILE_LAYERS
    .filter((layer) => siteLayerIds.includes(layer.id))
    .flatMap((layer) => LAYER_STYLES[layer.id].time?.key ?? []))];

  return (
    <main className="atlas-shell">
      <aside className="sidebar">
        <div className="brand">ATLAS KR</div>
        <p className="subtitle">한국의 공간통계와 현재 POI를 함께 읽는 도시 아틀라스 MVP</p>

        <div className="mode-tabs" aria-label="Atlas mode">
          <button type="button" className={mode === "explore" ? "active" : ""} onClick={() => setMode("explore")}>Explore / POI</button>
          <button type="button" className={mode === "site" ? "active" : ""} onClick={() => setMode("site")}>Site Analysis</button>
        </div>

        {mode === "site" ? (
          <SiteAnalysisPanel
            center={mapCenter}
            radius={siteRadius}
            onRadiusChange={setSiteRadius}
            onExploreLayer={openExplorableLayer}
            onSelectionChange={setSiteLayerIds}
            onLoadOpenContext={loadOpenContext}
            openContext={openContext}
            layerTimes={layerTimes}
            onLayerTimeChange={(key, value) => setLayerTimes((current) => ({ ...current, [key]: value }))}
          />
        ) : (
          <>
            <form className="search-row" onSubmit={runSearch}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={provider === "hira" ? "병원/의원 또는 병원명..." : "카페, 편의점, 병원, 영화관..."}
              />
              <button type="submit" disabled={loading}>{loading ? "검색중" : "검색"}</button>
            </form>

            <div className="provider-row" aria-label="POI 데이터 제공자 선택">
              {PROVIDERS.map((item) => {
                const status = providerStatus?.[item.id];
                const statusTitle = status && !status.configured ? `미설정: ${status.requires.join(", ")}` : item.description;
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={provider === item.id ? "active" : ""}
                    onClick={() => selectProvider(item.id)}
                    title={statusTitle}
                  >
                    <span className={`status-dot ${status ? (status.configured ? "ready" : "missing") : "unknown"}`} aria-hidden="true" />
                    {item.label}
                  </button>
                );
              })}
            </div>

            {selectedStatus && !selectedStatus.configured && (
              <div className="config-warning">
                이 provider는 아직 환경변수가 필요합니다: <b>{selectedStatus.requires.join(", ")}</b>
              </div>
            )}

            <div className="radius-row">
              <span>검색 반경</span>
              <select value={radius} onChange={(event) => setRadius(Number(event.target.value))}>
                <option value={500}>500m</option>
                <option value={1200}>1.2km</option>
                <option value={2000}>2km</option>
                <option value={3000}>3km</option>
              </select>
              <small>{providerInfo?.description}</small>
            </div>

            <div className="stat-grid">
              <div className="stat-card"><b>{data?.count ?? 0}</b><span>{official ? "공식 의료시설" : "현재 검색 POI"}</span></div>
              <div className="stat-card"><b>{mappedCount}</b><span>지도 표시 가능</span></div>
            </div>

            {data && (
              <div className="source-strip">
                <span className={`source-kind ${official ? "official" : "live"}`}>{official ? "공식" : "LIVE"}</span>
                <div>
                  <strong>{data.areaLabel || `${data.provider} provider`}</strong>
                  <small>조회 {new Date(data.retrievedAt).toLocaleString("ko-KR")}</small>
                </div>
              </div>
            )}

            {error && <div className="error">{error}</div>}
            {data?.warning && <div className="warning">{data.warning}</div>}

            <section className="poi-list">
              {data?.items.map((item: AtlasPoi) => (
                <article className="poi-card" key={`${item.provider}:${item.providerId}`}>
                  <h3>{item.name}</h3>
                  <p>{item.roadAddress || item.address || "주소 정보 없음"}</p>
                  <p>{item.categoryPath || item.category}</p>
                  <div className="poi-meta">
                    <span className="badge">{item.provider === "hira" ? "HIRA 공식" : item.provider}</span>
                    {item.distanceM !== undefined && <span className="badge">{item.distanceM}m</span>}
                    {item.rating !== undefined && <span className="badge">★ {item.rating}</span>}
                    {item.reviewCount !== undefined && <span className="badge">리뷰 {item.reviewCount}</span>}
                    {typeof item.metadata?.doctorCount === "number" && <span className="badge">의사 {item.metadata.doctorCount}명</span>}
                  </div>
                </article>
              ))}
            </section>
          </>
        )}
      </aside>

      <section className="map-wrap">
        <div className="map-label">
          {mode === "site"
            ? [`Site Analysis 범위 · ${formatRadius(siteRadius)}`, ...activeTimeKeys.map((key) => timeLabel(key, layerTimes[key]))].join(" · ")
            : `현재 지도 중심 기준 · 검색 반경 ${formatRadius(activeRadius)}`}
        </div>
        <div ref={mapContainer} className="map" />
      </section>
    </main>
  );
}
