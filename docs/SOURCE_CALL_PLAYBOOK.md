# Atlas KR Source Call Playbook

## Why this file exists

Atlas KR repeatedly visits the same Korean public-data platforms while adding new layers. We should **not rediscover endpoint shapes, code fields, CRS rules, authentication, or known pitfalls every time**.

This playbook is the durable working memory for source-specific access patterns.

> Rule: when a provider call, file-download route, native field, CRS, or limitation is verified, update this Markdown in the same development cycle as the adapter/code change.

The playbook records **how to reach data**, not secret values. API keys and tokens must never be committed.

## Working rule for vibe-coding / agents

Before implementing a new layer:

1. Look up the provider in this playbook.
2. Reuse a previously verified route/parameter pattern when the new dataset belongs to the same service family.
3. Check the dataset-level manifest in `lib/atlas-registry/datasets.ts`.
4. Preserve native IDs, source CRS, reference date, format, license and provider-specific meanings.
5. After a successful call/download/parse, update this playbook with the exact reusable pattern and verification date.
6. If a call fails because the provider changed, record the failure/change here rather than silently patching only the code.

This gives Atlas a repeatable loop:

```text
PLAYBOOK -> CALL / DOWNLOAD -> VERIFY -> NORMALIZE -> REGISTRY -> UPDATE PLAYBOOK
```

---

## Entry template

Copy this section when adding a new source or service family.

```md
## <Provider / Dataset family>

- Source ID:
- Dataset ID:
- Purpose:
- Authority:
- Data page:
- Agent grade:
- Verified date:
- Adapter/code:

### Access
- Method: API / OAuth / WFS / WMS / file download / manual
- Base URL:
- Auth env: `...`
- Secret placement: Vercel/local env only

### Reusable request pattern
- Endpoint/path:
- Required params:
- Optional params:
- Output format:
- Pagination/limits:

### Native spatial/data contract
- Native ID field:
- Source CRS:
- Time/reference field:
- Join key:
- No-data/confidential values:

### Atlas normalization
- Region/grid/entity type:
- Atlas ID rule:
- Analysis CRS:
- Preferred normalized format:

### Known working example
- Do not paste a real API key/token.
- Record example IDs/parameters only when they are public/non-secret.

### Pitfalls / policy
- Licensing:
- Rate/traffic limits:
- Provider quirks:
- Fallback:
```

---

# Current verified patterns

## 1. KOSIS OpenAPI

- Source ID: `kosis`
- Purpose: broad official national/regional statistics and time series
- Authority: KOSIS 국가통계포털
- Agent grade: B
- Adapter/code: `lib/kosis/client.ts`
- Atlas routes: `GET /api/kosis/search`, `POST /api/kosis/data`

### Access

- Base URL: `https://kosis.kr/openapi`
- Auth env: `KOSIS_API_KEY`
- Auth placement: query parameter `apiKey`
- Output currently normalized from JSON

### Reusable request pattern — table search

```text
GET https://kosis.kr/openapi/statisticsSearch.do
```

Current parameters used by Atlas:

```text
method=getList
apiKey=<KOSIS_API_KEY>
searchNm=<search term>
format=json
startCount=<page/start>
resultCount=<1..100>
sort=RANK|DATE
orgId=<optional organization>
```

Use this first when a new indicator is requested and the exact table ID is unknown.

### Reusable request pattern — statistics data

```text
GET https://kosis.kr/openapi/Param/statisticsParameterData.do
```

Current parameters used by Atlas:

```text
method=getList
apiKey=<KOSIS_API_KEY>
orgId=<ORG_ID>
tblId=<TBL_ID>
itmId=<ITM_ID>
objL1=<classification selector>
objL2..objL8=<optional selectors>
prdSe=<period type>
format=json
jsonVD=Y
startPrdDe=<optional>
endPrdDe=<optional>
newEstPrdCnt=<optional latest N periods>
outputFields=<optional comma-separated fields>
```

### Native data contract

Common response keys currently recognized by the normalizer:

```text
ORG_ID
TBL_ID / TBL_NM
ITM_ID / ITM_NM
C1 / C1_NM
PRD_DE
DT
UNIT_NM
LST_CHN_DE / SEND_DE
```

Do not assume every KOSIS table uses the same classification object meanings. Table-specific `orgId/tblId/itmId/objL*` mappings belong in dataset/indicator metadata.

### Atlas normalization

KOSIS is normalized to long-table statistics. It is mainly preferred for national/sido/sigungu statistics. More spatially detailed statistics should generally use SGIS when available.

### Pitfalls

- Do not call KOSIS on every map render; cache normalized results where allowed.
- Preserve table ID and item/classification IDs so values remain reproducible.
- Never equate a KOSIS classification code with an Atlas region ID without an explicit mapping.

---

## 2. SGIS OpenAPI — authentication, region hierarchy, aggregate statistics

- Source ID: `sgis`
- Dataset family: aggregate SGIS statistics
- Purpose: official spatial statistics, especially administrative-dong statistics
- Agent grade: B
- Adapter/code: `lib/sgis/client.ts`
- Atlas route: `GET /api/stats/sgis`

### Access

Atlas currently tries these hosts in order:

```text
https://sgisapi.mods.go.kr/OpenAPI3
https://sgisapi.kostat.go.kr/OpenAPI3
```

Auth env:

```text
SGIS_CONSUMER_KEY
SGIS_CONSUMER_SECRET
```

### Reusable request pattern — OAuth/token

```text
GET <SGIS_HOST>/auth/authentication.json
```

Parameters:

```text
consumer_key=<SGIS_CONSUMER_KEY>
consumer_secret=<SGIS_CONSUMER_SECRET>
```

Response value used:

```text
result.accessToken
result.accessTimeout
```

Atlas caches the token in-process and refreshes before expiry.

### Reusable request pattern — administrative hierarchy

```text
GET <SGIS_HOST>/addr/stage.json
```

Parameters:

```text
accessToken=<token>
cd=<optional parent code>
```

Current flow:

```text
no cd        -> sido
sido cd      -> sigungu
sigungu cd   -> eup/myeon/dong
```

Common fields:

```text
cd
addr_name
full_addr
```

### Reusable request pattern — population

```text
GET <SGIS_HOST>/stats/population.json
```

Current parameters:

```text
accessToken=<token>
year=<year>
adm_cd=<SGIS administrative code>
low_search=0
```

Fields currently read:

```text
adm_cd
adm_nm
tot_ppltn
avg_age
ppltn_dnsty
tot_family
avg_fmember_cnt
tot_house
```

### Reusable request pattern — company/business

```text
GET <SGIS_HOST>/stats/company.json
```

Current parameters:

```text
accessToken=<token>
year=<year>
adm_cd=<SGIS administrative code>
low_search=0
theme_cd=<optional>
```

Fields currently read:

```text
adm_cd
adm_nm
corp_cnt
tot_worker
```

### Atlas normalization

Current SGIS API result is **administrative-area aggregate statistics**, not a radius total and not a 100m grid value.

Never relabel it as grid statistics.

### Pitfalls

- SGIS and MOIS/KOSIS region codes must not be assumed identical.
- The current MVP can resolve a center point via Kakao -> SGIS stage hierarchy, but the long-term region-first app should use explicit Registry crosswalks.
- Reference-year support differs by endpoint/product; preserve the requested/returned year.

---

## 3. SGIS downloadable small-area grids

- Source ID: `sgis`
- Dataset ID: `sgis-small-area-grid`
- Purpose: 100m / 500m / 1km grid boundary + population/business statistics
- Agent grade: C for current portal/file acquisition path
- Normalizer: `lib/atlas-registry/ingest.ts`
- Preview API: `POST /api/registry/preview` with `kind=sgis-grid`

### Access pattern

This is intentionally treated separately from the SGIS aggregate OpenAPI.

```text
SGIS file acquisition
  -> SHP boundary
  -> TXT/CSV statistic file
  -> native boundary/grid code join
  -> Atlas normalized GeoParquet/Parquet/GeoPackage
```

### Native contract

- CRS: `EPSG:5179`
- Grid sizes: `100`, `500`, `1000` metres
- Native ID policy: **preserve provider grid/boundary code exactly**
- Atlas namespace:

```text
sgis:100m:<native-id>
sgis:500m:<native-id>
sgis:1000m:<native-id>
```

Common ID aliases recognized by the preview parser:

```text
gid
gridid
gridcd
grid100mcd
grid500mcd
grid1kcd
boundarycd
경계코드
격자코드
```

Common value aliases:

```text
val
value
값
인구수
사업체수
종사자수
```

Custom `idField` / `valueField` can be supplied when a downloaded product uses another header.

### Pitfalls

- Never rename a grid based on the containing administrative dong.
- Boundary and statistics reference years must be stored separately if different.
- Confidential/no-data values need product-specific handling rather than blanket conversion to zero.
- Large national files should use batch ETL/cache, not a Vercel API request body.

---

## 4. VWorld — WMTS / WMS / WFS

- Source ID: `vworld`
- Purpose: official national spatial layers; cadastral/planning/zoning candidates and map reference
- Agent grade: B
- Adapter/code: `lib/vworld/client.ts`, `lib/vworld/layers.ts`
- Atlas route: `GET /api/vworld/layers`

### Access

Base request family:

```text
https://api.vworld.kr/req
```

Auth env:

```text
VWORLD_API_KEY
```

### WMTS

Current tile template:

```text
https://api.vworld.kr/req/wmts/1.0.0/<KEY>/<Base|Satellite|Hybrid>/<z>/<y>/<x>.png
```

Use primarily as background/reference display.

### WMS

Endpoint:

```text
https://api.vworld.kr/req/wms
```

Current Atlas parameters:

```text
service=WMS
request=GetMap
version=1.3.0
key=<VWORLD_API_KEY>
layers=<comma-separated layer ids>
styles=<comma-separated styles>
crs=<default EPSG:3857>
bbox=minx,miny,maxx,maxy
width=<default 512>
height=<default 512>
format=image/png|image/jpeg
transparent=true
```

Use for display/verification, not as a substitute for extractable geometry.

### WFS

Endpoint:

```text
https://api.vworld.kr/req/wfs
```

Current Atlas parameters:

```text
service=WFS
request=GetFeature
version=1.1.0
key=<VWORLD_API_KEY>
typename=<VERIFIED TYPE NAME>
output=application/json
srsname=<default EPSG:4326>
maxfeatures=<1..1000>
bbox=<optional>
propertyname=<optional comma-separated fields>
```

### Verification rule

**Do not guess `typename` or assume a WMS layer ID is a valid extractable WFS type.**

Promote a VWorld layer through:

```text
catalogued -> runtime-verified -> extractable layer manifest
```

Record the working type name, output fields, CRS and any bbox constraints here after verification.

### Pitfalls

- Per-layer traffic/reuse terms may differ.
- Keep WMS/WMTS display and WFS/Data API extraction capabilities separate.
- Store source CRS even when requesting `EPSG:4326` output.

---

## 5. OpenStreetMap / Overpass context

- Source ID: `osm`
- Purpose: open fallback/context for buildings, roads, land use, green/water
- Agent grade: A
- Adapter/code: `lib/site-analysis/osm.ts`
- Atlas route: `GET /api/site/osm`

### Access

Endpoint:

```text
POST https://overpass-api.de/api/interpreter
```

Content type:

```text
application/x-www-form-urlencoded;charset=UTF-8
```

Body field:

```text
data=<Overpass QL>
```

Current query families:

```text
way(around:R,lat,lng)["building"]
way(around:R,lat,lng)["highway"]
way(around:R,lat,lng)["landuse"]
way(around:R,lat,lng)["leisure"~"^(park|garden)$"]
way(around:R,lat,lng)["natural"="water"]
way(around:R,lat,lng)["waterway"]
```

Output clause:

```text
out tags geom qt;
```

MVP guardrails:

```text
minimum radius: 50m
maximum radius: 1500m
timeout: 20s
```

### Atlas normalization

- way with `highway` -> road LineString
- closed non-road way -> Polygon where possible
- native feature ID: `way/<osm id>`
- output: GeoJSON FeatureCollection

### Policy

OSM is context/fallback, not an official Korean building/cadastral/planning record.

Attribution:

```text
© OpenStreetMap contributors (ODbL)
```

---

## 6. Official region-code / file download family

### code.go legal-dong codes

- Source ID: `mois-code`
- Dataset ID: `mois-legal-dong-codes`
- Data/search page: `https://www.code.go.kr/stdcode/regCodeL.do`
- Full-download route currently recorded by Atlas: `https://www.code.go.kr/stdcodesrch/codeAllDownloadL.do`
- Change notices: `https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardList.do?bbsId=BBSMSTR_000000000052`
- Agent grade: A for public file/page access; attachment URLs may change
- Preview normalizer: `POST /api/registry/preview`, `kind=legal-dong`

Important fields/aliases to preserve:

```text
법정동코드
법정동명
폐지여부 / 폐지구분
생성일
폐지일
법정동코드(주민)
법정동코드(지적)
```

Rules:

- code is a **string**, never a number
- preserve historical/abolished rows
- keep validity dates where present
- do not replace legal-dong code with administrative-dong code

### Administrative-area classification snapshot

- Dataset ID: `kostat-admin-dong-classification-20250704`
- Public-data page: `https://www.data.go.kr/data/15136373/fileData.do`
- Reference date recorded in Atlas: `2025-07-04`
- Preview normalizer: `POST /api/registry/preview`, `kind=admin-classification`

Expected fields:

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

Rules:

- keep the snapshot/revision date
- do not silently call an older snapshot “latest”
- derive validity windows only after comparing ordered changes/snapshots

---

# Sources already implemented but needing a fuller playbook entry

The following adapters exist, but their upstream call details should be expanded here the next time they are touched/verified:

| Source | Current role | Code area | Playbook action on next use |
|---|---|---|---|
| HIRA | official hospital/clinic facilities | `lib/poi/providers/hira.ts` | record endpoint, paging, region filters, coordinate fields |
| Kakao Local | Korean POI / coordinate-region helper | `lib/poi/providers/kakao.ts`, `lib/geo/kakaoRegion.ts` | record endpoint families, category/keyword parameters, storage constraints |
| Naver Local | Korean place search | `lib/poi/providers/naver.ts` | record endpoint and result coordinate convention |
| Google Places | global POI/detail complement | `lib/poi/providers/google.ts` | record request family + Maps Platform storage/display constraints |
| LOCALDATA | licensed-business baseline/update | ingestion design | record full-file path, API update route, status/category fields after first real ingestion |
| NGII / national satellite | domestic raster/context | dataset registry | record exact product-download/API route per product after first verified acquisition |

---

# Verification log format

Append short entries here rather than relying on chat history.

```text
YYYY-MM-DD | source/dataset | action | result | code/doc updated
```

Current baseline:

```text
2026-08-24 | KOSIS | table search + parameter-data client encoded | implemented | lib/kosis/client.ts
2026-08-24 | SGIS | auth + stage + population/company patterns encoded | implemented | lib/sgis/client.ts
2026-08-24 | SGIS grid | native-ID normalization preview added | implemented; full national file pending | lib/atlas-registry/ingest.ts
2026-08-24 | VWorld | WMTS/WMS/WFS generic client encoded | implemented; exact WFS type runtime verification pending | lib/vworld/client.ts
2026-08-24 | OSM | Overpass context query encoded | implemented | lib/site-analysis/osm.ts
2026-08-24 | region files | legal/admin code preview normalization encoded | implemented; current full snapshots pending | lib/atlas-registry/ingest.ts
```
