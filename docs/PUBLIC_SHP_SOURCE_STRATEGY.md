# Atlas KR — 공개 SHP 우선 수집 전략

## 목적

Atlas KR MVP에서 행정경계와 격자경계를 매 요청마다 API로 생성하기보다, **공식 공개 SHP를 버전된 snapshot으로 수집·정규화**하여 재현성 있게 사용하는 전략을 기록한다.

이 문서는 2026-08-24 공개 상태를 기준으로 작성한다.

---

## 1. 결론

행정구역/격자 SHP는 공개가 중단된 것이 아니다.

현재 SGIS 자료제공 페이지에서 다음 자료가 **전국·공개·무료 SHP**로 명시되어 있다.

```text
센서스용 행정구역 경계
- 전체 / 시도 / 시군구 / 읍면동
- 2001~2025: 연도별
- 1975~2000: 5년 단위
- SHP
- 전국
- 공개 / 무료

격자 경계
- 100m / 500m / 1km / 10km / 100km
- 2025
- SHP
- 전국
- 공개 / 무료
```

또한 SGIS는 2024년까지 인구·가구·주택 및 사업체·종사자 통계를 CSV로 제공한다.

공공데이터포털에도 `국가데이터처_SGIS 행정구역 통계 및 경계`, `국가데이터처_SGIS 격자 통계 및 경계`가 파일 데이터로 노출되어 있으며, SHP/CSV가 포함된다고 안내된다.

따라서 Atlas MVP의 행정경계/격자경계는 **SGIS 공개 SHP snapshot을 primary source**로 사용하는 것이 적합하다.

---

## 2. VWorld와의 관계

VWorld가 모든 SHP를 대체한 것은 아니다.

현재 구조는 다음처럼 보는 것이 안전하다.

```text
SGIS
├─ 행정구역 경계
├─ 집계구 경계
├─ 100m/500m/1km 격자
└─ census/statistical boundary + statistics

VWorld / 국가공간정보 계열
├─ 지적/필지
├─ 도시계획/용도지역
├─ 토지특성도
├─ 토지이용현황도
├─ 법정동 관련 공간/속성 후보
└─ 기타 국가 공간정보 레이어
```

공공데이터포털의 여러 국토교통부 SHP 자료는 실제 다운로드 URL을 VWorld `dtmk` 경로로 연결하고 있다.

즉 `국가공간정보포털 → VWorld 오픈마켓` 계열의 이동/통합은 일부 자료에서 확인되지만, **SGIS의 통계경계 SHP 제공은 별도로 계속 운영 중**이다.

---

## 3. Atlas source priority

### 3.1 행정경계

```text
region.sido.boundary
region.sigungu.boundary
region.admin-dong.boundary
```

우선순위:

```text
1. SGIS 공개 SHP snapshot
2. SGIS boundary OpenAPI (검증/보조/소규모 요청)
3. VWorld fallback / 비교검증
```

MVP에서는 SHP snapshot을 먼저 사용한다.

이유:

- 기준연도 고정 가능
- 전국 일괄 처리 가능
- QGIS 검증 쉬움
- API traffic과 장애에 덜 의존
- hash/feature count를 manifest로 남기기 쉬움

### 3.2 격자경계

```text
grid.sgis.100m.boundary
grid.sgis.500m.boundary
grid.sgis.1km.boundary
```

Primary:

```text
SGIS 2025 grid boundary SHP
```

통계는 별도 CSV로 유지하고 `native_grid_id`로 join한다.

### 3.3 법정동 경계

```text
region.legal-dong.boundary
```

SGIS 행정구역 경계를 법정동 경계로 재사용하지 않는다.

후보:

- VWorld / 국토교통부 법정동정보 계열
- 공공데이터포털의 관련 공간정보

정확한 polygon dataset, native code, CRS, reuse terms를 검증한 후 source를 확정한다.

---

## 4. MVP ingest 흐름

```text
OFFICIAL SHP / CSV
      ↓
raw snapshot 보존
      ↓
manifest
- source
- reference year
- retrieved date
- raw filename
- SHA-256
- CRS
- feature/row count
- license
      ↓
normalize
      ↓
GeoParquet / GeoJSON / GeoPackage
      ↓
Region/Grid Store
      ↓
/api/extract
```

원본 SHP는 source artifact로 보존하고, 웹/runtime에서 SHP를 직접 읽는 방식은 피한다.

---

## 5. 첫 MVP 다운로드 세트

첫 end-to-end 검증에는 전체 자료를 많이 받을 필요가 없다.

우선 다음 3종이면 충분하다.

```text
A. 2025 센서스용 행정구역 경계 SHP
   - 시도
   - 시군구
   - 읍면동

B. 2025 100m 격자 경계 SHP

C. 2024 100m 인구 통계 CSV
```

검증 지역:

```text
경기도 → 안양시 → 동안구 → 부림동
```

성공 후 같은 ingest 코드를 전국 batch에 사용한다.

---

## 6. 경계와 통계의 기준연도 분리

현재 공개 자료 구조상 다음 조합은 정상적이다.

```text
Boundary: 2025
Statistics: 2024
KIK code snapshot: 2026-07-20
```

Atlas는 이를 오류로 보지 않고 각 provenance를 독립 저장한다.

---

## 7. runtime 원칙

MVP에서 API와 file snapshot의 역할을 구분한다.

```text
File snapshot
= reproducible base layer / bulk extraction

OpenAPI
= validation / small request / current provider lookup

VWorld WMS/WMTS
= visual reference

VWorld WFS/Data API
= verified extractable national spatial layers
```

---

## 8. 다음 구현

```text
1. SGIS 2025 행정경계 SHP 확보
2. SHP schema / CRS / native code 검사
3. Anyang subset 추출
4. GeoJSON/GeoPackage 변환
5. KIK ↔ SGIS crosswalk 검증
6. 2025 100m grid SHP ingest
7. 2024 population CSV join
8. 부림동 내부 grid extract
9. CSV + GeoJSON export
10. QGIS open test
```

---

## 9. 관련 문서

```text
docs/MVP_TO_NATIONAL_PLAYBOOK.md
docs/BOUNDARY_LAYER_MODEL.md
docs/SGIS_ADMIN_BOUNDARY_API.md
docs/SGIS_100M_MVP_INGESTION.md
docs/SOURCE_CALL_PLAYBOOK.md
```
