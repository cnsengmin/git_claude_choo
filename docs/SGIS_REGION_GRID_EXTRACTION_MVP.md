# Atlas KR — SGIS Region → 100m Grid → Population MVP

## 목적

실제 SGIS 원자료를 이용해 작은 지역에서 `행정동 → 100m 격자 → 인구통계 → CSV/GeoJSON`을 끝까지 연결하고, 같은 절차를 전국으로 반복할 수 있게 고정한다.

이 문서는 `sgis-schema-burim-20260825.json`에서 확인된 실제 스키마와 SGIS 소지역 통계 이용매뉴얼의 통계파일 구조를 기준으로 한다.

---

## 1. 실제 확인된 행정경계 구조

2025 읍면동 경계:

```text
ZIP  : 2025년 센서스용 행정구역경계(읍면동).zip
SHP  : bnd_dong_00_2025_2Q
CRS  : Korea 2000 / Unified CS = EPSG:5179
CPG  : UTF-8
rows : 3,559
```

DBF:

```text
BASE_DATE  C(8)
ADM_CD     C(8)
ADM_NM     C(25)
```

2025 시군구 경계:

```text
SIGUNGU_CD C(5)
SIGUNGU_NM C(25)
BASE_DATE  C(8)
```

2025 시도 경계:

```text
SIDO_CD C(2)
SIDO_NM C(25)
BASE_DATE C(8)
```

SGIS 내부에서는 이 native hierarchy를 사용한다.

```text
SIDO_CD (2)
  ↓ prefix within SGIS
SIGUNGU_CD (5)
  ↓ prefix within SGIS
ADM_CD (8)
```

주의: 이것은 **SGIS 내부 코드 계층 규칙**이다. KIK 10자리 코드를 잘라 SGIS 코드를 만드는 규칙이 아니다.

---

## 2. 같은 이름 행정동 중복 발견

`부림동` 이름만 검색하면 2025 경계에서 2개가 나온다.

```text
ADM_CD 31042580
bbox   951378.7744, 1932520.6265, 952657.9842, 1933812.0765

ADM_CD 31110540
bbox   955262.1778, 1936857.3489, 955964.7393, 1937941.1997
```

따라서 Atlas에서는 행정동 이름 단독 검색으로 Region을 확정하지 않는다.

```text
경기도
→ 안양시 동안구
→ 부림동
```

처럼 시도와 시군구를 먼저 SGIS native code로 해석하고, 그 `SIGUNGU_CD` prefix 안에서 `ADM_NM=부림동`을 찾아야 한다.

이 규칙은 전국 확장 시 동명 읍면동 충돌을 방지하는 기본 규칙으로 사용한다.

---

## 3. 부림동 주변 100m 격자 partition

행정동 bbox와 2025 Grid archive bbox를 비교한 결과 후보 partition은:

```text
_grid_border_grid_2025_grid_다사_grid_다사.zip
```

이다.

이 ZIP에는 여러 해상도가 같이 존재한다.

```text
grid_다사_100K
grid_다사_10K
grid_다사_1K
grid_다사_500M
grid_다사_100M
```

100m 경계의 DBF join field:

```text
GRID_CD  C(12 bytes)
```

소스 CRS는 행정경계와 동일한 Korea 2000 / Unified CS (EPSG:5179)이다.

Atlas 원칙:

```text
raw archive partition != Atlas layer

28개 raw partition
        ↓
logical Grid layer
        ↓
region query 시 필요한 partition만 읽음
```

전국 100m 경계를 하나의 거대한 SHP로 미리 합치지 않는다.

---

## 4. 2024 100m 인구통계와 join

실제 파일 구조:

```text
24년 격자통계(인구)_100m.zip
  ├─ 2024년_인구_다사_100M.csv
  ├─ 2024년_인구_다라_100M.csv
  └─ ...
```

통계 CSV는 headerless 4-column 구조다.

```text
reference_year,native_grid_id,statistic_code,value
```

예:

```text
2024,다사000395,to_in_001,5
```

SGIS 이용매뉴얼 기준:

```text
to_in_001 = 총인구
to_in_007 = 남자 총인구
to_in_008 = 여자 총인구
```

따라서 MVP의 총인구 join은:

```text
Grid DBF GRID_CD
       =
CSV column 2 native_grid_id

STAT_CD = to_in_001
```

으로 수행한다.

---

## 5. 최초 End-to-End extractor

추가 스크립트:

```text
scripts/extract-sgis-region-grid.py
```

호출 예:

```powershell
python scripts\extract-sgis-region-grid.py `
  "..\SGIS" `
  --sido "경기도" `
  --sigungu "안양시 동안구" `
  --dong "부림동" `
  --boundary-year 2025 `
  --grid-year 2025 `
  --stat-year 2024 `
  --grid-size 100 `
  --indicator to_in_001 `
  --out-dir "data\derived\sgis\burim"
```

동작:

```text
1. 시도 DBF에서 경기도 native code 확인
2. 해당 시도 안에서 안양시 동안구 SIGUNGU_CD 확인
3. 같은 SIGUNGU_CD prefix 안에서 부림동 ADM_CD 확인
4. 부림동 polygon 로드
5. bbox 기준 필요한 100m Grid partition만 선택
6. 실제 polygon과 교차하는 100m cell 추출
7. GRID_CD로 2024 population CSV join
8. CSV 출력
9. EPSG:5179 → EPSG:4326 변환 GeoJSON 출력
10. source/year/code/selection rule Manifest 출력
```

---

## 6. 결측값 정책

SGIS 매뉴얼에서는 인구 또는 사업체가 없는 격자의 통계 row가 생성되지 않을 수 있으며 분석 시 0으로 채우는 예시를 제공한다.

그러나 Atlas normalized raw output에서는 우선 다음처럼 보존한다.

```text
explicit row 있음
→ population_status = explicit-row

통계 row 없음
→ population_total = null
→ population_status = no-stat-row
```

분석 Recipe 단계에서 필요할 때만 `no-stat-row → 0` 변환을 명시적으로 적용한다.

---

## 7. 경계셀 주의

MVP grid 선택 규칙은:

```text
행정동 polygon과 geometry가 intersect하는 모든 100m grid
```

이다.

따라서 경계부 100m cell은 일부 면적만 행정동 안에 들어올 수 있다. 이 grid 값을 그대로 합한 값은 **공식 행정동 인구 총계와 동일하다고 해석하지 않는다.**

Atlas에서는:

```text
Region → Grid extraction
```

과

```text
official admin-dong aggregate statistics
```

를 서로 다른 데이터 상품으로 유지한다.

---

## 8. 전국 확장 규칙

안양 전용 코드를 만들지 않는다.

```text
Region selector
→ SIDO_CD
→ SIGUNGU_CD
→ ADM_CD
→ region bbox
→ intersecting raw grid partition(s)
→ feature-level spatial filter
→ partition-matched statistic CSV
→ native GRID_CD join
→ standard Atlas output
```

경계에 걸친 행정동은 둘 이상의 100km partition을 동시에 읽을 수 있어야 하며 결과 Grid ID로 중복 제거한다.

---

## 9. 다음 성공조건

이번 단계의 Done 기준:

```text
[ ] 경기도 → 안양시 동안구 → 부림동이 하나의 ADM_CD로 resolve
[ ] 다사 100m partition 자동 선택
[ ] 부림동과 교차하는 실제 GRID_CD 목록 생성
[ ] to_in_001 population join 성공
[ ] CSV 생성
[ ] WGS84 GeoJSON 생성
[ ] extraction manifest 생성
[ ] 출력 Grid count / join count 기록
```

성공 후 같은 extractor를 다른 행정동 하나에 재실행해 하드코딩 여부를 검증한 뒤 시군구 → 시도 → 전국 batch로 확장한다.
