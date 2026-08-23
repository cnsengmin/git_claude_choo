# Atlas KR Data Source Registry

This file is the human-readable provenance registry. The application also exposes provider/retrieval metadata in the MVP UI.

| Layer | Preferred source | Purpose | Storage policy in Atlas MVP |
|---|---|---|---|
| Live Korean POI | Kakao Local API | Viewport/radius/keyword POI discovery and coordinate-to-region lookup | Request-time result; normalized with provider + retrievedAt |
| Korean place search | Naver Local Search API | Korean business/place discovery and popularity-oriented query results | Request-time result; provider coordinates retained as metadata until coordinate normalization is finalized |
| Global/detailed POI | Google Places API (New) | Nearby place details, ratings, review counts, opening state | Request-time integration only; obey Google Maps Platform content/storage terms |
| Official hospitals/clinics | HIRA hospital information service via data.go.kr | Official medical-facility map and later accessibility indicators | Implemented request-time official layer; source attribution retained; no live-provider count merging |
| Pharmacies / medical details | HIRA pharmacy + institution-detail services | Pharmacy, department, equipment and detailed medical analysis | Next HIRA expansion |
| Establishments | Census/SGIS business statistics | Official business counts, employees, industry composition, time series | Planned statistical layer |
| Licensed businesses | LOCALDATA / public APIs | Establishment-level public records | Planned public POI layer |
| Population | SGIS / official population grid | 100m grid and demographic structure | Planned statistical layer |
| Buildings | Building register / spatial building data | footprint, use, age, floors, height | Planned GeoReach layer |
| Parcels | cadastral/open spatial data | parcel geometry and parcel-level linking | Planned GeoReach layer |
| Zoning | VWorld / official planning data | zoning and urban planning diagrams | Planned GeoReach layer |

## Source-use rule

Atlas shows the source and retrieval/reference date beside every layer. Provider POI results and official statistics must remain distinguishable in the UI and downstream analysis. A Kakao/Naver/Google result count is not an official establishment count.

## HIRA MVP method

1. Read the current MapLibre map center and selected radius.
2. Use Kakao `coord2regioncode` around the center and cardinal sample points to identify legal-dong areas intersecting the search circle.
3. Query the HIRA hospital basic list by legal-dong name.
4. Filter the HIRA response back to the matching province/district.
5. Recalculate straight-line distance using the HIRA WGS84 coordinates and keep only facilities inside the requested radius.
6. Deduplicate by encrypted care-institution identifier (`ykiho`) when available.

This is an MVP boundary strategy. A later spatial database version should use a full administrative-boundary intersection rather than sampled region lookup.

## Current API references

- Kakao Developers — Local/Kakao Map REST API: keyword search and coordinate-to-region conversion.
- Naver Developers — Search API / Local: registered businesses and institutions; query-based search.
- Google Maps Platform — Places API (New): Nearby Search, Text Search, Place Details and provider-specific storage/usage terms.
- Public Data Portal / HIRA — Hospital Information Service (`B551182/hospInfoServicev2/getHospBasisList`), real-time API; attribution/licensing metadata must be preserved.

## Next source integrations

1. HIRA pharmacy + medical-detail services
2. LOCALDATA licensed establishments
3. SGIS 100m population/business grids
4. building footprints + building register attributes
5. cadastral and zoning layers
6. public transit and cultural facilities
