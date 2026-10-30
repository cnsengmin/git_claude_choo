# Atlas KR — SGIS 실제 다운로드 선택값 (2026-08-24)

## 목적

SGIS 자료제공 화면에서 MVP용 원자료를 신청할 때 사용한 **실제 UI 선택값**을 기록한다.

향후 같은 자료를 갱신하거나 전국 batch를 다시 만들 때 메뉴를 처음부터 재탐색하지 않고 이 문서를 기준으로 반복한다.

중요 원칙:

- 이 문서는 신청 화면에서 확인한 선택값을 기록한다.
- 실제 ZIP 내부 파일명, 필드명, CRS, 코드 체계는 다운로드 파일을 검사한 뒤 확정한다.
- 화면상의 `전체`가 어떤 파일 묶음을 의미하는지 미리 가정하지 않는다.

---

## 1. 센서스용 행정구역 경계

현재 신청 화면에서 확인한 값:

```text
자료형태       = 집계구
자료구분       = 통계지역경계
자료대상       = 센서스용 행정구역경계(전체)
경계년도       = 2025년 2분기
경계기준일     = 2025-06-30
시도           = 전국
시군구         = 전체
```

같은 화면에서 개별 선택 가능한 경계 유형도 확인됨:

```text
센서스용 행정구역경계(전체)
센서스용 행정구역경계(시도)
센서스용 행정구역경계(시군구)
센서스용 행정구역경계(읍면동)
도시화지역
집계구경계
기초단위구(시도단위)
```

### Atlas 처리 원칙

우선 `센서스용 행정구역경계(전체)` 전국 패키지를 받는다.

다운로드 후 다음을 검사한다.

```text
[ ] 시도 / 시군구 / 읍면동이 하나의 SHP인지 여러 SHP인지
[ ] 각 레벨을 구분하는 속성 필드가 있는지
[ ] SGIS adm_cd 또는 equivalent native code 필드
[ ] 명칭 필드
[ ] .prj CRS
[ ] .cpg / DBF encoding
[ ] feature count
[ ] reference date / release metadata
```

`전체` 패키지에 세 레벨이 모두 포함된다면 같은 snapshot을 세 Atlas reference layer로 분리한다.

```text
region.sido.boundary
region.sigungu.boundary
region.admin-dong.boundary
```

포함구조가 다르면 실제 파일 구조에 맞춰 adapter만 변경하고 Layer ID는 유지한다.

---

## 2. 100m 격자 인구 통계

신청 화면에서 확인한 값:

```text
자료형태       = 격자
자료구분       = 격자 통계자료
자료대상 후보  = 격자통계(인구), 격자통계(가구), 격자통계(주택),
                 격자통계(사업체), 격자통계(종사자),
                 격자통계(사업체종류별), 격자통계(종사자종류별)
격자레벨       = 100M
격자코드       = 전체
격자경계 포함  = 선택 가능
```

첫 MVP 대상은 다음으로 고정한다.

```text
자료대상   = 격자통계(인구)
격자레벨   = 100M
격자코드   = 전체
```

`년도`는 실제 다운로드된 통계 패키지의 선택값/파일 메타데이터를 확인한 뒤 Dataset Manifest에 기록한다. 화면 캡처만으로 연도를 추정해 하드코딩하지 않는다.

### 격자경계 포함 옵션

`격자경계 포함`을 함께 선택할 수 있다.

Atlas에서는 다음 두 경우 모두 지원한다.

```text
A. 인구 통계 신청 시 격자경계 포함
   → 동일 패키지 안의 grid boundary + statistics join 검증

B. 격자경계를 별도 신청
   → versioned grid boundary snapshot과 statistics snapshot을 독립 관리
```

장기 구조는 B처럼 경계와 통계를 독립 버전으로 관리하지만, MVP에서 A로 같이 받더라도 문제없다.

---

## 3. 다운로드 직후 절대 먼저 하지 않을 것

원본 ZIP/SHP/CSV를 바로 Atlas runtime 코드에 넣지 않는다.

먼저 다음 순서를 따른다.

```text
RAW DOWNLOAD
  ↓
package inventory
  ↓
archive/file SHA-256
  ↓
SHP component check
  ↓
PRJ / encoding / field inspection
  ↓
native code inspection
  ↓
small-area subset
  ↓
normalize
  ↓
manifest
  ↓
runtime Store
```

---

## 4. 첫 검증 지역

원본은 전국으로 받되 실제 ingest 검증은 작은 범위부터 한다.

```text
경기도
→ 안양시
→ 동안구
→ 부림동
```

검증 순서:

```text
1. 부림동 행정경계 1 feature 확인
2. 동안구 / 안양시 상위 경계 확인
3. KIK Region Code Fixture와 명칭/코드 crosswalk 확인
4. 부림동과 겹치는 100m grid 추출
5. native_grid_id로 인구 통계 join
6. CSV export
7. GeoJSON export
8. GeoPackage / QGIS open test
```

---

## 5. 실제 파일이 도착하면 기록할 값

각 다운로드마다 다음 receipt를 남긴다.

```text
acquired_at
request UI selections
source/release name
reference year/date
archive filename
archive sha256
member filenames
SHP stem(s)
DBF encoding
PRJ text / EPSG
feature count / row count
native code field
native name field
no-data/suppression rule
license/use note
normalization version
```

원본 파일명은 Atlas 규격으로 임의 변경하지 않고 Manifest에 그대로 보존한다.

---

## 6. 다음 작업

사용자가 다운로드 파일을 전달하면 다음을 수행한다.

```text
ZIP 그대로 검사
→ package manifest 생성
→ 실제 SHP schema 확인
→ 행정경계 레벨 구조 판별
→ 실제 100m grid code 확인
→ Anyang/Burim subset
→ KIK ↔ SGIS crosswalk
→ 100m population join
→ /api/extract 준비
```

관련 문서:

```text
docs/SGIS_SHP_ACQUISITION_20260824.md
docs/PUBLIC_SHP_SOURCE_STRATEGY.md
docs/BOUNDARY_LAYER_MODEL.md
docs/SGIS_100M_MVP_INGESTION.md
docs/MVP_TO_NATIONAL_PLAYBOOK.md
```
