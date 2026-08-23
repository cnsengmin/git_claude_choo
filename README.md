# Atlas KR

Atlas KR is a Korea-focused geospatial atlas MVP for exploring population, buildings, businesses, public facilities, official statistics, live POI signals, and reproducible site-analysis layers on one map.

## Current MVP

- Next.js + MapLibre web map centered on the initial Pyeongchon/Burim development area
- Two user modes
  - **Explore / POI**: request-time place search and official facility lookup
  - **Site Analysis**: target-area scale + layer catalog + analysis presets
- Site Analysis radius presets: 100m / 500m / 1km / 3km, rendered on the map as the active analysis area
- Open-source context through OSM Overpass
  - buildings
  - roads
  - land use
  - green/water
- Korea-first live POI providers
  - Kakao Local: radius/keyword POI discovery
  - Naver Local Search: Korean business and place search
  - Google Places: optional global POI/detail provider
- Official/public layers
  - HIRA hospital information from data.go.kr
  - SGIS administrative-dong population and establishment statistics
  - Kakao administrative-region lookup is used to match the current map center to SGIS administrative codes
- Shared normalized provenance policy: live provider observations, official facilities, official aggregate statistics, and open-data context remain distinguishable
- Site Analysis layer catalog is centralized in `lib/site-analysis/catalog.ts` so higher-resolution Korean official sources can replace/supplement fallback layers without rewriting the UI

See `docs/SITE_ANALYSIS.md` for the Site Analysis specification and `docs/LOCALDATA_INGESTION.md` for the licensed-business ingestion plan.

## Architecture

```text
Next.js / Vercel
      |
      +-- MapLibre GL JS
      |      +-- Explore / POI
      |      +-- Site Analysis extent
      |      +-- OSM context layers
      |
      +-- POI / facility providers
      |      +-- KakaoProvider       (live)
      |      +-- NaverProvider       (live)
      |      +-- GoogleProvider      (live)
      |      +-- HiraProvider        (official facility)
      |
      +-- Statistics
      |      +-- SGIS auth/stage lookup
      |      +-- population.json     (official aggregate)
      |      +-- company.json        (official aggregate)
      |
      +-- GeoReach / official spatial data (next)
      |      +-- LOCALDATA snapshot + change feed
      |      +-- SGIS 100m population/business grids
      |      +-- official buildings / cadastral / zoning
      |
      +-- PostGIS / Supabase         (later)
      +-- PMTiles / GeoParquet       (later)
      +-- deck.gl / Three.js         (later)
```

## Data rule

A live POI count is never presented as an official establishment count. Kakao/Naver/Google results are request-time observations. HIRA is an official facility source. SGIS values are official aggregate statistics. OSM is an open-data context/fallback source.

The current SGIS card is **administrative-dong aggregate data**, not a sum inside the selected map radius. The planned 100m grid layer remains a separate layer and will use SGIS/data-provision grid assets rather than relabeling administrative totals as grid statistics.

A downloaded map is also not treated as a finished site analysis. Site Analysis Mode preserves the target extent/scale, selected layers, source status, and later the provenance and calculation method of each generated diagram.

## Environment variables

Copy `.env.example` to `.env.local`.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Core variables:

- `KAKAO_REST_API_KEY`
- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`
- `GOOGLE_MAPS_API_KEY` (optional)
- `DATA_GO_KR_SERVICE_KEY` (decoded/general data.go.kr service key; HIRA)
- `SGIS_CONSUMER_KEY`
- `SGIS_CONSUMER_SECRET`
- `NEXT_PUBLIC_MAP_STYLE_URL` (optional)

## API routes

- `GET /api/poi/kakao?query=카페&x=126.95&y=37.39&radius=1200`
- `GET /api/poi/naver?query=평촌역%20카페`
- `POST /api/poi/google` with center/radius/types
- `GET /api/poi/hira?query=병원&x=126.9568&y=37.3943&radius=1200`
- `GET /api/site/osm?x=126.9568&y=37.3943&radius=1000`
- `GET /api/stats/sgis?x=126.9568&y=37.3943&year=2024`
- `GET /api/status` for provider configuration/doctor state

`/api/stats/sgis` also accepts `adm_cd` directly for debugging or batch use, so the Kakao name-to-SGIS-code resolution step can be bypassed when an SGIS administrative code is already known.

## Validation

A GitHub Actions workflow runs TypeScript checking and `next build` on the `atlas-mvp` branch / pull request.

## Next milestones

1. Vercel Preview deployment and provider-key runtime smoke test
2. LOCALDATA full-snapshot ingestion + incremental change feed
3. SGIS 100m population and establishment grids
4. VWorld / official building footprints + building register attributes
5. building-to-business spatial matching
6. cadastral/zoning/planning/terrain/transit layers
7. deck.gl density/heatmap and 2.5D activity layers
8. automatic 15+ urban diagram generation / exploded 3D mode
