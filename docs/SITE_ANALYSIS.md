# Atlas KR Site Analysis Mode

## Goal

Site Analysis Mode turns a map extent into a reproducible urban/architectural analysis package rather than a single downloaded map.

The UI follows five layer groups:

1. **Physical / Built** — buildings, building use/age/height, roads, green/water, terrain, cadastral.
2. **Planning** — zoning, district-unit plans, planned facilities, land use.
3. **Mobility** — subway/bus and walking accessibility.
4. **People & Economy** — 100m population, establishments, employment, floating population.
5. **Places & Activity** — live POI, official medical facilities, food/cafe, convenience retail, culture, HotScore.

## Multi-scale context

The initial MVP exposes four radius presets around the current map center:

| Scale | Intended use |
|---|---|
| 100m | parcel/building context |
| 500m | immediate neighborhood |
| 1km | daily-life catchment / site context |
| 3km | wider urban context |

Later versions may also support administrative boundaries and a user-drawn polygon.

## Presets

- **Architecture Site**: building geometry/use/age/height, roads, terrain, cadastral, zoning.
- **Neighborhood**: roads, green/water, transit, population, establishments, live POI, medical.
- **Commercial Activity**: establishments, employment, floating population, live POI, food/cafe, convenience, culture, HotScore.

## Source strategy for Korea

The international site-analysis references are translated into Korea-first sources rather than copied literally:

| Site-analysis need | Korea-first Atlas source strategy |
|---|---|
| satellite/context | public aerial/satellite imagery where licensing permits; external imagery as context only |
| roads/buildings | national/open spatial data with OSM as a complementary source |
| building attributes | building register / BuildingHUB / VWorld-compatible public data |
| land use | official land-cover and planning datasets, OSM only as a complement |
| topography/contours | national DEM / digital topographic data |
| cadastral | continuous cadastral data |
| planning | official zoning, district-unit-plan, UPIS/land-use planning information |
| POI | Kakao/Naver/Google request-time lookup plus official public datasets |
| hospitals | HIRA official medical facility data |
| population/business | SGIS grids and Census/business statistics |

## Product rule

A map layer is not treated as analysis by itself. Atlas should preserve at least:

- spatial extent and scale;
- source and provider;
- retrieval/reference date;
- official/statistical vs live-observation distinction;
- CRS / normalization method when relevant;
- calculation method for derived layers.

## Current implementation

The `atlas-mvp` branch now includes:

- an `Explore / POI` mode and a separate `Site Analysis` mode;
- a map-centered analysis radius rendered as a MapLibre polygon;
- the five layer groups and Korea-first source registry;
- architecture/neighborhood/commercial presets;
- layer implementation status (`available`, `partial`, `planned`);
- jump-back from an available Site Analysis layer to a real provider search;
- an analysis-configuration snapshot action.

The analysis catalog is defined in `lib/site-analysis/catalog.ts` so later data providers can attach to stable layer IDs without rewriting the UI.

## Next implementation sequence

1. Vercel Preview + API-key runtime verification.
2. HIRA pharmacy/details and official culture/public-facility datasets.
3. LOCALDATA licensed businesses.
4. SGIS 100m population/business grids.
5. Building footprints + register attributes + cadastral/zoning.
6. deck.gl density, grid and 2.5D building-activity views.
7. automatic 15+ diagram generation and exploded 3D export.
