# region-layers

시점별 행정경계(2008–2025 연말, 2026-10-01)를 벡터 타일로 줍니다. 경계와 코드는 지역 레지스트리 레이어 `kr-{lgu|sgg|admdong}@날짜`와 같습니다.

- 경로
  - `GET /api/layers/region-layers/<수준>/<z>/<x>/<y>.pbf`: 타일 한 장. 없는 타일은 204입니다.
  - `GET /api/layers/region-layers/<수준>/metadata`: 확대 단계, 범위, 타일 속성.
  - 수준은 `sido`, `lgu`, `sgg`, `admdong`입니다. `sido`는 기초 단위를 시점마다 행안부 시도 코드로 합친 것입니다.
- 레이어: `boundaries/admin-sido`, `boundaries/admin-lgu`, `boundaries/admin-sgg`, `boundaries/admin-dong`.
- 자료: GitHub Release `region-layers-20261027`의 `kr-region-layers-{sido,lgu,sgg,admdong}.pmtiles`.
  - `scripts/region_registry/build_release_pmtiles.py`가 Release용 GeoPackage에서 만듭니다.
  - 크기와 해시는 Release의 `manifest.json` `tiles`에 있습니다.
- 시점: 지역마다 속한 시점 표시(`d2008`…`d2025`, `d202610`)가 1입니다. 지도는 고른 시점으로 걸러 그립니다(`dates.ts`).
- 라이선스: CC BY 4.0. 출처는 통계청 SGIS 경계(공공누리 제1유형), 가공 vuski/admdongkor, 단위·코드 행정안전부입니다.

## 읽는 곳
Release 파일은 CORS 헤더가 없어서 브라우저가 직접 읽지 못합니다. 서버가 필요한 구간만 읽어(HTTP Range) 타일을 돌려줍니다. 이 읽기 코드는 공용 모듈 `layers/providers/pmtiles.ts`에 있습니다. 타일은 Release와 함께 바뀌지 않으므로 CDN에 길게 캐시합니다.

개발할 때는 `REGION_LAYERS_PMTILES_DIR`(예: `dist/region-layers`)를 주면 Release 대신 로컬 파일을 읽습니다.

## 확인
`node scripts/layers/check-live.mjs http://localhost:3000 region-layers`

2026-10-27 기준:
- **로컬 파일:** 실시간 검사 4건이 통과했습니다(시군구 메타데이터, 시군구 z10 타일의 종로구 코드, 기초 단위 부천시, 행정동 부림동).
- **Release에서 읽기:** 같은 타일 3장이 로컬 파일과 바이트 단위로 같았습니다. 처음 읽을 때는 헤더와 디렉터리까지 읽어서 장당 0.8–1.5초가 걸립니다.
- **지도:** 시점을 바꾸면 다음 변화가 그대로 보입니다.
  - 부천: 2015 일반구 3개, 2016–2023 부천시, 2024 일반구 3개.
  - 세종: 2011 연기군, 2012 세종특별자치시.
  - 청원군: 2014년부터 사라짐.
  - 인천: 2025 중구·동구·서구, 2026-10-01 영종구·제물포구·검단구.
- **저배율 타일 누락 (2026-10-28):** 서울을 덮는 타일에서 원본 지역 수와 대조했고, 기초 단위 z4–7, 시군구 z5–6, 행정동 z8–10이 모두 같습니다(2008·2025 시점).
  - 10-27 빌드는 같은 대조에서 행정동 z8이 1,323개 중 731개를 빠뜨렸습니다. GDAL이 크기·단순화 옵션을 무시했기 때문입니다.
  - Release 파일은 10-28 빌드로 교체했습니다.
