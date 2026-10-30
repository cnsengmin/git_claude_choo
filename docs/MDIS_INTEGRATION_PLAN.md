# Atlas KR — MDIS(마이크로데이터 통합서비스) 이용계획

## 목적

Atlas KR에서 통계청/국가데이터처의 **MDIS(MicroData Integrated Service)** 를 어떻게 활용할지 정리한다.

MDIS는 SGIS·KOSIS·VWorld처럼 바로 지도 레이어를 호출하는 Provider라기보다, 개인·가구·사업체 단위 마이크로데이터를 이용해 **맞춤형 파생 통계지표를 만드는 연구용 데이터 소스**로 본다.

Atlas의 공개 runtime에 원시 MDIS 마이크로데이터를 싣는 것이 아니라, 서비스 유형별 이용조건을 준수하면서 생성한 **공개·승인 가능한 집계/분석결과**를 Atlas Statistic Layer로 가져오는 방향이 기본이다.

---

## 1. SGIS/KOSIS와의 관계

통계청 ONE-ID를 통해 MDIS, KOSIS, SGIS+ 등 주요 통계정보서비스를 하나의 계정으로 이용할 수 있다.

다만 Atlas에서는 이를 하나의 API나 동일 데이터베이스로 취급하지 않는다.

```text
통계청/국가데이터처 통계정보 생태계
├─ KOSIS : 공개 집계통계 / 시계열
├─ SGIS  : 공간경계 / 격자 / 공간집계통계
└─ MDIS  : 마이크로데이터 / 맞춤형 분석
```

즉 포털·계정·자료제공 생태계는 연결되어 있지만, 접근방식·자료보호·재사용 규칙은 각각 별도로 관리한다.

---

## 2. Atlas에서의 역할

```text
SGIS
= 행정경계 / 격자경계 / 공간집계 통계

KOSIS
= 공개 집계통계 / 장기 시계열

MDIS
= 개인·가구·사업체 단위 마이크로데이터
  → 사용자 정의 교차분석
  → 연구용 파생지표
  → 공개 가능한 집계결과

VWorld
= 지적·계획·공간 Feature
```

MDIS는 특히 다음과 같은 지표를 만들 때 가치가 있다.

```text
연령 × 고용상태 × 지역
가구유형 × 주거특성 × 지역
산업 × 종사자특성 × 지역
중장년/청년/고령층의 세부 사회경제적 특성
```

단, 실제 제공 변수와 공간수준은 조사·연도·서비스 유형마다 다르므로 매 자료별 확인이 필요하다.

---

## 3. 이용 유형

Atlas에서는 최소 두 가지 경로를 구분한다.

### A. 공공용 마이크로데이터

MDIS 외부망에서 다운로드 가능한 공공용 자료.

```text
MDIS 로그인/자료선택
→ 공공용 microdata 다운로드
→ 로컬 연구환경에서 분석
→ 공개 가능한 집계표 생성
→ Atlas indicator mapping
→ Statistic Layer
```

Agent Grade는 기본 `C`로 본다. 로그인·자료선택·다운로드 절차가 있고, 완전한 공개 API 호출형이 아니기 때문이다.

### B. 인가용 자료 / RAS / RDC

세부 자료는 승인·심사·원격접근 또는 이용센터 방문 등 제한된 환경에서 분석할 수 있다.

```text
연구계획서 / 결과표 설계
→ 신청
→ 심사/승인
→ 제한된 분석환경
→ 결과 반출 요청
→ 검토된 집계결과만 반출
→ Atlas에 집계결과 등록
```

이 경로는 `restricted-analysis`로 별도 관리한다.

원시 unit-record 자료 자체는 Atlas 서버·GitHub·Vercel·공개 파일에 저장하지 않는다.

---

## 4. Atlas 데이터 모델

MDIS 원자료는 공개 Atlas Layer가 아니다.

Atlas에 들어오는 것은 다음과 같은 **파생 통계**다.

```text
region_id
reference_year
indicator_id
value
unit
source_id = mdis
source_dataset_id
aggregation_definition
sample/weight_note
confidentiality_note
retrieved_or_approved_date
```

예:

```text
indicator_id = employment.middle_age.employment_rate
indicator_id = household.single_person.middle_age.share
indicator_id = worker.service_sector.share
```

각 지표는 반드시 산식·대상모집단·가중치·공간수준·공개가능성을 기록한다.

---

## 5. 공간연계 원칙

MDIS의 지역변수는 조사별로 제공 수준이 다르고 일부 자료는 상세 지역변수가 제거/제한될 수 있다.

따라서 다음을 금지한다.

```text
MDIS에 시군구 변수가 있다고 가정
MDIS 지역코드를 KIK/SGIS 코드와 자동 동일시
개별 레코드에 좌표를 임의 부여
세부 지역을 추정하여 공개
```

정상 흐름:

```text
MDIS dataset metadata
→ 실제 제공 지역변수 확인
→ codebook 확인
→ 별도 crosswalk
→ disclosure-safe aggregate
→ Atlas Region Registry
```

---

## 6. MVP에서의 우선순위

MDIS는 **1차 공간데이터 MVP의 blocker가 아니다.**

현재 우선순위는:

```text
1. SGIS 행정경계 SHP
2. SGIS 100m grid SHP
3. 100m 인구 CSV
4. Region → Grid extract
5. CSV / GeoJSON / GeoPackage
```

이 흐름이 완성된 뒤 MDIS를 **파생지표 확장축**으로 붙인다.

즉:

```text
MVP core
공개 spatial layers + 공개 aggregate statistics

MVP+ / Research layer
MDIS-derived indicators
```

---

## 7. 첫 MDIS 활용 후보

Atlas에서 첫 MDIS 검증 후보는 공간적으로 의미가 있고 KOSIS/SGIS 공개집계보다 세부 교차분석 가치가 큰 자료를 우선한다.

후보 예:

```text
지역별고용조사
경제활동인구조사
인구주택총조사
전국사업체조사 / 경제총조사
가계금융복지조사
```

실제 선택 시 확인할 항목:

```text
[ ] 연도
[ ] 공공용/인가용 여부
[ ] 지역변수 수준
[ ] 가중치 변수
[ ] 표본/전수조사 여부
[ ] 비밀보호 규칙
[ ] 결과 반출 제한
[ ] Atlas indicator로 집계 가능한지
```

---

## 8. 전국 확장 규칙

MDIS 지표도 Atlas의 공통 규칙을 따른다.

```text
1 dataset / 1 year
→ 1 indicator
→ 1 region level
→ small-area validation
→ metadata/산식 검증
→ multi-year
→ multi-region
→ national indicator registry
```

단, MDIS에서는 작은 지역으로 갈수록 표본오차·비밀보호·지역변수 미제공 문제가 커질 수 있으므로 SGIS 100m Grid처럼 공간해상도를 임의로 높이지 않는다.

---

## 9. 보안/재사용 원칙

```text
원시 마이크로데이터 GitHub commit 금지
원시 마이크로데이터 Vercel 배포 금지
개인/사업체 식별 가능 레코드 공개 금지
인가용 원자료를 Atlas cache로 복제 금지
승인된 집계/반출 결과만 등록
```

Dataset별 이용조건과 공개가능범위를 Manifest에 남긴다.

---

## 10. 관련 문서

```text
docs/MVP_TO_NATIONAL_PLAYBOOK.md
docs/SOURCE_CALL_PLAYBOOK.md
docs/PUBLIC_SHP_SOURCE_STRATEGY.md
docs/BOUNDARY_LAYER_MODEL.md
```

MDIS는 공간경계의 대체재가 아니라 **Atlas의 통계지표 확장 Provider**로 관리한다.
