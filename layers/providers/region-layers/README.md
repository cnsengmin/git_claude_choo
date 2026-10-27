# region-layers

시점별 행정경계(2008–2025 연말, 2026-10-01)를 벡터 타일로 줍니다. 경계와 코드는 지역 레지스트리 레이어 `kr-{lgu|sgg|admdong}@날짜`와 같습니다.

- 경로
  - `GET /api/layers/region-layers/<수준>/<z>/<x>/<y>.pbf`: 타일 한 장. 없는 타일은 204입니다.
  - `GET /api/layers/region-layers/<수준>/metadata`: 확대 단계, 범위, 타일 속성.
  - 수준은 `lgu`, `sgg`, `admdong`입니다.
- 레이어: `boundaries/admin-lgu`, `boundaries/admin-sgg`, `boundaries/admin-dong`.
- 자료: GitHub Release `region-layers-20261027`의 `kr-region-layers-{lgu,sgg,admdong}.pmtiles`.
  - `scripts/region_registry/build_release_pmtiles.py`가 Release용 GeoPackage에서 만듭니다.
  - 크기와 해시는 Release의 `manifest.json` `tiles`에 있습니다.
- 시점: 지역마다 속한 시점 표시(`d2008`…`d2025`, `d202610`)가 1입니다. 지도는 고른 시점으로 걸러 그립니다(`dates.ts`).
- 라이선스: CC BY 4.0. 출처는 통계청 SGIS 경계(공공누리 제1유형), 가공 vuski/admdongkor, 단위·코드 행정안전부입니다.

## 읽는 곳
Release 파일은 CORS 헤더가 없어서 브라우저가 직접 읽지 못합니다. 이 provider가 서버에서 필요한 구간만 읽어(HTTP Range) 타일을 돌려줍니다. 타일은 Release와 함께 바뀌지 않으므로 CDN에 길게 캐시합니다.

| 환경변수 | 뜻 |
|---|---|
| `REGION_LAYERS_PMTILES_DIR` | 로컬 폴더에서 읽습니다. 개발할 때 `dist/region-layers`를 씁니다 |
| `REGION_LAYERS_PMTILES_URL` | Release 대신 쓸 주소입니다. Range 요청을 지원해야 합니다 |

둘 다 없으면 Release 주소를 씁니다.

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
