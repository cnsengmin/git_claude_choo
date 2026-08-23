"use client";

import maplibregl, { type Map as MapLibreMap, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { AtlasPoi, PoiSearchResponse } from "@/lib/poi/types";

type Provider = "kakao" | "naver" | "google" | "hira";
type ProviderStatus = { configured: boolean; requires: string[]; note?: string };
type StatusResponse = { providers: Record<Provider, ProviderStatus> };

const PROVIDERS: { id: Provider; label: string; description: string }[] = [
  { id: "kakao", label: "Kakao", description: "현재 지도 주변 POI" },
  { id: "naver", label: "Naver", description: "국내 상호·장소 검색" },
  { id: "google", label: "Google", description: "글로벌 POI·평점" },
  { id: "hira", label: "HIRA 공식", description: "심평원 의료기관" },
];

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

export default function AtlasMap() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const [query, setQuery] = useState("카페");
  const [provider, setProvider] = useState<Provider>("kakao");
  const [radius, setRadius] = useState(1200);
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
      center: [126.9568, 37.3943],
      zoom: 14,
      pitch: 35,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

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

  return (
    <main className="atlas-shell">
      <aside className="sidebar">
        <div className="brand">ATLAS KR</div>
        <p className="subtitle">한국의 공간통계와 현재 POI를 함께 읽는 도시 아틀라스 MVP</p>

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
      </aside>

      <section className="map-wrap">
        <div className="map-label">현재 지도 중심 기준 · 검색 반경 {formatRadius(radius)}</div>
        <div ref={mapContainer} className="map" />
      </section>
    </main>
  );
}
