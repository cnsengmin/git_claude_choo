# Atlas KR Data Source Registry

This file is the human-readable provenance registry. The application will later expose the same metadata in the UI.

| Layer | Preferred source | Purpose | Storage policy in Atlas MVP |
|---|---|---|---|
| Live Korean POI | Kakao Local API | Viewport/radius/keyword POI discovery | Request-time result; normalized with provider + retrievedAt |
| Korean place search | Naver Local Search API | Korean business/place discovery and popularity-oriented query results | Request-time result; provider coordinates retained as metadata until coordinate normalization is finalized |
| Global/detailed POI | Google Places API (New) | Nearby place details, ratings, review counts, opening state | Request-time integration only; obey Google Maps Platform content/storage terms |
| Medical facilities | HIRA/public data | Official hospital/clinic/pharmacy analysis | Planned official layer |
| Establishments | Census/SGIS business statistics | Official business counts, employees, industry composition, time series | Planned statistical layer |
| Licensed businesses | LOCALDATA / public APIs | Establishment-level public records | Planned public POI layer |
| Population | SGIS / official population grid | 100m grid and demographic structure | Planned statistical layer |
| Buildings | Building register / spatial building data | footprint, use, age, floors, height | Planned GeoReach layer |
| Parcels | cadastral/open spatial data | parcel geometry and parcel-level linking | Planned GeoReach layer |
| Zoning | VWorld / official planning data | zoning and urban planning diagrams | Planned GeoReach layer |

## Source-use rule

Atlas shows the source and retrieval/reference date beside every layer. Provider POI results and official statistics must remain distinguishable in the UI and downstream analysis.

## Current API references

- Kakao Developers — Local API: keyword/category search with coordinates, radius, rect, sorting, and paging.
- Naver Developers — Search API / Local: registered businesses and institutions; query-based search with a documented daily Search API quota.
- Google Maps Platform — Places API (New): Nearby Search, Text Search, Place Details, and associated field masks/billing/terms.

## Next source integrations

1. HIRA medical institutions
2. LOCALDATA licensed establishments
3. SGIS 100m population/business grids
4. building footprints + building register attributes
5. cadastral and zoning layers
6. public transit and cultural facilities
