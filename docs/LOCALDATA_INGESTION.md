# LOCALDATA licensed-business ingestion

## Why Atlas does not treat the LOCALDATA Open API as the full current business inventory

LOCALDATA (지방행정인허가데이터개방) provides broad establishment-level licensing datasets across food, culture, lodging, beauty, distribution, medical-related and many other local-government permit categories.

The public Open API is designed primarily around **changes / deltas**. Atlas therefore should not call the change-feed API and label the returned rows as the complete number of businesses currently inside an area.

The intended Atlas pipeline is:

```text
LOCALDATA full downloadable snapshot
        |
        v
initial normalization / geocoding
        |
        v
Atlas establishment table
        ^
        |
LOCALDATA Open API change feed
(open / close / update deltas)
```

## Phase 1 — full snapshot bootstrap

1. Download the relevant LOCALDATA full files by permit category.
2. Keep the original source file name, download date and category code.
3. Normalize the common fields without discarding original values.
4. Parse road / parcel addresses and existing coordinates where available.
5. Match each establishment to:
   - building_id
   - parcel_id
   - 100m grid id
   - administrative dong
   - sigungu
6. Persist source date, license/provenance and matching confidence.

## Phase 2 — incremental updates

After the baseline exists, periodically call the LOCALDATA Open API change feed and apply additions / closures / modifications to the normalized table.

Verified examples from LOCALDATA documentation / support material include:

- `07_24_04_P` — 일반음식점
- `07_24_05_P` — 휴게음식점

The service also supports category filtering through `opnSvcId`. Exact codes and category-specific fields should be read from the current LOCALDATA detailed-field/code files rather than hard-coded from an old list.

## Atlas establishment schema (planned)

```text
establishment_id
source
source_record_id
source_category_code
source_category_name
name
status
permit_date
closure_date
road_address
parcel_address
lat
lng
building_id
parcel_id
grid_100m_id
admin_dong_code
sigungu_code
retrieved_at
reference_date
match_confidence
raw_metadata
```

## Privacy / display rule

Atlas is interested in the location, category and operating status of establishments. It should not expose private owner information or unnecessary identifiers such as business-registration numbers when those are not required for the spatial-analysis purpose.

## Relationship to live POI

LOCALDATA and map-provider POI are separate observations:

- LOCALDATA: licensing / administrative record
- Kakao / Naver / Google: request-time place discovery
- SGIS: official aggregate establishment statistics

They can be compared and entity-matched, but their counts should not be silently merged into one authoritative number.

## Next implementation

The next code stage should add an offline/ETL import command for downloaded LOCALDATA CSV/XLSX files, producing normalized GeoJSON/GeoParquet (MVP) and later PostGIS rows. Once a baseline snapshot is present, the change-feed API can be attached as an updater instead of a full-data provider.
