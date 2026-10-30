# Atlas KR — MVP → 전국 확장 Playbook

## 목적

이 문서는 Atlas KR을 **작은 검증 범위(MVP)** 에서 시작해 **전국 단위 서비스**로 확장할 때, 매번 구조를 다시 설계하지 않도록 작업 순서·검증 기준·저장 규칙을 고정하기 위한 운영 문서다.

핵심 원칙은 다음과 같다.

> MVP에서 만든 코드는 “안양 전용 기능”이 아니라, 전국 자료로 교체 가능한 Adapter / Registry / Store 구조여야 한다.

> 새로운 자료를 붙일 때는 채팅 기록에만 남기지 않고 Source Call Playbook, Dataset Registry, 검증 Manifest, 변환 코드 중 적절한 위치에 반드시 남긴다.

---

## 1. MVP의 최소 성공 조건

Atlas KR MVP는 다음 흐름이 **실제 데이터로 한 번 끝까지 작동**하면 1차 완성으로 본다.

```text
REGION 선택
  ↓
LAYER 선택
  ↓
실제 Provider / File에서 데이터 획득
  ↓
Native ID + CRS + 기준연도 + 출처 보존
  ↓
Atlas 공통 schema로 정규화
  ↓
선택 지역으로 추출
  ↓
CSV / GeoJSON 다운로드
  ↓
QGIS용 GeoPackage 또는 QGIS-ready package
```

지도 시각화, 3D, 고급 분석 레시피, CAD, 전국 모든 레이어는 이 1차 MVP의 필수조건이 아니다.

---

## 2. 현재 진행 상태 — 2026-08-24

### A. 제품/아키텍처 기반 — 높음

- Region-first Data Catalog UI 구현
- Source / Dataset / Layer / CRS / Indicator / Export Registry 구현
- Native ID 보존 정책 구현
- 기본 분석 CRS `EPSG:5179`
- Web 교환 CRS `EPSG:4326`
- QGIS / MCP / CAD export profile 개념 구현
- Vercel 배포 및 GitHub CI 구축

**평가: 약 85~90%**

### B. Region Registry — 중상

- 공식 KIK Layout 검증
- `KIKcd_H / KIKcd_B / KIKmix` parser 구현
- 2026-07-20 원본과 XLSX row-level 대조 검증
- 전국 KIK ingestion script 구현
- admin ↔ legal crosswalk 구조 구현
- 안양 MVP cascading Region Picker 구현
- 전국 확장을 위한 hierarchy rule 문서화

남은 핵심:

- generated national registry를 runtime Region Store에 연결
- snapshot/version 교체 정책
- 과거 change-history snapshot / 변경고시 연계
- 별도 boundary geometry 버전 연결

**평가: 약 65~70%**

### C. Provider Adapter — 중간

현재 코드/설계가 있는 Provider:

- SGIS OpenAPI
- KOSIS
- VWorld WMS/WFS/WMTS
- HIRA
- Kakao
- Naver
- Google Places
- OSM Overpass
- LOCALDATA ingestion design
- NGII/국토위성 registry 후보

남은 핵심:

- Vercel runtime key verification
- VWorld exact WFS/Data API layer verification
- KOSIS table → Atlas indicator mappings
- Provider별 실제 추출 결과를 공통 extractor로 연결

**평가: 약 55~60%**

### D. SGIS Grid / 소지역 통계 — 초기~중간

- 100m / 500m / 1km Grid System Registry 구현
- native grid ID 보존 규칙 구현
- 통계 TXT/CSV preview normalizer 구현
- SGIS grid download/ingest route 문서화

남은 핵심:

- 실제 100m boundary geometry 확보
- 실제 population/business grid 파일 확보
- boundary ↔ statistics join
- region polygon ↔ grid spatial filtering
- regional extraction cache

**평가: 약 25~30%**

### E. 실제 End-to-End Extraction — 초기

- Export Plan API 구현
- layer compatibility / target format 판단 구현

아직 부족한 핵심:

- 선택 지역 + 선택 레이어를 실제 파일로 생성
- CSV / GeoJSON 실제 다운로드
- metadata / provenance sidecar 생성
- 큰 데이터의 cache/storage 전략

**평가: 약 20~25%**

### F. QGIS-ready Export — 초기

- QGIS target profile 정의
- GeoPackage 우선 정책 정의

남은 핵심:

- GeoPackage 실제 생성
- CRS / layer name / metadata 검증
- 복수 layer package
- QGIS MCP handoff

**평가: 약 10~15%**

---

## 3. 전체 MVP 진행률 해석

두 가지 숫자를 구분한다.

### 플랫폼 기반 진행률

Architecture, Registry, Provider adapter, CI, UI skeleton을 포함하면:

**약 65~70%**

### 실제 사용 가능한 End-to-End MVP 진행률

사용자가 “지역을 고르고 → 실제 데이터를 받고 → QGIS에 연다”는 최종 흐름만 기준으로 보면:

**약 45~50%**

즉, 기반 공사는 상당히 진행됐지만 실제 제품 완성도를 결정하는 **Grid ingest + real extraction + QGIS export**가 아직 남아 있다.

---

## 4. 앞으로의 단계

### Stage 1 — 전국 Region Store

목표:

```text
KIK source files
→ generated registry
→ RegionStore
→ /api/regions
→ UI
```

완료 기준:

- `경기도 → 안양시 → 동안구 → 부림동`뿐 아니라 전국 임의 지역 탐색 가능
- UI는 저장방식이 바뀌어도 수정하지 않음
- Store는 fixture / generated JSON / DB 구현을 교체 가능

### Stage 2 — SGIS 100m Grid MVP

목표:

- 한 개 기준연도
- 인구 1개 indicator
- 100m grid
- 먼저 안양시 또는 한 행정동 범위로 검증

완료 기준:

```text
SGIS boundary native_grid_id
        +
SGIS population native_grid_id
        ↓
normalized grid layer
```

모든 grid에는 최소한 다음 metadata가 있어야 한다.

```text
native_grid_id
atlas_grid_id
grid_size_m
source_crs
reference_year
indicator_id
value
unit
source_id
```

### Stage 3 — Region → Grid 추출

목표:

행정동을 선택하면 해당 polygon에 속하는 100m grid를 반환한다.

처음에는 완전한 전국 서버 연산보다, 사전 계산된 regional cache도 허용한다.

완료 기준:

```text
GET/POST extract
region_code=...
layer=population.grid-100m.total
year=...
```

→ 실제 GeoJSON/CSV 결과.

### Stage 4 — 첫 실제 Export

MVP 파일 포맷 우선순위:

1. CSV
2. GeoJSON
3. GeoPackage

완료 기준:

- 선택 지역
- 기준연도
- layer ID
- source ID
- source CRS
- output CRS
- retrieved/generated time
- license/provenance

가 파일 또는 sidecar metadata에 남는다.

### Stage 5 — Layer 확대

첫 end-to-end 성공 뒤 다음 순서로 확대한다.

```text
100m Population
→ 100m Business / Workers
→ Admin-dong aggregate stats
→ Building / Road
→ Cadastral / Zoning
→ Facility
→ Raster / NDVI
```

레이어를 동시에 많이 추가하지 않는다. **하나를 끝까지 Export 가능한 상태로 만든 뒤 다음 레이어로 넘어간다.**

---

## 5. 전국 확장을 고려한 개발 규칙

### Rule 1 — Scope보다 Interface를 먼저 고정

MVP가 안양 자료를 사용해도 함수/API는 `AnyangRegionStore`가 아니라 `RegionStore`를 사용한다.

```text
UI → RegionStore interface → fixture/generated/db adapter
```

### Rule 2 — 원자료를 코드에 하드코딩하지 않기

검증 fixture는 허용하되 전국 원자료는 다음 흐름을 사용한다.

```text
source raw
→ ingest script
→ manifest
→ normalized artifact/cache
→ runtime adapter
```

### Rule 3 — 모든 ingest에는 Manifest

최소 필드:

```text
source
source_url / acquisition route
snapshot/reference date
retrieved date
raw filename
raw sha256
row/feature count
encoding / format
source CRS
normalization version
warnings / orphan count
```

### Rule 4 — Adapter와 Dataset을 분리

같은 사이트라도 Dataset마다 독립 Manifest를 가진다.

```text
data.go.kr
├─ administrative classification
├─ HIRA
├─ traffic
└─ facility
```

### Rule 5 — Native ID는 절대 버리지 않기

Atlas ID는 namespace를 붙이는 식으로 추가한다.

```text
sgis:100m:<native-id>
```

원래 ID는 별도 필드로 항상 보존한다.

### Rule 6 — 경계와 통계는 독립 버전

```text
region code snapshot
boundary snapshot
statistics reference year
```

세 값이 반드시 같다고 가정하지 않는다.

### Rule 7 — 전국 확장 전 작은 지역에서 검증

새 Provider/Layer는 다음 순서로 검증한다.

```text
1 record
→ 1 admin-dong
→ 1 sigungu
→ 1 sido
→ national batch
```

### Rule 8 — Chat-only knowledge 금지

재사용 가치가 있는 성공/실패 정보는 반드시 다음 중 하나에 저장한다.

- `docs/SOURCE_CALL_PLAYBOOK.md`
- 이 Playbook
- dataset manifest
- source-specific docs
- code comments/tests

---

## 6. 작업 단위별 Done 정의

새 Layer 하나는 다음 8개가 있어야 `available`로 승격한다.

```text
[ ] source verified
[ ] access route documented
[ ] raw/native schema inspected
[ ] native ID preserved
[ ] CRS verified
[ ] normalizer implemented
[ ] one-region runtime extraction verified
[ ] export + provenance verified
```

중간 상태는 `partial`, 아직 구현 전은 `planned`를 유지한다.

---

## 7. 현재 최우선 작업

현재 시점의 우선순위는 다음 세 가지다.

```text
1. RegionStore abstraction + 전국 generated registry 연결 준비
2. SGIS 100m 실제 파일 ingestion
3. 선택 Region → 실제 100m population CSV/GeoJSON
```

이 세 가지가 완료되면 Atlas KR은 “설계된 데이터 카탈로그”에서 “실제 데이터를 꺼내는 공간데이터 MVP”로 넘어간다.

---

## 8. 반복 작업 기록 형식

각 중요한 개발 사이클 후 이 문서 또는 관련 문서에 다음 형식으로 남긴다.

```text
YYYY-MM-DD
Goal:
Input/source:
Small-area test:
Implementation:
Validation:
Failure/edge cases:
National expansion note:
Next:
```

현재 기록:

```text
2026-08-24
Goal: KIK current snapshot을 Atlas Region Registry로 사용
Input/source: KIKcd_H / KIKcd_B / KIKmix 20260720
Small-area test: Anyang / Dongan-gu / Burim-dong
Implementation: raw parser, national ingestion script, admin/legal relation, cascading UI
Validation: raw-XLSX row equality, CI typecheck/build
Failure/edge cases: naive numeric prefix hierarchy is unsafe; special branch-office/orphan handling required
National expansion note: runtime Store를 fixture에서 generated artifact/DB로 교체 가능하게 유지
Next: RegionStore abstraction + SGIS 100m real ingestion
```
