# Atlas KR — Implementation Log

이 문서는 중요한 개발 사이클마다 **작은 범위 검증 → 전국 확장 메모**를 남기기 위한 누적 로그다.

기록 형식:

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

---

## 2026-08-24 — KIK Region Registry foundation

**Goal**  
KIK current snapshot을 Atlas Region Registry의 기반으로 사용한다.

**Input/source**  
`KIKcd_H / KIKcd_B / KIKmix 20260720`

**Small-area test**  
경기도 → 안양시 → 동안구 → 부림동

**Implementation**

- fixed-width KIK parser
- national ingestion script
- administrative/legal code separation
- admin ↔ legal KIKmix relation
- cascading Region Picker
- RegionStore interface

**Validation**

- raw fixed-width 파일과 XLSX row equality 검증
- native 10-digit code를 string으로 보존
- CI typecheck/build 통과

**Failure / edge cases**

- 단순 numeric-prefix 기반 부모 추론은 안전하지 않음
- 특수 출장소/중간 계층은 명칭 의미와 코드 관계를 함께 검증해야 함
- KIK current snapshot은 geometry를 포함하지 않음

**National expansion note**

- UI와 `/api/regions`는 RegionStore 계약만 사용
- 안양 fixture는 `Anyang Region Code Fixture`로 간주하며 geometry fixture로 사용하지 않음
- 전국 generated registry 또는 DB adapter로 교체 가능해야 함

**Next**

- boundary layer model
- actual boundary geometry
- SGIS 100m grid

---

## 2026-08-24 — Boundary layers separated from analysis unit

**Goal**  
시도·시군구·행정읍면동·법정동 경계를 분석 단위와 독립적인 참조 레이어로 모델링한다.

**Input/source**

- existing Layer Registry
- KIK code/crosswalk model
- candidate SGIS / VWorld / data.go.kr boundary providers

**Small-area test**

안양시/동안구/부림동을 기준으로, 향후 100m grid 분석에서도 상위 행정경계를 함께 패키징할 수 있는 구조를 검증한다.

**Implementation**

- `AtlasLayerRole = analysis | reference`
- `region.sido.boundary`
- `region.sigungu.boundary`
- `region.admin-dong.boundary`
- `region.legal-dong.boundary`
- Catalog에서 reference boundary는 분석 단위와 관계없이 선택 가능
- Export Plan에서 reference boundary를 분석 단위로 재명명하지 않음
- `docs/BOUNDARY_LAYER_MODEL.md` 추가

**Validation**

- 각 boundary는 독립 `spatialLevels`를 유지
- 분석단위가 grid여도 boundary catalog 선택 가능
- export metadata는 original boundary level을 유지

**Failure / edge cases**

- KIK code snapshot과 polygon snapshot은 동일 자료가 아님
- 법정동 boundary의 exact authoritative extractable provider는 아직 runtime 검증 필요
- WMS display 가능 여부와 export 가능한 feature endpoint는 구분해야 함

**National expansion note**

```text
source raw boundary
→ source-specific ingest
→ boundary manifest
→ normalized geometry artifact
→ BoundaryStore
→ same Catalog / Export contract
→ national batch
```

지역별 하드코딩 함수 대신 범용 Store/Adapter를 사용한다.

**Next**

1. 실제 boundary source/파일 검증
2. 안양 1개 행정동 polygon join
3. SGIS 100m boundary + population 통계
4. Region → Grid extraction
