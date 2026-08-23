"use client";

import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { FormEvent, useEffect, useRef, useState } from "react";
import SiteAnalysisPanel, { DEFAULT_SITE_LAYERS, type OpenContextState } from "@/components/SiteAnalysisPanel";
import type { AtlasPoi, PoiSearchResponse } from "@/lib/poi/types";
import type { OsmContextResponse } from "@/lib/site-analysis/osm";

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
const OSM_SOURCE = "atlas-osm-context";
const OSM_BUILDINGS = "atlas-osm-buildings";
const OSM_ROADS = "atlas-osm-roads";
const OSM_LANDUSE = "atlas-osm-landuse";
const OSM_GREEN_WATER = "atlas-osm-green-water";

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
      style: process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://demotiles.maplibre.org/style.json",
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
    mapRef.current = map;

    return () => {
      map.off("moveend", syncCenter);
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
    setLayerVisibility(map, OSM_BUILDINGS, siteVisible && siteLayerIds.includes("buildings"));
    setLayerVisibility(map, OSM_ROADS, siteVisible && siteLayerIds.includes("roads"));
    setLayerVisibility(map, OSM_LANDUSE, siteVisible && siteLayerIds.includes("land-use"));
    setLayerVisibility(map, OSM_GREEN_WATER, siteVisible && siteLayerIds.includes("green-water"));
  }, [mode, siteLayerIds]);

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
      const response = await fetch(`/api/site/osm?${params}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `OSM request failed: ${response.status}`);
      const osm = payload as OsmContextResponse;

      const apply = () => {
        const source = map.getSource(OSM_SOURCE) as GeoJSONSource | undefined;
        if (source) source.setData(osm.featureCollection);
        else {
          map.addSource(OSM_SOURCE, { type: "geojson", data: osm.featureCollection });
          map.addLayer({
            id: OSM_LANDUSE,
            type: "fill",
            source: OSM_SOURCE,
            filter: ["==", ["get", "kind"], "landuse"],
            paint: { "fill-color": "#c7cbd1", "fill-opacity": 0.22 },
          });
          map.addLayer({
            id: OSM_GREEN_WATER,
            type: "fill",
            source: OSM_SOURCE,
            filter: ["==", ["get", "kind"], "green-water"],
            paint: { "fill-color": "#7fa68a", "fill-opacity": 0.35 },
          });
          map.addLayer({
            id: OSM_BUILDINGS,
            type: "fill",
            source: OSM_SOURCE,
            filter: ["==", ["get", "kind"], "building"],
            paint: { "fill-color": "#5f6670", "fill-opacity": 0.42, "fill-outline-color": "#444b55" },
          });
          map.addLayer({
            id: OSM_ROADS,
            type: "line",
            source: OSM_SOURCE,
            filter: ["==", ["get", "kind"], "road"],
            paint: { "line-color": "#4f5661", "line-width": 1.25, "line-opacity": 0.72 },
          });
        }

        setLayerVisibility(map, OSM_BUILDINGS, mode === "site" && siteLayerIds.includes("buildings"));
        setLayerVisibility(map, OSM_ROADS, mode === "site" && siteLayerIds.includes("roads"));
        setLayerVisibility(map, OSM_LANDUSE, mode === "site" && siteLayerIds.includes("land-use"));
        setLayerVisibility(map, OSM_GREEN_WATER, mode === "site" && siteLayerIds.includes("green-water"));
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
          {mode === "site" ? `Site Analysis 범위 · ${formatRadius(siteRadius)}` : `현재 지도 중심 기준 · 검색 반경 ${formatRadius(activeRadius)}`}
        </div>
        <div ref={mapContainer} className="map" />
      </section>
    </main>
  );
}
