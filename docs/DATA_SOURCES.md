# Atlas KR Data Source Registry

This file is the human-readable provenance registry. The application will later expose the same metadata in the UI.

| Layer | Preferred source | Purpose | Storage policy in Atlas MVP |
|---|---|---|---|
| Live Korean POI | Kakao Local API | Viewport/radius/keyword POI discovery | Request-time result; normalized with provider + retrievedAt |
| Korean place search | Naver Local Search API | Korean business/place discovery and popularity-oriented query results | Request-time result; provider coordinates retained as metadata until coordinate normalization is finalized |
| Global/detailed POI | Google Places API (New) | Nearby place details, ratings, review counts, opening state | Request-time integration only; obey Google Maps Platform content/storage terms |
| Medical facilities | HIRA/public data | Official hospital/clinic analysis | Implemented official layer; request-time API result with provenance |
| Establishments | Census/SGIS business statistics | Official business counts, employees, industry composition, time series | Planned statistical layer |
| Licensed businesses | LOCALDATA / public APIs | Establishment-level public records | Planned public POI layer |
| Population | SGIS / official population grid | 100m grid and demographic structure | Planned statistical layer |
| Buildings | Building spatial data + building register | footprint, use, age, floors, height | Planned GeoReach layer |
| Parcels | continuous cadastral/open spatial data | parcel geometry and parcel-level linking | Planned GeoReach layer |
| Zoning/planning | official planning data / VWorld / UPIS | zoning, district plans, planned facilities | Planned GeoReach layer |
| Terrain | national DEM / topographic data | terrain, contours, slope/context | Planned static/derived layer |
| Roads/transit | national/local transport open data + OSM complement | street network, transit, accessibility | Planned mobility layer |
| Green/water/land cover | official land-cover and public spatial data | green, river, open-space and land-use diagrams | Planned physical-context layer |

## Source-use rule

Atlas shows the source and retrieval/reference date beside every layer. Provider POI results and official statistics must remain distinguishable in the UI and downstream analysis.

For Site Analysis Mode, a downloaded or rendered map is not considered analysis by itself. Each generated layer/diagram should preserve its analysis extent, source, date, normalization method, and any derived calculation method.

## Site Analysis catalog

The stable UI/data layer IDs are maintained in `lib/site-analysis/catalog.ts` and grouped into:

1. Physical / Built
2. Planning
3. Mobility
4. People & Economy
5. Places & Activity

See `docs/SITE_ANALYSIS.md` for the scale/preset/source strategy.

## Current API references

- Kakao Developers — Local API: keyword/category search with coordinates, radius, rect, sorting, paging, and coordinate-to-region lookup.
- Naver Developers — Search API / Local: registered businesses and institutions; query-based place search.
- Google Maps Platform — Places API (New): Nearby Search, Text Search, Place Details, and associated field masks/billing/terms.
- HIRA / data.go.kr — official hospital information service used by the current medical layer.

## Next source integrations

1. HIRA pharmacy/details and other official facility datasets
2. LOCALDATA licensed establishments
3. SGIS 100m population/business grids
4. building footprints + building register attributes
5. cadastral, zoning and planning layers
6. public transit, cultural facilities, terrain and green/water layers
