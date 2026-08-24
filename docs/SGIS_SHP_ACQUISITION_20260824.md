# Atlas KR — SGIS SHP acquisition check (2026-08-24)

## Purpose

Record the current public-access state of SGIS boundary/grid files so the MVP does not repeatedly rediscover whether SHP downloads still exist or whether VWorld has replaced them.

## Verified current state

SGIS still lists the following as public, nationwide, free statistical boundary files:

```text
Census administrative boundaries
- all / sido / sigungu / eup-myeon-dong
- yearly 2001–2025
- 5-year intervals 1975–2000
- SHP

Grid boundaries
- 100m / 500m / 1km / 10km / 100km
- 2025
- SHP
```

SGIS also lists grid population/household/housing statistics and business/worker statistics through 2024 as CSV.

The official current data-provision page states the spatial-reference system as UTM-K (GRS80), EPSG:5179, and the statistical-boundary reference date as June 30 of the reference year.

## Important wording distinction

The same SGIS page says:

```text
통계지리정보시스템에서는 더이상 지도 데이터를 제공하지 않습니다.
```

This appears under the separate `센서스지도` section. It must **not** be interpreted as saying that census/statistical boundary SHP files are discontinued, because the same page explicitly continues to list administrative and grid boundary SHP datasets as public/free.

Atlas interpretation:

```text
old census/base-map data service discontinued
!=
statistical boundary SHP discontinued
```

## Acquisition workflow

The current SGIS materials describe the normal route as:

```text
SGIS account login
→ 자료신청
→ select requested boundary/statistical products
→ application/approval
→ 신청자료 다운로드
```

A current help page notes that requested files are downloaded after approval and that the download window is limited after approval. Therefore Atlas should not assume a stable anonymous direct ZIP URL.

## MVP download set

Request only what is needed for the first end-to-end test:

```text
1. 2025 census administrative boundary SHP
   - sido
   - sigungu
   - eup/myeon/dong

2. 2025 100m grid boundary SHP

3. 2024 100m population grid CSV
```

Test area:

```text
Gyeonggi-do
→ Anyang-si
→ Dongan-gu
→ Burim-dong
```

## Why file snapshot remains primary

For MVP extraction, a versioned SHP/CSV snapshot is preferred over calling the boundary API for every user request.

```text
SHP/CSV snapshot
= reproducible bulk base data

SGIS OpenAPI
= runtime verification / small-area fallback
```

The API adapter remains useful because it can confirm SGIS region codes and return small boundary GeoJSON while SHP acquisition is pending.

## VWorld role

Do not treat VWorld as a blanket replacement for SGIS statistical boundaries.

Current Atlas split:

```text
SGIS
- administrative statistical boundaries
- census/statistical grids
- population/business statistics

VWorld / national spatial-data family
- cadastral parcels
- zoning / planning
- land information
- legal-dong boundary candidate
- other official national spatial layers
```

## Next implementation after files are acquired

```text
raw ZIP/SHP/CSV
→ inspect filenames / encoding / CRS / fields
→ raw SHA-256 manifest
→ extract Anyang subset
→ normalize boundary IDs
→ verify SGIS adm_cd / grid ID
→ join 100m population by native grid ID
→ Region → Grid extraction
→ CSV + GeoJSON
→ GeoPackage/QGIS
→ same ingestion code for national batch
```

## Related code/docs

```text
app/api/boundaries/sgis/route.ts
lib/sgis/client.ts
docs/SGIS_ADMIN_BOUNDARY_API.md
docs/PUBLIC_SHP_SOURCE_STRATEGY.md
docs/BOUNDARY_LAYER_MODEL.md
docs/MVP_TO_NATIONAL_PLAYBOOK.md
```
