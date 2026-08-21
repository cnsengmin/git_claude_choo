# Atlas KR

Atlas KR is a Korea-focused geospatial atlas MVP for exploring population, buildings, businesses, public facilities, and live POI signals on one map.

## MVP goals

- MapLibre-based web map
- Korea-first POI provider layer
  - Kakao Local: viewport / radius / category search
  - Naver Local Search: Korean business and place search
  - Google Places: optional provider for global POI and detailed place metadata
- Public/statistical layer kept separate from live POI signals
- Shared normalized POI schema with provider provenance
- Ready for population grid, buildings, cadastral, zoning, business statistics, and 2.5D/3D layers

## Architecture

```text
Next.js / Vercel
      |
      +-- MapLibre GL JS
      +-- deck.gl (later)
      +-- POI Orchestrator
             |
             +-- KakaoProvider
             +-- NaverProvider
             +-- GoogleProvider
             +-- PublicProvider (later)
      |
      +-- PostGIS / Supabase (later)
      +-- PMTiles / GeoParquet (later)
```

## Provider policy

Live POI results are treated as provider-sourced observations, not as official business statistics. Statistical counts and time-series will come from official datasets such as SGIS, Census/business statistics, HIRA, LOCALDATA, and other public sources.

## Environment variables

Copy `.env.example` to `.env.local` and configure only the providers you want to enable.

```bash
cp .env.example .env.local
npm install
npm run dev
```

## Initial POI API routes

- `GET /api/poi/kakao?query=카페&x=126.95&y=37.39&radius=1000`
- `GET /api/poi/naver?query=평촌역%20카페`
- `POST /api/poi/google` with center/radius/types

## Next milestones

1. MapLibre base map and viewport state
2. Kakao Local integration
3. Naver Local integration
4. POI category normalization and deduplication
5. Building / parcel / population layers
6. Building-to-business spatial matching
7. HotScore and urban activity layers
