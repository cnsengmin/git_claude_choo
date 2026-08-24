# Atlas KR

Atlas KR is a Korea-focused spatial data hub MVP. Its core purpose is to make Korean statistics and geospatial datasets easy to discover, normalize, compare and export as independent analysis-ready layers.

The product is moving from a map-first prototype toward a **region-first compatibility layer**:

```text
Sido -> Sigungu -> Eup/Myeon/Dong -> official Grid
                      |
               Common layer catalog
                      |
       Statistics / Vector / Raster / POI
                      |
             Web / QGIS / CAD / MCP
```

See `docs/SPATIAL_DATA_HUB_ARCHITECTURE.md` for the current architecture, CRS/format strategy and QGIS/CAD direction.

## Current MVP

- Next.js + MapLibre web map centered on the initial Pyeongchon/Burim development area
- Existing exploratory UI
  - **Explore / POI**: request-time place search and official facility lookup
  - **Site Analysis**: experimental radius-based target-area view; no longer the primary data model
- Open-source context through OSM Overpass
  - buildings
  - roads
  - land use
  - green/water
- Korea-first live POI providers
  - Kakao Local
  - Naver Local Search
  - Google Places (optional)
- Official/public providers
  - HIRA hospital information from data.go.kr
  - SGIS administrative-dong population and establishment statistics
- New spatial-data registry foundation
  - `lib/atlas-registry/types.ts`
  - `lib/atlas-registry/crs.ts`
  - `lib/atlas-registry/sources.ts`
  - `lib/atlas-registry/layers.ts`
  - `GET /api/catalog`
- VWorld registered as a scriptable Agent Grade B spatial provider
  - WMS/WFS/WMTS access model
  - server-side URL/client helpers in `lib/vworld/client.ts`
  - actual extractable VWorld layer allowlist/runtime validation is a next milestone

## Core data model

Atlas keeps five durable spatial entities:

```text
REGION     administrative/legal regions with versioned codes
GRID       native official grid identifiers + Atlas namespace
FEATURE    buildings/roads/parcels/facilities/POI
RASTER     satellite/DEM/NDVI and product metadata
STATISTIC  long-table region/grid statistics
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

Current/provider variables:

- `KAKAO_REST_API_KEY`
- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`
- `GOOGLE_MAPS_API_KEY` (optional)
- `DATA_GO_KR_SERVICE_KEY`
- `SGIS_CONSUMER_KEY`
- `SGIS_CONSUMER_SECRET`
- `VWORLD_API_KEY`
- `KOSIS_API_KEY` (adapter planned)
- `NEXT_PUBLIC_MAP_STYLE_URL` (optional)

## API routes

Existing data routes:

- `GET /api/poi/kakao`
- `GET /api/poi/naver`
- `POST /api/poi/google`
- `GET /api/poi/hira`
- `GET /api/site/osm`
- `GET /api/stats/sgis`
- `GET /api/status`

Registry/catalog route:

- `GET /api/catalog`
- `GET /api/catalog?source=vworld`
- `GET /api/catalog?group=statistics`
- `GET /api/catalog?status=available`

The catalog API is intentionally provider-neutral so future web UI, export jobs and MCP clients can discover layers without knowing each Korean source API directly.

## Validation

GitHub Actions runs dependency installation, TypeScript checking and `next build` on the `atlas-mvp` branch / pull request.

## Next milestones

1. Vercel Preview + provider-key runtime smoke test
2. MOIS administrative-code/change-history Region Registry
3. official boundary version + admin/legal-dong crosswalk
4. SGIS 100m Grid Registry and population/business attributes
5. VWorld WFS/Data API allowlist + runtime verification
6. KOSIS statistics adapter
7. official building/cadastral/zoning datasets
8. domestic satellite/DEM raster registry
9. CSV/GeoJSON export -> GeoPackage QGIS-ready package
10. QGIS MCP integration, then CAD/DXF + AutoCAD MCP
