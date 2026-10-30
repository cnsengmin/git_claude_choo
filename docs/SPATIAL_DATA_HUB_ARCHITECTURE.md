# Atlas KR Spatial Data Hub Architecture

## 1. Product definition

Atlas KR is not a single web map that permanently merges every Korean dataset. Its core purpose is to make heterogeneous Korean statistics and geospatial data **discoverable, compatible, reproducible, and exportable as independent layers** for spatial analysis.

The MVP is region-first:

```text
Korea
  -> Sido
  -> Sigungu
  -> Eup/Myeon/Dong
  -> Grid (1km / 500m / 100m where available)
```

The main value is to reduce repeated work around finding data, matching administrative codes, checking coordinate systems, joining statistics to geometry, and converting formats before analysis.

## 2. Design principles

1. **Region first, freehand clipping later.** Administrative regions and official grids are the default spatial units. Circle/polygon clipping is a later analysis feature.
2. **Layer catalog, not forced merge.** Population, buildings, businesses, zoning, POI, satellite and other datasets remain independent layers until a user or analysis recipe needs a join.
3. **Preserve native identifiers.** MOIS administrative codes, legal-dong codes, SGIS grid codes and provider feature IDs are stored unchanged alongside Atlas IDs.
4. **Preserve source CRS.** Reprojection never destroys the source coordinate reference system metadata.
5. **Normalize for analysis.** Atlas uses a Korea-oriented analysis CRS while keeping web-display coordinates separately.
6. **Open formats first.** CSV/Parquet, GeoJSON/GeoParquet, GeoPackage, PMTiles, GeoTIFF/COG and JSON/YAML metadata are preferred.
7. **Provider adapters are replaceable.** API, WMS/WFS, file download and local cache are ingestion methods, not the product data model.
8. **Preferred -> fallback -> cache.** A source outage should not make the catalog unusable when a normalized cached copy is legally permitted.
9. **Provenance is mandatory.** Provider, dataset ID, reference date, retrieval time, CRS, format and license travel with every layer.
10. **MCP/export ready.** The same normalized layers should later be usable by QGIS MCP, Python/R workflows and CAD-oriented exports.

## 3. Core architecture

```text
                   KOREAN DATA SOURCES

      KOSIS   SGIS   data.go.kr   LOCALDATA
      VWorld  NGII   Satellite    OSM
      Kakao   Naver  HIRA         local files
          \      |       |        /
           \     |       |       /
              PROVIDER ADAPTERS
                     |
                  INGEST
                     |
                 NORMALIZE
                     |
      +--------------+--------------+
      |              |              |
   REGION          GRID            CRS
   REGISTRY       REGISTRY       REGISTRY
      |              |              |
      +--------------+--------------+
                     |
                LAYER CATALOG
                     |
      +--------------+--------------+
      |              |              |
  STATISTICS       VECTOR         RASTER
      |              |              |
      +--------------+--------------+
                     |
                   EXPORT
         +-----------+-----------+
         |           |           |
        WEB         QGIS         CAD
      GeoJSON       GPKG         DXF
      PMTiles    GeoParquet    manifest
```

## 4. Core entities

Atlas only needs a small number of durable core entities.

### REGION

Administrative and legal regions are versioned entities rather than plain codes.

```yaml
atlas_region_id: kr:admin-dong:41173560:2026
region_type: admin_dong
official_code: "41173560"
name: example-dong
valid_from: 2026-01-01
valid_to: null
boundary_version: 2026Q2
```

Administrative-dong and legal-dong codes are never silently mixed. Change relations should support `rename`, `split`, `merge`, `new`, `abolished`, and `boundary_change`.

### GRID

Official grid identifiers remain native.

```yaml
atlas_grid_id: sgis:100m:<native-grid-id>
native_grid_id: <native-grid-id>
grid_system: sgis
grid_size_m: 100
crs: EPSG:5179
```

Atlas namespaces a provider's grid ID; it does not invent a replacement naming scheme.

### FEATURE

Buildings, roads, parcels, facilities, POI and planning polygons are independent vector features. Source feature IDs are retained.

### RASTER

Satellite, DEM, NDVI and other raster products retain acquisition date, native CRS, resolution, nodata value, bands and provider product identifiers.

### STATISTIC

Normalized statistics use a long-table model:

```text
region_or_grid_id | year | indicator_id | value | unit | source_id
```

This allows KOSIS, SGIS and other statistical providers to coexist behind one interface.

## 5. CRS strategy

Atlas keeps three CRS concepts.

```yaml
source_crs: EPSG:4326
analysis_crs: EPSG:5179
display_crs: EPSG:3857
```

- **Source CRS**: original provider CRS; never discarded.
- **Analysis CRS**: default Korea-wide metric analysis CRS; MVP default is EPSG:5179.
- **Display CRS**: web-map rendering CRS/coordinates.

POI from Kakao/Naver/Google can remain in WGS84 for web display while also being transformed to the analysis CRS when spatial joins or metric calculations are required.

## 6. Format strategy

| Source form | Normalized / cache | Web | QGIS | CAD |
|---|---|---|---|---|
| CSV/TXT | Parquet | JSON | CSV | - |
| SHP/GML | GeoParquet | GeoJSON/PMTiles | GeoPackage | DXF-derived |
| GeoJSON | GeoParquet | GeoJSON | GeoPackage | DXF-derived |
| WFS | GeoParquet/cache where permitted | vector | GeoPackage | DXF-derived |
| WMS/WMTS | metadata/tile reference | tiles | WMS/WMTS | - |
| GeoTIFF | COG | raster tiles | GeoTIFF/COG | derived contour |
| Satellite | COG + product metadata | raster tiles | GeoTIFF/COG | derived vector |
| POI JSON | GeoParquet/cache where permitted | point | GeoPackage | point/label-derived |

## 7. Source accessibility grades

Because Atlas KR is being developed through a vibe-coding/agent workflow, sources are also rated by agent accessibility.

| Grade | Meaning |
|---|---|
| A | public URL/API, no authentication |
| B | API key/OAuth required but fully scriptable |
| C | login or manual file acquisition, then scriptable processing |
| D | repeated manual interaction or closed UI required |

Source choice is based on **service value x data quality x agent accessibility x license clarity**, not quality alone.

## 8. VWorld position

VWorld is a useful provider, not an obstacle. It supports standards-oriented access patterns such as WMS/WFS and map tile APIs, and its official sample repository demonstrates API-key based WMTS, WMS, geocoding and 3D usage.

Atlas classifies VWorld as **Agent Grade B**:

- API key required;
- scriptable HTTP access;
- WMS/WMTS useful for display and verification;
- WFS/Data API useful when feature geometry/attributes can be retrieved;
- traffic limits and license conditions can differ by dataset;
- not every VWorld layer should automatically be mirrored into Atlas storage.

Recommended role:

```text
Official/national file or API
        -> preferred when suitable
VWorld WFS/Data API
        -> provider or fallback
VWorld WMS/WMTS
        -> display / verification
OSM
        -> open context fallback
Normalized cache
        -> resilience when licensing allows
```

## 9. Initial source responsibilities

- **KOSIS**: broad national/regional statistics.
- **SGIS**: spatially detailed population/business statistics and official grids.
- **data.go.kr**: dataset-specific public APIs and files, including HIRA and planning/facility datasets.
- **LOCALDATA**: licensed establishment baseline + incremental changes.
- **VWorld**: national geospatial WMS/WFS/Data API/tile access where appropriate.
- **NGII / national satellite services**: official imagery, DEM and satellite products.
- **OSM**: immediate open context and fallback.
- **Kakao/Naver/Google**: request-time POI layers, not official establishment statistics.

## 10. Layer manifest

Every catalog layer should eventually expose metadata like:

```yaml
id: population.total.100m
title: Total population 100m
entity_type: grid
source_id: sgis
fallback_source_ids: []
source_crs: EPSG:5179
analysis_crs: EPSG:5179
spatial_levels: [grid_100m]
temporal_type: annual
join_key: native_grid_id
source_formats: [shp, txt]
atlas_formats: [geoparquet, geopackage, geojson]
export_targets: [web, qgis, data]
status: planned
```

A layer can exist in the catalog before its provider is fully implemented.

## 11. MVP scope

### MVP core

1. Region / grid / CRS / source registries.
2. Layer catalog API.
3. Existing SGIS, HIRA, OSM and POI providers registered behind the catalog.
4. VWorld registered as a scriptable spatial provider; API key configuration and URL/client helpers added.
5. Administrative-dong-first browsing; current free-radius Site Analysis remains experimental rather than the primary data model.
6. Basic exports later prioritize CSV/GeoJSON, then GeoPackage.

### Next

1. MOIS administrative-code and change-history ingestion.
2. Official boundary versions and admin/legal-dong crosswalk.
3. SGIS 100m grid registry + population/business attributes.
4. VWorld WFS/Data API layer allowlist and runtime verification.
5. KOSIS provider adapter.
6. Official building/cadastral/zoning layers.
7. Satellite/DEM raster registry using GeoTIFF/COG metadata.
8. QGIS-ready GeoPackage export.
9. QGIS MCP integration.
10. CAD/DXF export and AutoCAD MCP integration.

## 12. Final positioning

Atlas KR should become a **Korean spatial-data compatibility layer**: users and agents choose a region and independent layers, Atlas resolves codes/CRS/formats/provenance, and the normalized result can be viewed on the web or exported into professional spatial-analysis tools without repeating the original collection and preprocessing workflow.
