"use client";

import maplibregl, { type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";

type DemoManifest = {
  region: { dong: { name: string; code: string } };
  selected_grid_count: number;
  explicit_statistic_row_count: number;
  no_stat_row_count: number;
  sum_explicit_intersecting_grid_values: number;
  statistics_reference_year: number;
  grid_reference_year: number;
};

type FeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon, {
  native_grid_id?: string;
  population_total?: number | null;
  population_status?: string;
  indicator_code?: string;
  sgis_adm_nm?: string;
}>;

const GEOJSON_URL = "https://raw.githubusercontent.com/cnsengmin/git_claude_choo/atlas-mvp/data/derived/sgis/burim/sgis-2024-100m-31042580.geojson";
const MANIFEST_URL = "https://raw.githubusercontent.com/cnsengmin/git_claude_choo/atlas-mvp/data/derived/sgis/burim/sgis-2024-100m-31042580.manifest.json";
const SOURCE_ID = "burim-grid";
const FILL_ID = "burim-grid-fill";
const LINE_ID = "burim-grid-line";

function boundsFromGeoJSON(data: FeatureCollection) {
  const bounds = new maplibregl.LngLatBounds();
  for (const feature of data.features) {
    for (const ring of feature.geometry.coordinates) {
      for (const [lng, lat] of ring) bounds.extend([lng, lat]);
    }
  }
  return bounds;
}

export default function BurimGridDemo() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [manifest, setManifest] = useState<DemoManifest | null>(null);
  const [selected, setSelected] = useState<{ id?: string; population?: number | null; status?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://demotiles.maplibre.org/style.json",
      center: [126.9568, 37.3943],
      zoom: 14.4,
      pitch: 0,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;

    Promise.all([
      fetch(GEOJSON_URL).then(async (response) => {
        if (!response.ok) throw new Error(`GeoJSON ${response.status}`);
        return response.json() as Promise<FeatureCollection>;
      }),
      fetch(MANIFEST_URL).then(async (response) => {
        if (!response.ok) throw new Error(`Manifest ${response.status}`);
        return response.json() as Promise<DemoManifest>;
      }),
    ])
      .then(([geojson, meta]) => {
        setManifest(meta);
        const render = () => {
          if (!map.getSource(SOURCE_ID)) {
            map.addSource(SOURCE_ID, { type: "geojson", data: geojson });
            map.addLayer({
              id: FILL_ID,
              type: "fill",
              source: SOURCE_ID,
              paint: {
                "fill-color": [
                  "case",
                  ["==", ["get", "population_status"], "no-stat-row"], "#d7dce2",
                  ["step", ["coalesce", ["get", "population_total"], 0],
                    "#dfeaf6",
                    100, "#b9d2eb",
                    300, "#7fafd8",
                    600, "#3e7fb9",
                    900, "#174f87"
                  ],
                ],
                "fill-opacity": 0.78,
              },
            });
            map.addLayer({
              id: LINE_ID,
              type: "line",
              source: SOURCE_ID,
              paint: { "line-color": "#334155", "line-width": 0.7, "line-opacity": 0.75 },
            });
          } else {
            (map.getSource(SOURCE_ID) as GeoJSONSource).setData(geojson);
          }
          map.fitBounds(boundsFromGeoJSON(geojson), { padding: 64, maxZoom: 16 });
        };
        if (map.isStyleLoaded()) render();
        else map.once("load", render);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "데이터를 불러오지 못했습니다."));

    map.on("click", FILL_ID, (event) => {
      const properties = event.features?.[0]?.properties ?? {};
      setSelected({
        id: properties.native_grid_id,
        population: properties.population_total == null ? null : Number(properties.population_total),
        status: properties.population_status,
      });
    });
    map.on("mouseenter", FILL_ID, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", FILL_ID, () => { map.getCanvas().style.cursor = ""; });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: "#f4f6f8", color: "#18202a" }}>
      <div style={{ position: "relative", minHeight: "100vh" }}>
        <div ref={mapContainer} style={{ position: "absolute", inset: 0 }} />

        <section style={{ position: "absolute", zIndex: 5, left: 18, top: 18, width: "min(390px, calc(100vw - 36px))", background: "rgba(255,255,255,.96)", border: "1px solid #dfe4ea", borderRadius: 16, padding: 16, boxShadow: "0 14px 40px rgba(15,23,42,.14)" }}>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".12em", color: "#64748b" }}>ATLAS KR · SGIS MVP</div>
          <h1 style={{ margin: "7px 0 4px", fontSize: 22, letterSpacing: "-.04em" }}>부림동 100m 인구격자</h1>
          <p style={{ margin: 0, fontSize: 11, lineHeight: 1.55, color: "#64748b" }}>2025 SGIS 격자경계 × 2024 총인구(to_in_001). 행정동 경계와 교차하는 모든 100m 셀을 표시합니다.</p>

          {manifest && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 7, marginTop: 13 }}>
              <Metric label="교차 격자" value={`${manifest.selected_grid_count}개`} />
              <Metric label="인구행 존재" value={`${manifest.explicit_statistic_row_count}개`} />
              <Metric label="통계행 없음" value={`${manifest.no_stat_row_count}개`} />
              <Metric label="명시값 합계" value={manifest.sum_explicit_intersecting_grid_values.toLocaleString()} />
            </div>
          )}

          <div style={{ marginTop: 13, display: "grid", gap: 5, fontSize: 10, color: "#52606d" }}>
            <Legend swatch="#d7dce2" label="통계행 없음" />
            <Legend swatch="#dfeaf6" label="0–99명" />
            <Legend swatch="#b9d2eb" label="100–299명" />
            <Legend swatch="#7fafd8" label="300–599명" />
            <Legend swatch="#3e7fb9" label="600–899명" />
            <Legend swatch="#174f87" label="900명 이상" />
          </div>

          {selected && (
            <div style={{ marginTop: 13, padding: 10, borderRadius: 10, background: "#f6f8fa", border: "1px solid #e5e9ee", fontSize: 11 }}>
              <strong>{selected.id}</strong>
              <div style={{ marginTop: 3, color: "#52606d" }}>
                {selected.status === "explicit-row" ? `총인구 ${selected.population?.toLocaleString() ?? "-"}명` : "SGIS 인구 통계행 없음"}
              </div>
            </div>
          )}

          {error && <div style={{ marginTop: 12, color: "#b42318", fontSize: 11 }}>오류: {error}</div>}
          <a href="/" style={{ display: "inline-block", marginTop: 13, fontSize: 10, fontWeight: 800, color: "#334155", textDecoration: "none" }}>← Atlas Catalog</a>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "9px 10px", borderRadius: 10, background: "#f6f8fa" }}>
      <div style={{ fontSize: 9, color: "#7b8794" }}>{label}</div>
      <div style={{ marginTop: 2, fontSize: 15, fontWeight: 850 }}>{value}</div>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <span style={{ width: 14, height: 10, borderRadius: 2, background: swatch, border: "1px solid rgba(15,23,42,.12)" }} />
      <span>{label}</span>
    </div>
  );
}
