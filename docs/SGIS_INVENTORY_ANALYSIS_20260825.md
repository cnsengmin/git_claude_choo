# Atlas KR — SGIS 실제 패키지 Inventory 분석 (2026-08-25)

## 목적

사용자가 로컬 `SGIS/` 폴더에 받은 전국 SGIS 원자료를 직접 GitHub에 올리지 않고, `sgis-local-inventory-20260824.json`으로 내부 ZIP 구조만 catalogued 상태에서 분석한 결과를 기록한다.

이 문서는 추정이 아니라 **실제 생성된 inventory manifest**를 기준으로 작성한다.

---

## 1. 전체 규모

```text
총 ZIP archive 수: 43
총 raw size: 1,593,066,058 bytes
fast inventory: true
```

패키지 family 분류:

```text
administrative-boundary        9
basic-unit-boundary            1
census-output-area-boundary    1
grid-boundary-partition       28
grid-statistics                3
urbanized-area-boundary        1
```

Grid statistics 3개 중:

```text
population  1
business    2
```

즉 현재 MVP에 필요한 행정경계 + 100m 인구 + 격자경계 자산은 모두 로컬 SGIS 폴더 안에 존재한다.

---

## 2. 2025 행정읍면동 경계 실제 구조

확인된 ZIP:

```text
2025년 센서스용 행정구역경계(읍면동).zip
```

내부 SHP stem:

```text
bnd_dong_00_2025_2Q
```

구성:

```text
.cpg
.dbf
.prj
.shp
.shx
```

CPG:

```text
UTF-8
```

PRJ는 `Korea_2000_Korea_Unified_Coordinate_System`이며 다음 파라미터를 가진다.

```text
Central_Meridian 127.5
False_Easting    1000000
False_Northing   2000000
Latitude_Origin  38
Scale_Factor     0.9996
GRS80
```

Atlas에서는 이를 기존 분석 CRS 정책과 일치하는 **EPSG:5179 후보**로 보고, shapefile metadata pass에서 최종 확정한다.

---

## 3. 2024 100m 인구통계 실제 구조

확인된 ZIP:

```text
24년 격자통계(인구)_100m.zip
```

ZIP 안에 전국을 하나의 CSV로 넣지 않고 공간 partition별 CSV를 여러 개 포함한다.

예:

```text
2024년_인구_가사_100M.csv
2024년_인구_나나_100M.csv
2024년_인구_나다_100M.csv
2024년_인구_나라_100M.csv
...
2024년_인구_다라_100M.csv
2024년_인구_다마_100M.csv
...
```

대부분 CP949로 정상 preview 된다.

실제 row 형태:

```text
2024,가사477991,to_in_001,5
2024,가사477991,to_in_007,0
2024,가사477991,to_in_008,5
```

따라서 현재 실제 schema 후보는:

```text
reference_year
native_grid_id
indicator_code
value
```

이다.

Header row가 보이지 않으므로 **headerless CSV**로 처리하는 것이 현재 가장 안전하다.

Native grid ID 예:

```text
가사477991
나나755780
다라000177
다마000000
```

즉 grid ID 자체에 partition prefix가 포함되어 있다.

---

## 4. 2025 격자경계 실제 배포구조

Inventory에서 다음 계열의 ZIP이 28개 확인됐다.

```text
_grid_border_grid_2025_grid_<partition>_...
```

따라서 전국 격자경계는 하나의 거대한 SHP가 아니라 **partitioned SHP archive family**로 배포되는 구조다.

Atlas는 이를 하나의 logical layer로 보되 raw ingestion은 partition 단위로 처리한다.

```text
SGIS raw grid partition
      ↓
partition manifest
      ↓
native_grid_id 보존
      ↓
normalized GridStore
      ↓
logical layer = population.grid-100m.total
```

원본 partition 파일을 합친 뒤 ID를 새로 생성하지 않는다.

---

## 5. 매우 중요한 join 단서

인구 CSV의 grid ID prefix와 grid-boundary ZIP 이름의 partition prefix가 같은 naming family를 사용한다.

예:

```text
population CSV
2024년_인구_다라_100M.csv
rows: 다라000177 ...

boundary family
_grid_border_grid_2025_grid_다라_...
```

따라서 다음 join 전략을 검증한다.

```text
partition prefix
  ↓
같은 partition geometry만 로드
  ↓
native_grid_id equality join
```

이는 전국 100m SHP 전체를 메모리에 올리지 않고도 지역별 추출이 가능한 핵심 구조다.

단, 실제 DBF grid-code field와 CSV native_grid_id 값이 완전히 동일한지는 다음 metadata/schema pass에서 반드시 확인한다.

---

## 6. 버전 정책

현재 자료는 다음처럼 기준연도가 다르다.

```text
administrative boundary : 2025 Q2 / 2025-06-30
100m grid boundary      : 2025
100m population         : 2024
```

Atlas에서는 이 차이를 오류로 보지 않고 독립 metadata로 유지한다.

```text
boundary_reference_date
statistics_reference_year
grid_system_version
```

세 값을 강제로 같게 만들지 않는다.

---

## 7. 발견된 encoding edge case

대부분 population CSV는 CP949 preview가 정상인데 일부 partition은 현재 lightweight preview에서 encoding을 확정하지 못한 사례가 있다.

따라서 parser는:

```text
UTF-8 BOM
→ CP949
→ EUC-KR
→ UTF-8
→ failure manifest
```

같은 fallback 구조를 유지하며 한 partition 실패 때문에 전체 batch를 중단하지 않는다.

---

## 8. 다음 실제 작업

다음 단계는 raw 전체를 변환하지 않고 먼저 `부림동`을 기준으로 필요한 partition을 자동 선별한다.

새 inspection script:

```text
scripts/inspect-sgis-shapefile-schema.py
```

이 스크립트는 ZIP을 풀지 않고:

```text
SHP global bbox
DBF field schema
DBF row count
PRJ / CPG
특정 DBF text match
matched region feature bbox
region bbox와 겹치는 grid partition 후보
```

를 만든다.

로컬 실행 예정:

```powershell
python scripts\inspect-sgis-shapefile-schema.py `
  "..\SGIS" `
  --match "부림동" `
  --out "data\manifests\sgis-schema-burim-20260825.json"
```

로컬 repo가 `atlas-code`이고 raw 폴더가 sibling `SGIS`이므로 실행 위치에 따라 상대경로를 정확히 유지한다.

---

## 9. MVP 다음 성공조건

```text
부림동 DBF record 확인
→ 부림동 feature bbox
→ 겹치는 100m grid partition 선별
→ 해당 grid DBF native ID 확인
→ 해당 2024 population CSV 선택
→ native_grid_id join
→ 부림동 polygon spatial filter
→ CSV / GeoJSON
```

여기까지 성공하면 Atlas KR의 첫 실제 Region → Grid → Statistic extraction chain이 성립한다.
