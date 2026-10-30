# Atlas KR — SGIS Administrative Boundary API

## 목적

시도·시군구·행정읍면동 경계를 Atlas KR의 독립 Reference Boundary Layer로 연결하기 위해, SGIS 공식 OpenAPI의 재사용 가능한 호출 패턴을 기록한다.

검증 기준: 2026-08-24에 공개된 SGIS OpenAPI 정의서/개발지원센터 내용을 확인.

---

## 1. 인증

기존 Atlas SGIS 인증과 동일하다.

```text
GET <SGIS_HOST>/auth/authentication.json
```

환경변수:

```text
SGIS_CONSUMER_KEY
SGIS_CONSUMER_SECRET
```

Secret 값은 GitHub 문서/코드에 기록하지 않는다.

---

## 2. 행정구역 경계 API

공식 정의서에 기록된 endpoint:

```text
GET https://sgisapi.kostat.go.kr/OpenAPI3/boundary/hadmarea.geojson
```

필수 파라미터:

```text
accessToken=<token>
year=<reference year>
adm_cd=<SGIS administrative code or blank according to level>
```

선택 파라미터:

```text
low_search=0|1|2
```

의미:

```text
0 = 입력 adm_cd 자체 경계
1 = 1단계 하위 경계
2 = 2단계 하위 경계
```

공식 문서의 최근 규칙은 SGIS 행정구역 코드를 다음처럼 설명한다.

```text
2자리 = 시도
5자리 = 시군구
8자리 = 읍면동/행정동
```

중요: 이 코드는 KIK의 10자리 행정기관코드와 같은 값이라고 가정하지 않는다.

---

## 3. 응답 contract

공식 정의서에서 확인되는 주요 구조:

```text
features
geometry
coordinates
properties
  adm_cd
  adm_nm
  addr_en
  x
  y
```

Atlas normalization 시 최소 보존값:

```text
sgis_adm_cd
sgis_adm_nm
native geometry
reference year
retrieved_at
provider host
source route
```

KIK와 연결할 때는 별도 crosswalk를 사용한다.

---

## 4. 단계별 주소 API의 경계 옵션

SGIS 단계별 주소 API도 경량 경계를 반환할 수 있다.

```text
GET <SGIS_HOST>/addr/stage.json
```

파라미터:

```text
accessToken=<token>
cd=<optional parent code>
pg_yn=1
```

`pg_yn=1`은 경계를 포함한다. 공식 정의서에는 `x_coor`, `y_coor`가 UTM-K로 설명되어 있다.

Atlas 용도:

- Region hierarchy 탐색
- provider code 확인
- lightweight preview

정밀 extract/export 경계는 `boundary/hadmarea.geojson`를 우선 검증한다.

---

## 5. 현재 Atlas 레이어 매핑

```text
region.sido.boundary
region.sigungu.boundary
region.admin-dong.boundary
```

이 세 레이어의 primary candidate는 SGIS다.

`region.legal-dong.boundary`는 SGIS 행정구역 경계 API와 동일한 레이어로 간주하지 않는다. 법정동 polygon은 별도 provider/dataset 검증이 필요하다.

---

## 6. KIK ↔ SGIS 코드 분리

현재 Region Picker의 기준은 KIK 10자리 코드다.

예:

```text
KIK admin code
4117356600  부림동
```

SGIS boundary API는 SGIS 자체 행정구역 코드를 사용한다.

따라서 구현 흐름은 다음과 같다.

```text
KIK Region selection
      ↓
Region path/name/native KIK code
      ↓
KIK ↔ SGIS crosswalk
      ↓
SGIS adm_cd
      ↓
hadmarea.geojson
      ↓
Boundary normalization
```

임의의 substring 변환으로 KIK 코드에서 SGIS 코드를 만들지 않는다.

---

## 7. Runtime 검증 체크리스트

```text
[ ] SGIS production/test key configured
[ ] auth token success
[ ] 1 sido boundary request success
[ ] 1 sigungu boundary request success
[ ] 1 admin-dong boundary request success
[ ] GeoJSON geometry structure inspected
[ ] exact geometry CRS verified
[ ] returned year/base-year verified
[ ] KIK ↔ SGIS mapping verified for Anyang/Burim-dong
[ ] source/native code retained
[ ] GeoJSON opens in QGIS
```

정확한 geometry CRS는 실제 응답/공식 metadata를 확인하기 전 API adapter에서 추정값으로 고정하지 않는다.

---

## 8. 전국 확장

MVP에서는 안양 1개 지역으로 호출을 검증하되 API/Store는 전국 공통 구조로 만든다.

```text
1 admin-dong
→ 1 sigungu
→ 1 sido
→ national cache/batch strategy
```

전국 서비스에서 매 요청마다 모든 전국 polygon을 SGIS API로 호출하지 않는다. 검증 후 snapshot cache 또는 normalized boundary artifact를 두는 방식을 우선 검토한다.

---

## 9. 관련 문서

```text
docs/SOURCE_CALL_PLAYBOOK.md
docs/BOUNDARY_LAYER_MODEL.md
docs/MVP_TO_NATIONAL_PLAYBOOK.md
docs/IMPLEMENTATION_LOG.md
```
