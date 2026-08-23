# Atlas KR

Atlas KR is a Korea-focused geospatial atlas MVP for exploring population, buildings, businesses, public facilities, official statistics, and live POI signals on one map.

## Current MVP

- Next.js + MapLibre web map centered on the initial Pyeongchon/Burim development area
- Korea-first live POI providers
  - Kakao Local: radius/keyword POI discovery
  - Naver Local Search: Korean business and place search
  - Google Places: optional global POI/detail provider
- Official medical layer
  - HIRA hospital information from data.go.kr
  - Current map center is resolved to Korean legal-dong names with Kakao coordinate-to-region lookup
  - HIRA coordinates are distance-filtered again against the selected map radius
- Shared normalized POI schema with provider provenance and retrieval time
- Official/statistical results are visually and logically separated from live provider observations
- Search radius controls: 500m / 1.2km / 2km / 3km

## Architecture

```text
Next.js / Vercel
      |
      +-- MapLibre GL JS
      +-- POI Orchestrator
      |      +-- KakaoProvider       (live)
      |      +-- NaverProvider       (live)
      |      +-- GoogleProvider      (live)
      |      +-- HiraProvider        (official)
      |
      +-- GeoReach / official data   (next)
      |      +-- LOCALDATA
      |      +-- SGIS population/business grids
      |      +-- buildings / cadastral / zoning
      |
      +-- PostGIS / Supabase         (later)
      +-- PMTiles / GeoParquet       (later)
      +-- deck.gl / Three.js         (later)
```

## Data rule

A live POI count is never presented as an official establishment count. Kakao/Naver/Google results are request-time observations. HIRA and later SGIS/LOCALDATA layers keep their own official/public provenance, reference dates, and licenses.

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
- `DATA_GO_KR_SERVICE_KEY` (decoded/general data.go.kr service key; currently used for HIRA)
- `NEXT_PUBLIC_MAP_STYLE_URL` (optional)

## API routes

- `GET /api/poi/kakao?query=카페&x=126.95&y=37.39&radius=1200`
- `GET /api/poi/naver?query=평촌역%20카페`
- `POST /api/poi/google` with center/radius/types
- `GET /api/poi/hira?query=병원&x=126.9568&y=37.3943&radius=1200`

## Validation

A GitHub Actions workflow runs TypeScript checking and `next build` on the `atlas-mvp` branch / pull request when Actions are enabled for the repository.

## Next milestones

1. Vercel Preview deployment and provider-key smoke test
2. HIRA pharmacy/detail expansion
3. LOCALDATA licensed-business layer
4. SGIS 100m population and establishment grids
5. Building footprints + business-to-building matching
6. deck.gl density/heatmap and 2.5D activity layers
7. 15+ urban diagram / 3D exploded-view mode
