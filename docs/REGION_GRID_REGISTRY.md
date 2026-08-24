# Atlas KR Region & Grid Registry

## Purpose

Atlas KR uses administrative regions and official statistical grids as the stable entry points for Korean spatial analysis. Free-radius/polygon clipping remains a later analysis function.

## Region policy

- Preserve MOIS/code.go official administrative and legal-dong codes.
- Keep validity periods instead of overwriting old codes.
- Keep administrative-dong and legal-dong identifiers separate.
- Represent changes as relations: rename, split, merge, new, abolished, boundary-change, admin/legal crosswalk.
- Boundary geometry version is stored separately from the code validity period.

Primary public references:

- 행정표준코드관리시스템 법정동/전체 다운로드
- 행정안전부 행정기관(행정동) 및 관할구역(법정동) 변경내역

The adapter layer should ingest exported files/attachments into `AtlasRegionRef` and `AtlasRegionRelation`; it should not scrape UI text into production data when a downloadable source exists.

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

A grid statistic is normalized to:

```text
atlas_grid_id | native_grid_id | grid_size_m | year | indicator_id | value | unit | source_id
```

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
- `GET /api/registry?kind=region|grid|crs|indicator|export`
- `GET /api/vworld/layers`

These endpoints are intended to become the discovery surface for the web app and future QGIS/CAD MCP integrations.
