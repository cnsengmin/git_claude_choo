# Atlas KR — Raw Data Storage Policy

## 목적

Atlas KR은 전국 단위 SHP/CSV/ZIP/GeoTIFF를 반복적으로 다루게 된다. 원자료가 많아질수록 **코드 저장소와 데이터 저장소를 분리**해야 Git history, CI, Vercel 배포, 라이선스 관리가 안정적이다.

이 문서는 SGIS를 시작으로 VWorld, 공공데이터포털, 위성자료 등 대용량 원자료를 어디에 두고 어떤 정보만 코드 저장소에 남길지 규칙을 고정한다.

---

## 1. 기본 원칙

현재 `cnsengmin/git_claude_choo`는 Atlas KR 코드/문서/Manifest 저장소로 사용한다.

```text
PUBLIC CODE REPO
├─ app / lib / scripts
├─ docs
├─ data/manifests
└─ 작은 테스트 fixture

RAW DATA STORAGE
├─ provider 원본 ZIP
├─ SHP 구성파일
├─ 대용량 CSV/TXT
├─ GeoTIFF
└─ 중간 batch artifact
```

원본 ZIP을 현재 공개 코드 저장소에 직접 누적하지 않는다.

이유:

- Git history가 빠르게 커짐
- clone/CI/Vercel 작업이 불필요하게 무거워짐
- 동일 데이터의 새 연도 파일이 계속 누적됨
- 공급자별 재배포 조건이 다름
- 일부 자료는 로그인/신청 후 취득한 파일이라 공개 mirror 가능 여부를 별도 확인해야 함

---

## 2. GitHub를 사용할 때 권장 구조

GitHub에서 원자료를 관리하고 싶다면 **별도 private data repository**를 권장한다.

예:

```text
atlas-kr-data-private/
  raw/
    sgis/
      administrative-boundary/
        2025Q2/
      grid-boundary/
        2025-100m/
      grid-statistics/
        2024-population-100m/
    vworld/
    data-go-kr/
  receipts/
  manifests/
```

대용량 binary는 일반 Git보다 Git LFS를 우선 검토한다.

현재 GitHub 문서 기준 일반 Git object는 100 MiB를 초과하면 차단되고, large binary에는 Git LFS 또는 외부/object storage 사용이 권장된다. Git LFS 한도는 계정 플랜에 따라 다르므로 업로드 전에 확인한다.

---

## 3. 공개/비공개 정책

### 공개 코드 저장소에 넣어도 되는 것

```text
source call playbook
request UI selections
source page URL / acquisition route
archive filename
archive SHA-256
reference date/year
member filenames
field/schema inventory
CRS / encoding findings
feature/row counts
normalization manifest
processing code
small non-sensitive test fixture
```

### 공개 저장소에 바로 넣지 않는 것

```text
provider raw ZIP
full national SHP
full national microdata
large GeoTIFF
MDIS unit-record data
redistribution terms not yet verified data
API keys / tokens / login session data
```

---

## 4. Raw Package Receipt

원자료 하나마다 코드 저장소의 `data/manifests/`에 receipt를 남긴다.

```json
{
  "source_id": "sgis",
  "dataset": "grid-population-100m",
  "reference_year": 2024,
  "acquired_at": "YYYY-MM-DDTHH:mm:ssZ",
  "storage": {
    "kind": "private-github-lfs",
    "repository": "<owner>/<data-repo>",
    "path": "raw/sgis/grid-statistics/2024-population-100m/<original.zip>"
  },
  "original_filename": "<original.zip>",
  "sha256": "...",
  "license_status": "needs-review",
  "inventory_manifest": "..."
}
```

Atlas runtime은 저장 위치 문자열에 직접 의존하지 않는다. ingest 단계가 raw artifact를 읽고 normalized artifact를 생성한 뒤 runtime Store는 normalized 결과를 사용한다.

---

## 5. SGIS MVP의 저장 흐름

```text
SGIS 신청/다운로드
      ↓
private raw storage
      ↓
inspect-sgis-package.py
      ↓
package inventory + SHA-256
      ↓
data/manifests receipt commit
      ↓
SHP/CSV schema 검사
      ↓
Anyang/Burim small-area validation
      ↓
normalized GeoJSON/GeoParquet/GeoPackage
      ↓
RegionStore / GridStore
```

원자료가 전국 단위여도 첫 분석은 안양/부림동 subset부터 시행한다.

---

## 6. 내가 GitHub에서 확인할 때의 흐름

별도 data repository를 GitHub 연결 범위에 두면 다음 정보를 먼저 확인한다.

```text
repository tree
→ file naming/grouping
→ year/provider folders
→ raw package inventory
→ receipt/manifest consistency
→ 필요한 package만 선택
→ 실제 parsing/normalization
```

단, GitHub의 일반 소스 브라우징은 대용량 ZIP 내부를 분석하는 도구가 아니므로 실제 binary content 검사가 필요한 경우 해당 파일을 작업환경으로 가져와 `inspect-sgis-package.py` 및 공간도구로 검사한다.

즉 GitHub는 **데이터 카탈로그와 버전 위치를 관리하는 곳**, ingest script는 **내용을 분석하는 곳**으로 역할을 나눈다.

---

## 7. 전국 확장 규칙

새 연도 자료가 나오면 기존 raw package를 overwrite하지 않는다.

```text
provider / dataset / reference-version / original-file
```

구조로 추가하고 새 receipt를 만든다.

예:

```text
sgis/
  administrative-boundary/
    2025Q2/
    2026Q2/
```

Atlas에서 `latest`는 별도 alias/metadata로 결정하고 실제 snapshot ID를 삭제하거나 대체하지 않는다.

---

## 8. 현재 결정

Atlas KR MVP에서 SGIS ZIP이 다수 생성되는 경우:

1. 현재 공개 코드 저장소에는 ZIP을 직접 누적하지 않는다.
2. 별도 private GitHub data repo + Git LFS를 우선 후보로 한다.
3. 원자료별 manifest/receipt는 현재 코드 repo에 남긴다.
4. 재배포 조건 확인 전 private 상태를 유지한다.
5. 파일이 준비되면 SGIS 경계 → 100m grid → 인구 순으로 실제 ingest를 진행한다.

관련 문서:

```text
data/raw/README.md
docs/SGIS_DOWNLOAD_SELECTIONS_20260824.md
docs/SGIS_SHP_ACQUISITION_20260824.md
docs/MVP_TO_NATIONAL_PLAYBOOK.md
docs/SOURCE_CALL_PLAYBOOK.md
```
