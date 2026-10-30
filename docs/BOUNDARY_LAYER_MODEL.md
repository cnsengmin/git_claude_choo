# Atlas KR — Boundary Layer Model

## 목적

Atlas KR에서 **행정구역 코드 Registry**와 **공간 경계 Geometry**를 구분하고, 시도·시군구·행정읍면동·법정동 경계를 각각 독립 레이어로 관리하기 위한 규칙을 기록한다.

이 문서는 MVP에서 작은 지역으로 검증하더라도 전국 확장 시 같은 구조를 그대로 재사용하기 위한 기준이다.

---

## 1. `Anyang Region Code Fixture`의 의미

현재 코드에 포함된 안양 fixture는 SHP나 polygon 경계가 아니다.

정확한 역할은 다음과 같다.

```text
Anyang Region Code Fixture
├─ KIK 행정기관 코드
├─ 지역 명칭
├─ 부모 코드 관계
├─ 생성일자
└─ 행정동 ↔ 법정동 KIKmix 관계
```

즉 Region Picker와 API 계약을 검증하기 위한 **작은 코드/관계 테스트 데이터**다.

포함하지 않는 것:

```text
geometry
SHP
GeoJSON polygon
boundary CRS
boundary snapshot
```

전국 KIK ingestion이 runtime RegionStore에 연결되면 이 fixture는 테스트용으로만 남긴다.

---

## 2. 코드 Registry와 Boundary Registry는 독립

Atlas는 다음을 하나의 테이블로 강제 병합하지 않는다.

```text
REGION CODE REGISTRY
KIK / 행정구역 코드
        │
        │ official code / crosswalk
        ▼
BOUNDARY REGISTRY
시도 / 시군구 / 행정읍면동 / 법정동 polygon
```

이유:

- 코드 기준일과 경계 기준일이 다를 수 있다.
- 행정동과 법정동은 서로 다른 공간 단위다.
- 통계 기준연도와 경계 배포연도도 다를 수 있다.
- 하나의 행정동이 여러 법정동과 연결될 수 있다.

---

## 3. Boundary Layer IDs

MVP부터 다음 네 경계를 독립 레이어로 등록한다.

```text
region.sido.boundary
region.sigungu.boundary
region.admin-dong.boundary
region.legal-dong.boundary
```

Grid는 별도 계열이다.

```text
grid 1km
 grid 500m
 grid 100m
```

향후 layer ID 예:

```text
grid.sgis.1km.boundary
grid.sgis.500m.boundary
grid.sgis.100m.boundary
```

Grid ID 명명은 실제 SGIS geometry ingest 시 최종 확정한다.

---

## 4. 분석 단위와 참조 경계를 분리

사용자가 선택하는 `분석 단위`는 통계나 공간추출의 기본 단위다.

예:

```text
분석 단위 = 100m grid
```

이때 참조 경계는 독립적으로 함께 선택할 수 있다.

```text
☑ 시도 경계
☑ 시군구 경계
☑ 행정읍면동 경계
□ 법정동 경계
☑ 100m 인구 grid
```

따라서 Atlas에서 다음 두 개념을 혼동하지 않는다.

```text
Analysis layer
= 실제 분석 대상 단위

Reference boundary layer
= 지도/QGIS/분석 문맥을 위한 독립 경계
```

Reference boundary는 분석 단위에 맞추기 위해 이름이나 공간수준을 변경하지 않는다.

---

## 5. 최소 Boundary Schema

각 경계 feature는 최소 다음 정보를 보존한다.

```text
atlas_region_id or boundary_id
official_code
region_type
native_feature_id
boundary_version
reference_date
source_id
source_dataset_id
source_crs
geometry
```

추가 권장 필드:

```text
valid_from
valid_to
retrieved_at
license
source_url_or_route
normalization_version
```

`official_code`가 없는 공급자 자료는 Atlas Region Registry와의 crosswalk가 확인되기 전 `available` 상태로 승격하지 않는다.

---

## 6. 버전 정책

다음 세 날짜를 독립적으로 기록한다.

```text
region code snapshot
boundary snapshot/reference date
statistics reference year
```

예:

```text
KIK code snapshot    2026-07-20
Admin boundary       2025
Population grid      2024
```

Atlas는 세 값이 동일하다고 가정하지 않는다.

Export metadata에는 실제 사용된 버전을 각각 기록한다.

---

## 7. Provider 정책

현재 MVP Registry의 공급자 우선순위는 잠정적이다.

```text
시도/시군구/행정읍면동
primary candidate: SGIS
fallback candidate: VWorld

법정동
primary candidate: VWorld
fallback candidate: data.go.kr
```

중요:

- `partial`은 구조/adapter 일부가 있으나 실제 boundary snapshot runtime 검증이 아직 끝나지 않았다는 의미다.
- `planned`는 exact extractable dataset/layer가 확정되지 않았다는 의미다.
- WMS로 보인다는 이유만으로 export 가능한 feature layer라고 판단하지 않는다.
- 정확한 source layer, CRS, native ID, license가 검증되어야 `available`로 승격한다.

---

## 8. MVP 검증 순서

새 boundary dataset은 다음 순서로 확대한다.

```text
1 feature
↓
1 행정동
↓
안양시
↓
경기도
↓
전국
```

검증 항목:

```text
[ ] geometry valid
[ ] source CRS verified
[ ] native feature/code preserved
[ ] official code join verified
[ ] feature count checked
[ ] boundary reference date recorded
[ ] source/license recorded
[ ] GeoJSON export verified
[ ] GeoPackage/QGIS open verified
```

---

## 9. QGIS-ready 구조

최종적으로 하나의 지역 프로젝트는 다음처럼 독립 레이어를 포함할 수 있다.

```text
Atlas_Anyang.gpkg
├─ sido_boundary
├─ sigungu_boundary
├─ admin_dong_boundary
├─ legal_dong_boundary
├─ grid_100m
└─ population_100m
```

중요한 점은 GeoPackage 안에 함께 들어가더라도 원래 데이터 모델에서는 독립 레이어라는 것이다.

---

## 10. 전국 확장 규칙

MVP 구현에서 반드시 지킨다.

```text
small-area fixture/data
→ stable interface
→ source-specific ingest
→ manifest
→ normalized artifact
→ Region/Boundary/Grid store
→ same API/UI
→ national batch
```

안양 전용 함수나 데이터 구조를 새로 만들지 않는다.

예:

```text
좋음: BoundaryStore.getFeatures(scope, layerId)
나쁨: getAnyangDongShapefile()
```

---

## 11. 다음 작업

```text
1. 4개 boundary layer를 Catalog에서 독립 Reference Layer로 노출
2. 실제 시도/시군구/행정읍면동 boundary dataset 확보 및 검증
3. 1개 안양 행정동 geometry join
4. SGIS 100m geometry + population 통계 join
5. Region → Grid extraction
6. CSV / GeoJSON
7. GeoPackage
```

이 순서에서 boundary source가 달라지더라도 Layer ID와 Export 계약은 유지한다.
