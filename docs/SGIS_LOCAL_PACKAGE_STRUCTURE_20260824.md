# Atlas KR — SGIS 로컬 다운로드 패키지 구조 (2026-08-24)

## 목적

SGIS에서 내려받은 다수의 ZIP을 Atlas KR MVP에 연결하기 전에, 파일명 수준에서 보이는 패키지 계열을 먼저 분류한다.

이 문서는 사용자가 제공한 Windows Explorer 화면에서 확인 가능한 **패키지명만을 근거**로 작성한다. ZIP 내부의 SHP/DBF/CSV 필드와 CRS는 아직 확정하지 않는다.

---

## 1. 관찰된 패키지 계열

### A. 센서스용 행정구역경계

화면에서 다음 패키지를 확인했다.

```text
24년 센서스용 행정구역경계(시도)
24년 센서스용 행정구역경계(시군구)
24년 센서스용 행정구역경계(읍면동)
24년 센서스용 행정구역경계(전체)

25년 센서스용 행정구역경계(시도)
25년 센서스용 행정구역경계(시군구)
25년 센서스용 행정구역경계(읍면동)
25년 센서스용 행정구역경계(전체)
```

또한 다음 이름도 별도로 보인다.

```text
2025년 센서스용 행정구역경계(읍면동)
```

따라서 2025 읍면동 경계는 **중복 다운로드 후보**이거나, 배포 경로/패키지 버전이 다른 파일일 수 있다. 실제 archive hash와 내부 파일명을 비교하기 전에는 동일 파일로 단정하지 않는다.

Atlas Layer mapping 후보:

```text
시도   → region.sido.boundary
시군구 → region.sigungu.boundary
읍면동 → region.admin-dong.boundary
전체   → 위 세 레벨을 포함하는 bundle 후보
```

---

### B. 기타 통계지역경계

```text
25년 도시화지역
25년 집계구경계
2025년 기초단위구
```

이 자료는 첫 MVP의 필수 레이어는 아니지만 향후 공간분석 레이어로 유용하다.

잠정 역할:

```text
도시화지역   → urban form / settlement reference
집계구경계   → census output-area reference
기초단위구   → small-area base unit reference
```

첫 Region → 100m Population MVP가 끝난 뒤 Layer Registry 확대 후보로 둔다.

---

### C. 100m 격자 인구 통계

화면에서 다음 패키지를 확인했다.

```text
24년 격자통계(인구)_100m
```

첫 MVP의 핵심 통계 패키지다.

잠정 Atlas mapping:

```text
population.grid-100m.total
reference year = 2024
spatial level = grid-100m
```

실제 CSV/TXT 내부에서 다음을 확인해야 한다.

```text
native grid ID field
population value field
no-data / suppression value
encoding
row count
```

---

### D. 1km 사업체 종류별 격자통계

```text
SGIS 격자통계 사업체 종류별_1k
```

첫 MVP에는 필요하지 않지만, 100m 인구 파이프라인이 성공한 뒤 사업체/고용 계열 확장에 사용할 수 있다.

---

### E. 2025 격자경계 분할 패키지

다수의 패키지가 다음 패턴으로 보인다.

```text
_grid_border_grid_2025_grid_<partition>_grid_<partition>
```

예시 화면에는 `가사`, `나나`, `나다`, `나라`, `나마`, `나바`, `나사`, `다나`, `다다`, `다라`, `다마`, `다바`, `다사`, `라마`, `라바`, `라사`, `라아`, `마라`, `마마`, `마바`, `마사`, `마아`, `바사`, `사사` 등의 분할명이 보인다.

이 파일들은 전국 격자경계를 한 개 ZIP으로 제공하지 않고 **공간 partition 단위로 나눈 패키지**일 가능성이 높다.

중요:

- partition 이름을 행정구역 코드로 해석하지 않는다.
- 실제 grid native ID / bbox / SHP geometry를 검사한 뒤 partition index를 만든다.
- MVP에서는 안양을 포함하는 partition만 먼저 식별해 처리할 수 있다.

전국 확장 시 권장 구조:

```text
Grid Boundary Snapshot 2025
├─ partition A
├─ partition B
├─ ...
└─ partition N
      ↓
partition manifest
      ↓
normalized grid store
```

---

## 2. 현재 예상 데이터 구성

화면에서 보이는 구조만 기준으로 하면 다운로드 폴더는 대략 다음 계열로 나뉜다.

```text
SGIS/
├─ administrative-boundary 2024
├─ administrative-boundary 2025
├─ urbanized-area 2025
├─ census-output-area boundary 2025
├─ basic-unit boundary 2025
├─ grid boundary 2025 (many partitions)
├─ population grid statistics 2024 / 100m
└─ business-by-type grid statistics / 1km
```

이 중 첫 MVP에 직접 필요한 자료는 다음 세 계열이다.

```text
2025 administrative boundary
2025 grid boundary partitions
2024 population 100m
```

---

## 3. 다음 자동 검사

`scripts/inspect-sgis-package.py`는 파일명만으로 다음 family를 1차 분류하도록 확장했다.

```text
administrative-boundary
census-output-area-boundary
basic-unit-boundary
urbanized-area-boundary
grid-boundary-partition
grid-statistics
unclassified
```

분류 결과는 추정치이며 실제 archive 내부 검증 전까지 authoritative하지 않다.

권장 실행:

```powershell
python scripts\inspect-sgis-package.py `
  ".\SGIS" `
  --fast `
  --out data\manifests\sgis-local-inventory-20260824.json
```

실행 후 생성되는 JSON에는 다음이 포함된다.

```text
archive count
total size
family counts
filename classification
ZIP member inventory
SHP component groups
PRJ / CPG text
CSV/TXT preview
```

---

## 4. Inventory 이후 MVP 처리 순서

```text
inventory JSON
  ↓
2025 읍면동/시군구/시도 패키지 확인
  ↓
2025 grid partition 목록 확인
  ↓
안양 포함 partition 식별
  ↓
2024 population 100m join key 확인
  ↓
부림동 polygon ↔ 100m grid spatial filter
  ↓
CSV / GeoJSON
  ↓
GeoPackage / QGIS
```

---

## 5. 주의사항

- 화면상의 ZIP명만으로 내부 데이터가 동일하다고 단정하지 않는다.
- `전체` 경계 ZIP이 개별 시도/시군구/읍면동 ZIP을 그대로 포함하는지 확인한다.
- 2025 읍면동 경계로 보이는 중복 패키지는 hash 비교 후 하나를 canonical source로 정한다.
- 전국 grid boundary partition은 모두 runtime에 직접 로드하지 않고, 정규화 후 partition/cache 전략을 사용한다.
- 원본 ZIP은 public code repository에 누적하지 않는다.
