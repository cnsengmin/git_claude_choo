# sgis-oa

2025 집계구 경계 위 인구총조사 인구(2015·2020·2024)를 벡터 타일로 줍니다.

- 경로: `GET /api/layers/sgis-oa/oa/<z>/<x>/<y>.pbf`(z10–14), `GET /api/layers/sgis-oa/oa/metadata`.
- 레이어: `people/population-oa`. 인구밀도(명/㎢)로 칠하고, 사이드바에서 연도를 고릅니다. 집계구는 인구가 비슷하게 나뉘도록 만든 단위라서, 인구수보다 밀도가 지역 차이를 잘 보여 줍니다.
- 자료: GitHub Release `oa-population-20261029`의 `kr-oa-population.pmtiles`.
  - `scripts/region_registry/build_release_oa_pmtiles.py`가 `data/raw/sgis/oa-2025`에서 만듭니다. 원자료 기록은 `data/manifests/sgis-oa-2025.json`입니다.
  - 속성: `oa_cd`, `emd_cd`, `adm_nm`, `sgg_nm`, `sido_nm`, `p<연도>`(인구), `dn<연도>`(집계구 면적 기준 밀도).
- N/A: 값을 비워 두고 회색으로 칠합니다. 0으로 바꾸지 않습니다.
  - 2024년 N/A는 거주자가 없다는 뜻입니다.
  - 2015·2020년 N/A에는 작은 값을 가린 칸도 섞여 있습니다. 그래서 집계구 합이 읍면동 총계보다 2015년 2,706명, 2020년 1,027명 적습니다.
- 집계구 합은 빌드할 때 원자료 기록과 대조합니다. 2015년 51,066,669명, 2020년 51,828,109명, 2024년 51,805,547명이며, 2024년 값은 KOSIS 총계와도 같습니다.
- 라이선스: 공공누리 제1유형(출처표시). 출처: 통계청 SGIS 집계구 경계·인구총조사.
- 읽는 방식은 `region-layers`와 같습니다(`layers/providers/pmtiles.ts`). 개발할 때는 `OA_POPULATION_PMTILES_DIR`(예: `dist/oa-population`)로 로컬 파일을 읽습니다.

100m 격자 인구(`people/population-100m`)는 SGIS 격자 원자료를 받으면 같은 방식(PMTiles → Release → provider)으로 붙입니다.

## 확인
`node scripts/layers/check-live.mjs http://localhost:3000 sgis-oa`

2026-10-29 기준:
- **실시간 검사:** 3건 통과(메타데이터, 부림동 z13 타일, 서울 z10 타일).
- **타일 누락 검사:** 서울 도심에서 z12 이상은 원본 집계구가 전부 들어 있습니다. z10은 17,489개 중 17,483개입니다. 빠진 6개는 타일 경계에 11㎡ 이하로만 걸친 집계구라서 옆 타일에 그려집니다.
- **지도:** 부림동 31042580010001을 누르면 연도마다 원자료와 같은 값이 나옵니다.
  - 2015년: 값 없음(N/A).
  - 2020년: 2,192명, 115,554명/㎢.
  - 2024년: 2,101명, 110,757명/㎢.
- 인구 연도를 바꾸면 칠하는 속성이 `dn2015`·`dn2020`·`dn2024`로 바뀝니다.
