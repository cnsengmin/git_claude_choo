"use client";

import { useState } from "react";
import AtlasMap from "@/components/AtlasMap";
import DataCatalogPanel from "@/components/DataCatalogPanel";

export default function AtlasHome() {
  const [workspace, setWorkspace] = useState<"catalog" | "map">("catalog");

  if (workspace === "map") {
    return (
      <div className="workspace-map-shell">
        <button className="workspace-back" type="button" onClick={() => setWorkspace("catalog")}>
          ← Data Catalog
        </button>
        <AtlasMap />
      </div>
    );
  }

  return (
    <main className="catalog-home">
      <aside className="catalog-home-sidebar">
        <div className="catalog-home-brand-row">
          <div>
            <div className="brand">ATLAS KR</div>
            <p className="subtitle">한국 공간통계 레이어를 지역 단위로 찾고, 호환 가능한 형식으로 꺼내는 MVP</p>
          </div>
          <button type="button" onClick={() => setWorkspace("map")}>Map Prototype</button>
        </div>
        <DataCatalogPanel />
      </aside>

      <section className="catalog-home-stage">
        <div className="catalog-stage-card">
          <span className="eyebrow">REGION-FIRST SPATIAL DATA HUB</span>
          <h1>지역을 고르고<br />레이어를 꺼냅니다.</h1>
          <p>시군구·읍면동·공식 격자를 기준으로 인구, 사업체, 건물, 계획, 시설, 위성 레이어를 독립적으로 선택합니다. 실제 분석은 필요한 순간에 QGIS·Python/R·MCP·CAD로 이어집니다.</p>
          <div className="catalog-stage-flow">
            <div><b>01</b><strong>REGION</strong><span>시군구 / 읍면동 / Grid</span></div>
            <div><b>02</b><strong>LAYER</strong><span>Statistics / Vector / Raster</span></div>
            <div><b>03</b><strong>NORMALIZE</strong><span>Code / CRS / Format</span></div>
            <div><b>04</b><strong>EXPORT</strong><span>Data / QGIS / MCP / CAD</span></div>
          </div>
        </div>

        <div className="catalog-stage-meta">
          <div><span>Analysis CRS</span><b>EPSG:5179</b></div>
          <div><span>Native IDs</span><b>Preserved</b></div>
          <div><span>Core objects</span><b>Region · Grid · Feature · Raster · Statistic</b></div>
        </div>
      </section>
    </main>
  );
}
