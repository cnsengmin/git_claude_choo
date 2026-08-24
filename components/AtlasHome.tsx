"use client";

import { useState } from "react";
import AtlasMap from "@/components/AtlasMap";
import DataCatalogPanel from "@/components/DataCatalogPanel";

const CATALOG_STYLES = `
.catalog-home{display:grid;grid-template-columns:minmax(430px,560px) 1fr;min-height:100vh;background:#f3f5f7}.catalog-home-sidebar{padding:22px;overflow:auto;background:#fff;border-right:1px solid #e5e8ec}.catalog-home-brand-row{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:16px}.catalog-home-brand-row>button,.workspace-back{border:1px solid #d8dde3;border-radius:10px;background:#fff;padding:9px 11px;cursor:pointer;font-size:11px;font-weight:750}.catalog-home-stage{padding:42px;display:flex;flex-direction:column;justify-content:center;gap:16px;background:linear-gradient(145deg,#eef2f4,#f7f8f9)}.catalog-stage-card{max-width:780px;padding:38px;border-radius:24px;background:#fff;box-shadow:0 18px 60px rgba(35,45,55,.08)}.catalog-stage-card h1{margin:12px 0 18px;font-size:clamp(38px,5vw,76px);line-height:.98;letter-spacing:-.065em}.catalog-stage-card>p{max-width:680px;color:#656d76;font-size:14px;line-height:1.7}.catalog-stage-flow{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:30px}.catalog-stage-flow>div{display:grid;gap:4px;padding:13px;border-radius:13px;background:#f7f8fa}.catalog-stage-flow b{font-size:9px;color:#9ca2aa}.catalog-stage-flow strong{font-size:11px}.catalog-stage-flow span{font-size:9px;color:#7e858e}.catalog-stage-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:780px}.catalog-stage-meta>div{padding:13px 15px;border-radius:13px;background:rgba(255,255,255,.72);display:grid;gap:3px}.catalog-stage-meta span{font-size:9px;color:#838a93}.catalog-stage-meta b{font-size:11px}.catalog-panel{display:grid;gap:12px}.catalog-scope{display:grid;grid-template-columns:2fr 1fr;gap:8px}.catalog-scope label,.region-code-field{display:grid;gap:5px}.catalog-scope span,.region-code-field>span{font-size:9px;font-weight:800;color:#838a93}.catalog-scope select,.region-code-field input,.catalog-export select{width:100%;border:1px solid #dce0e5;border-radius:9px;background:#fff;padding:8px 9px;font-size:11px}.region-code-field small{font-weight:500}.catalog-rule-strip{display:flex;gap:7px;flex-wrap:wrap}.catalog-rule-strip span{padding:6px 8px;border-radius:999px;background:#f2f4f6;color:#777e87;font-size:9px}.catalog-rule-strip b{color:#252a30}.catalog-groups{display:grid;gap:9px}.catalog-group{overflow:hidden;border:1px solid #e8eaed;border-radius:13px}.catalog-group-title{display:flex;justify-content:space-between;padding:9px 11px;background:#fafbfc;border-bottom:1px solid #edf0f2}.catalog-group-title strong{font-size:11px}.catalog-group-title span{font-size:9px;color:#8a9098}.catalog-layer{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #f0f2f4;cursor:pointer}.catalog-layer:last-child{border-bottom:0}.catalog-layer:hover{background:#fafbfc}.catalog-layer>div{display:grid;gap:2px;min-width:0}.catalog-layer b{font-size:10px}.catalog-layer small{font-size:8.5px;color:#858c95;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.catalog-export{padding:11px;border:1px solid #dfe3e8;border-radius:13px;background:#f8f9fa}.catalog-export-heading{display:flex;align-items:end;justify-content:space-between;gap:10px;margin-bottom:8px}.catalog-export-heading>div{display:grid;gap:2px}.catalog-export-heading strong{font-size:11px}.catalog-export-heading small{font-size:9px;color:#858c95}.catalog-export select{width:auto}.catalog-export>button{width:100%;border:0;border-radius:9px;background:#20252b;color:#fff;padding:10px;cursor:pointer;font-size:10px;font-weight:800}.catalog-export>button:disabled{opacity:.4;cursor:not-allowed}.export-plan-card{padding:11px;border-radius:13px;background:#f1f7f3;border:1px solid #dbe8de}.export-plan-head{display:flex;justify-content:space-between;align-items:center}.export-plan-head strong{font-size:11px}.export-plan-head span{font-size:8px;font-weight:900}.export-plan-card>small{font-size:8.5px;color:#6e7d72}.export-plan-layers{display:grid;gap:5px;margin-top:8px}.export-plan-layers>div{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 8px;padding:7px;border-radius:8px;background:#fff}.export-plan-layers b,.export-plan-layers span{font-size:9px}.export-plan-layers small,.export-plan-layers em{grid-column:1/-1;font-size:8px;color:#7d8680;font-style:normal}.workspace-map-shell{position:relative}.workspace-back{position:fixed;z-index:20;top:14px;right:62px;box-shadow:0 4px 18px rgba(0,0,0,.08)}
@media(max-width:980px){.catalog-home{grid-template-columns:1fr}.catalog-home-stage{display:none}.catalog-home-sidebar{border-right:0}.catalog-stage-flow{grid-template-columns:1fr 1fr}}@media(max-width:520px){.catalog-home-sidebar{padding:16px}.catalog-home-brand-row{display:grid}.catalog-scope{grid-template-columns:1fr}}
`;

export default function AtlasHome() {
  const [workspace, setWorkspace] = useState<"catalog" | "map">("catalog");

  if (workspace === "map") {
    return (
      <div className="workspace-map-shell">
        <style>{CATALOG_STYLES}</style>
        <button className="workspace-back" type="button" onClick={() => setWorkspace("catalog")}>
          ← Data Catalog
        </button>
        <AtlasMap />
      </div>
    );
  }

  return (
    <main className="catalog-home">
      <style>{CATALOG_STYLES}</style>
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
