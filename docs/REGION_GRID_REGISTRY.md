# Atlas KR Region & Grid Registry

## Purpose

Atlas KR uses administrative regions and official statistical grids as the stable entry points for Korean spatial analysis. Free-radius/polygon clipping remains a later analysis function.

The important distinction is:

```text
Source Provider -> Dataset -> Normalize -> Region/Grid Registry -> Layer -> Export/Analysis
```

A provider such as data.go.kr or SGIS can expose many datasets with different access methods, formats, dates and licenses. Atlas therefore keeps **dataset-level manifests** in addition to provider-level manifests.

## Region policy

- Preserve official administrative and legal-dong codes as strings.
- Never coerce identifiers to numbers; leading zeros and exact native values matter.
- Keep validity/revision periods instead of overwriting historical codes.
- Keep administrative-dong and legal-dong identifiers separate.
- Represent changes as relations: rename, split, merge, new, abolished, boundary-change, admin/legal crosswalk.
- Boundary geometry version is stored separately from code validity/revision history.
- A normalized row keeps `source_id`, `source_dataset_id` and provider-native record/code identifiers.

### Region source hierarchy

1. **code.go.kr / official legal-dong code and change notices**
   - public code search/full-download source
   - legal-dong codes and abolition/change provenance
   - change-driven updates
2. **National Data Agency administrative-area classification on data.go.kr**
   - 8-digit statistical administrative-area classification
   - revision date, top-level code and parent administrative code
   - useful for statistics-oriented administrative-dong hierarchy
3. **SGIS crosswalk/boundary products**
   - used to connect statistical geography, boundary versions and historical reference dates

The registry intentionally does not pretend that these code systems are identical. Crosswalks are explicit relations.

## Dataset registry

`lib/atlas-registry/datasets.ts` stores dataset-level metadata such as:

```text
dataset id
provider/source id
authority
official flag
Agent access grade
access method / required env
source formats -> Atlas normalized formats
spatial levels
source CRS
native ID field
reference date / update cycle
verification state
license note
implementation status
```

Initial dataset manifests:

- `mois-legal-dong-codes`
- `kostat-admin-dong-classification-20250704`
- `sgis-small-area-grid`
- `vworld-cadastral-planning-family`
- `ngii-cas500-raster-family`

The 2025-07-04 administrative-area dataset is kept with its explicit snapshot date instead of being relabeled as “latest”. A newer snapshot can be added as a new manifest and compared before promotion.

## Open-file normalization preview

Atlas now has a provider-neutral preview endpoint:

```text
GET  /api/registry/preview
POST /api/registry/preview
```

It accepts representative text samples and validates how they normalize before a large national ETL job is run.

Supported preview kinds:

### `legal-dong`

Designed for code.go legal-dong TXT/CSV exports. It recognizes common columns such as:

```text
법정동코드
법정동명
폐지여부 / 폐지구분
생성일
폐지일
법정동코드(주민)
법정동코드(지적)
```

Legal codes remain strings. Sido/sigungu/legal-dong level is inferred from the official 10-digit legal code structure while the provider-native code is preserved.

### `admin-classification`

Designed for the National Data Agency administrative-area classification file with fields including:

```text
행정동번호
개정일자
연결번호
행정동코드
행정동명
최상위행정동코드
부모행정동코드
순번
```

`개정일자` is preserved as revision provenance. Valid-to periods are not invented in the preview; they are calculated later from ordered history/change records.

### `sgis-grid`

Designed for SGIS grid statistics TXT/CSV. The adapter accepts common native ID aliases (`gid`, `GRID_1K_CD`, boundary/grid code, etc.) and preserves the native grid identifier.

Example normalized row:

```text
atlas_grid_id | native_grid_id | grid_size_m | year | indicator_id | value | unit | source_id
```

The preview endpoint is intentionally capped at a small request size. Full national datasets should use a batch ETL/cache path, not a Vercel request body.

## Grid policy

SGIS grid identifiers are preserved exactly as native IDs.

```text
native_grid_id = <provider value>
atlas_grid_id  = sgis:100m:<native_grid_id>
```

Atlas does not rename grids after administrative areas because administrative boundaries can change while the national grid remains a stable spatial reference.

Initial grid systems:

- SGIS 100m
- SGIS 500m
- SGIS 1km
- CRS: EPSG:5179

SGIS manuals document that grid/administrative boundary SHP products use EPSG:5179 and that downloaded statistics are joined to boundary files by their native boundary/grid code. Atlas follows that model and automates the normalization/join preparation rather than replacing the native key.

## Common indicator dictionary

The registry starts with stable IDs such as:

- `population.total`
- `population.youth`
- `population.elderly`
- `household.total`
- `business.total`
- `employment.workers`
- `facility.medical.count`
- `environment.ndvi.mean`

Definitions and age bands must remain source/recipe metadata. Atlas IDs do not erase source definitions.

## CRS policy

- source CRS: always preserved
- Korea analysis CRS: EPSG:5179
- web coordinate exchange: EPSG:4326
- web display CRS: EPSG:3857

Spatial joins, area and distance calculations should use an appropriate projected CRS rather than relying on web-map coordinates.

## VWorld policy

VWorld is treated as a scriptable Grade-B provider.

- WMS/WMTS: display and verification
- WFS/Data API: extractable features where the current service/type ID is verified
- layer-specific license and traffic limits are retained
- exact WFS type names are not guessed

The MVP registry currently records:

- `lt_c_landinfobasemap` as an official-sample WMS layer
- the VWorld zoning WMS/WFS dataset as catalog-verified, pending runtime type-name verification
- the VWorld 2D Data API as a catalog-verified extraction family

## Export direction

Independent layers remain independent until an analysis/export requests a join.

Preferred targets:

- Web: GeoJSON / PMTiles / COG
- Data: CSV / Parquet / GeoParquet
- QGIS: GeoPackage + GeoTIFF/COG
- CAD: derived DXF + CRS/source manifest
- MCP: catalog + reproducible layer package

## Current API

- `GET /api/catalog`
- `GET /api/registry`
- `GET /api/registry?kind=region|dataset|grid|crs|indicator|export`
- `GET /api/registry/preview`
- `POST /api/registry/preview`
- `GET /api/vworld/layers`

These endpoints are intended to become the discovery and compatibility surface for the web app and future QGIS/CAD MCP integrations.

## Next implementation step

1. Acquire/cache a complete current legal-dong snapshot and latest administrative classification snapshot.
2. Build ordered change-history validity windows and explicit admin/legal crosswalks.
3. Ingest SGIS 100m grid boundary + population/business files into a batch cache.
4. Add regional extraction (`sigungu`/`admin-dong` -> selected grid/features) and CSV/GeoJSON output.
5. Promote the same normalized layer package to GeoPackage for QGIS and later DXF for CAD.
