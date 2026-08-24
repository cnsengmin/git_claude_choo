# Atlas KR — SGIS 100m Grid MVP Ingestion

## 목적

첫 번째 end-to-end 공간통계 MVP를 **SGIS 100m 총인구**로 검증한다.

처음부터 전국 모든 지표를 처리하지 않고 다음 순서로 확장한다.

```text
1 row
→ 1 admin-dong
→ 1 sigungu
→ 1 sido
→ national batch
```

## MVP 범위

첫 성공 조건:

- grid size: 100m
- indicator: total population
- one reference year
- one small test area
- native SGIS grid ID preserved
- statistics file normalized
- boundary geometry joined separately
- CSV / GeoJSON output

## 통계 파일 ingest

Repo command:

```bash
npm run data:sgis-grid -- \
  --input /path/to/sgis_population_100m.csv \
  --grid-size 100 \
  --year 2024 \
  --indicator population.total \
  --unit persons
```

헤더 자동 인식 후보:

```text
gid
gridid
gridcd
grid100mcd
boundarycd
경계코드
격자코드
```

값 후보:

```text
val
value
값
인구수
사업체수
종사자수
```

자료별 헤더가 다르면 명시한다.

```bash
npm run data:sgis-grid -- \
  --input /path/to/file.csv \
  --grid-size 100 \
  --year 2024 \
  --indicator population.total \
  --unit persons \
  --id-field <실제격자ID컬럼> \
  --value-field <실제값컬럼>
```

## 생성물

```text
statistics.json
statistics.csv
manifest.json
```

정규화 최소 schema:

```text
atlas_grid_id
native_grid_id
grid_size_m
source_crs
reference_year
indicator_id
value
unit
source_id
```

`atlas_grid_id` 예:

```text
sgis:100m:<native_grid_id>
```

## 결측/비밀보호값

빈 값이나 비밀보호 표시는 `0`으로 바꾸지 않는다.

```text
blank / NA / N/A / null / BSCA / - / x / *
→ value = null
```

원자료별 추가 비밀보호 코드는 실제 파일 검증 후 Manifest와 Source Call Playbook에 기록한다.

## Boundary geometry

통계 파일과 경계 파일은 독립적으로 취급한다.

```text
SGIS boundary SHP
   native_grid_id
        +
SGIS statistics
   native_grid_id
        ↓
joined grid layer
```

경계 geometry의 기본 원칙:

- source CRS 보존
- SGIS 경계가 `EPSG:5179`인지 파일/메타데이터에서 재확인
- 원본 native grid ID 유지
- web output이 필요하면 별도로 `EPSG:4326` 변환
- QGIS package는 분석 CRS `EPSG:5179` 우선

## 전국 확장시 저장전략

Vercel function에서 전국 SHP/TXT를 매 요청마다 처리하지 않는다.

권장 흐름:

```text
RAW DOWNLOAD
  ↓
OFFLINE / BATCH INGEST
  ↓
MANIFEST + NORMALIZED ARTIFACT
  ↓
REGIONAL CACHE / OBJECT STORAGE / DB
  ↓
API extraction
```

MVP 단계에서는 한 행정동/시군구 파일을 repository fixture로 사용할 수 있지만, 전국 파일은 repository source code에 직접 하드코딩하지 않는다.

## 검증 체크리스트

```text
[ ] 공식 SGIS product/연도 확인
[ ] boundary 파일 확보
[ ] population 파일 확보
[ ] 실제 header 기록
[ ] native grid ID 중복 검사
[ ] row count 기록
[ ] source file SHA-256 기록
[ ] null/confidential code 확인
[ ] boundary-stat join rate 확인
[ ] small-area GeoJSON 생성
[ ] QGIS에서 EPSG:5179 확인
```

## 다음 구현

```text
SGIS statistics ingest script   ← 현재 구현
          ↓
actual SGIS 100m files
          ↓
boundary conversion / join
          ↓
region-to-grid filter
          ↓
/api/extract
          ↓
CSV / GeoJSON
```

실제 파일을 검증하는 순간 다음 정보를 `docs/SOURCE_CALL_PLAYBOOK.md`에도 추가한다.

- 정확한 다운로드 경로
- 상품명/연도
- 헤더
- 비밀보호 코드
- 경계 CRS
- join key
- 파일 크기/row count
- 다운로드/이용 조건
