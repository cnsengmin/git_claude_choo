# Atlas KR Architecture

## Product principle

Atlas KR separates **official/statistical facts** from **live POI observations**.

- Official/statistical: population, establishments, employees, buildings, parcels, zoning, HIRA/public facilities.
- Live POI: places returned at request time by Kakao, Naver, Google, or later providers.

A POI count is never presented as an official establishment count unless its source is an official statistical dataset.

## Web stack

- Next.js on Vercel for UI and server-side provider proxies
- MapLibre GL JS for the base 2D/2.5D map
- deck.gl for dense grids, heatmaps, arcs, and large spatial layers (next stage)
- Three.js or deck.gl ScenegraphLayer for exploded urban diagrams (later)
- Supabase/PostGIS for normalized spatial entities (later)
- PMTiles / GeoParquet for large static layers (later)

## Data layers

```text
User / map viewport
       |
       v
Spatial Orchestrator
       |
       +-- POI Reach
       |     +-- Kakao Local
       |     +-- Naver Local Search
       |     +-- Google Places
       |     +-- OSM / public POI (later)
       |
       +-- GeoReach
             +-- population
             +-- buildings
             +-- parcels
             +-- zoning
             +-- business statistics
             +-- terrain
```

## Provider fallback philosophy

The design borrows the ordered-backend idea from Agent-Reach: each logical layer can have a preferred source and fallbacks, while Atlas records which source actually served the result.

Example:

```text
Medical POI
  1. HIRA official data
  2. Kakao Local live lookup
  3. Naver search confirmation
```

The providers should not be silently merged into a single authoritative count. Results keep provider provenance and retrieval time.

## Planned spatial entity model

```text
poi/business
  -> building_id
  -> parcel_id
  -> block_id
  -> grid_100m_id
  -> admin_dong_code
  -> sigungu_code
```

This permits building-level tenant/activity summaries while still supporting grid, neighborhood, and municipal statistics.

## MVP geography

The map starts around Pyeongchon / Burim-dong for development convenience, but no data model is hard-coded to that geography.
