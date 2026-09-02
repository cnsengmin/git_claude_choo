# Atlas KR

Atlas KR is a Korea-focused spatial data hub MVP. Its core purpose is to make Korean statistics and geospatial datasets easy to discover, normalize, compare and export as independent analysis-ready layers.

The MVP is now **region-first** rather than radius-first:

```text
Sido -> Sigungu -> Eup/Myeon/Dong -> official Grid
                      |
               Common layer catalog
                      |
       Statistics / Vector / Raster / POI
                      |
             Web / QGIS / CAD / MCP
```

See `docs/SPATIAL_DATA_HUB_ARCHITECTURE.md` and `docs/REGION_GRID_REGISTRY.md` for the current architecture, region/grid/version policy, CRS/format strategy and QGIS/CAD direction.

## Current MVP

- Next.js + MapLibre exploratory map remains available as **Map Prototype**
- The default home workspace is now a **Region-first Data Catalog**
  - spatial-unit selector: sigungu / eup-myeon-dong / 1km / 500m / 100m grid
  - common layer list grouped by administration/statistics/built/planning/mobility/places/environment
  - provider, Agent accessibility grade, normalized formats and implementation status
  - independent layer selection
  - reproducible Data/QGIS/MCP/CAD/Web export-plan preview
- Existing exploratory providers
  - Kakao / Naver / Google request-time POI
  - HIRA official medical facilities
  - SGIS administrative-dong population/business statistics
  - OSM Overpass buildings/roads/land-use/green-water context
- Registry foundation
  - source / layer / CRS registries
  - versioned region and region-relation model
  - SGIS official-grid registry with native grid IDs preserved
  - common indicator dictionary
  - export profiles
- MOIS/code.go adapter foundation
  - preserves official code strings and validity periods
  - supports administrative/legal-dong crosswalk relations
  - supports rename/split/merge/new/abolished/boundary-change relations
- SGIS grid-file adapter foundation
  - preserves provider boundary/grid codes
  - namespaces Atlas IDs as `sgis:<size>m:<native-id>`
  - normalizes grid statistics to a common long-table form
- VWorld Agent Grade B integration
  - WMS/WFS/WMTS helper client
  - conservative layer verification registry
  - WMS display layers are separated from extractable WFS/Data-API candidates
- KOSIS generic adapter
  - statistics-table search endpoint
  - generic statistics-data request endpoint
  - normalized KOSIS result rows for later indicator mappings

## Core data model

```text
REGION       versioned administrative/legal regions
RELATION     rename/split/merge/crosswalk/change history
GRID         native official grid identifiers + Atlas namespace
FEATURE      buildings/roads/parcels/facilities/POI
RASTER       satellite/DEM/NDVI and product metadata
STATISTIC    long-table region/grid statistics
```

### CRS policy

- source CRS: preserved exactly as supplied
- default analysis CRS: `EPSG:5179`
- web coordinate exchange: `EPSG:4326`
- common web display CRS: `EPSG:3857`

### Format policy

- statistics: CSV / Parquet
- vector: GeoJSON / GeoParquet / GeoPackage / PMTiles
- raster: GeoTIFF / COG
- metadata/manifests: JSON / YAML
- QGIS export target: GeoPackage first
- CAD export target: derived DXF + CRS/source manifest later

## Provider strategy

```text
preferred official/national source
          -> fallback provider
          -> normalized cache (when licensing permits)
```

Live POI counts are never presented as official establishment statistics. SGIS aggregates, HIRA facilities, LOCALDATA licensing records, OSM context and Kakao/Naver/Google POI remain separate layers with their own provenance.

## Environment variables

Copy `.env.example` to `.env.local`.

```bash
cp .env.example .env.local
npm install
npm run dev
```

- `KAKAO_REST_API_KEY`
- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`
- `GOOGLE_MAPS_API_KEY` (optional)
- `DATA_GO_KR_SERVICE_KEY`
- `SGIS_CONSUMER_KEY`
- `SGIS_CONSUMER_SECRET`
- `VWORLD_API_KEY`
- `KOSIS_API_KEY`
- `NEXT_PUBLIC_MAP_STYLE_URL` (optional)

## API routes

Data/provider routes:

- `GET /api/poi/kakao`
- `GET /api/poi/naver`
- `POST /api/poi/google`
- `GET /api/poi/hira`
- `GET /api/site/osm`
- `GET /api/stats/sgis`
- `GET /api/kosis/search?query=...`
- `POST /api/kosis/data`

Discovery/compatibility routes:

- `GET /api/catalog`
- `GET /api/catalog?source=vworld`
- `GET /api/registry`
- `GET /api/registry?kind=region|grid|crs|indicator|export`
- `GET /api/vworld/layers`
- `POST /api/export/plan`
- `GET /api/status`

The catalog/registry API is provider-neutral so the web UI and future QGIS/CAD MCP clients can discover layers without implementing every Korean source API independently.

## Validation

GitHub Actions runs dependency installation, TypeScript checking and `next build` on the `atlas-mvp` branch / pull request.

## Next milestones

1. Vercel Preview + provider-key runtime smoke test
2. actual MOIS/code.go snapshot + change-history ingestion and boundary-version catalog
3. SGIS 100m population/business grid file ingestion and regional extraction
4. VWorld WFS/Data API runtime verification with a project key
5. first real CSV/GeoJSON extraction endpoint for selected region/layers
6. GeoPackage QGIS-ready package generation
7. official building/cadastral/zoning datasets
8. domestic satellite/DEM raster registry + COG metadata
9. QGIS MCP integration
10. CAD/DXF export + AutoCAD MCP
