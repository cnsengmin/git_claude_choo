# 시군구 단년도 시제공 2025 — 수집·빌드·검증

2025-12-31 행정구역 기준 **229개 단위**(자치구·시·군 226 + 제주 행정시 2 + 세종)에 최근 1개 연도 KOSIS 통계를 붙인 표를 만든다.
산출물 설명은 [`data/derived/sgg2025/README.md`](../../data/derived/sgg2025/README.md).

## 실행 순서

```bash
pip install -r scripts/sgg2025/requirements.txt
python scripts/sgg2025/fetch_sgis_boundary.py --year 2025 --level sgg   # SGIS 2025 시군구 경계(통계청 코드)
python scripts/sgg2025/collect_kosis.py                                  # KOSIS 원자료 + 분류 메타
python scripts/sgg2025/build_code_map.py                                 # 기준 229개 + 코드 대응표
python scripts/sgg2025/build_table.py                                    # 표·코드북·전국 합계 대조
python scripts/sgg2025/validate.py                                       # 검증 31개 항목
```

- 키: `KOSIS_API_KEY`, `SGIS_CONSUMER_KEY`, `SGIS_CONSUMER_SECRET`를 환경변수 → `.env.local` → 저장소 밖 키 파일 순으로 찾는다. 키 파일 위치는 `--keyfile 경로` 또는 `.env.local`(gitignore)의 `ATLAS_KEYFILE=경로`로 준다. 현재 `.env.local`에는 키 값 없이 이 위치만 들어 있다. 키와 SGIS 토큰은 출력·로그·manifest에 남기지 않으며 `validate.py --keyfile`이 산출물 전체에서 키 문자열을 검사한다.
- 원자료(`data/raw/…`)는 gitignore 대상이다. 저장소에는 요청 파라미터·행 수·SHA-256을 담은 receipt(`data/manifests/kosis-sgg2025-fetch.json`, `sgis-boundary-sgg-2025.json`)만 남긴다.
- 기준 경계 입력은 `data/raw/packages/kr-sgg-crosswalk_v0.2/boundaries/sgg_base20251231.gpkg`(행안부 코드 252개)다.

## 코드 대응 원칙 — 앞자리 자르기 금지

KOSIS 안에서도 표마다 지역 코드 체계가 다르다.

| `code_system` | 예 | 쓰는 표 |
|---|---|---|
| `MOIS5` 행정안전부 5자리 | 11215 광진구, 41111 수원시장안구 | 주민등록인구·세대, 국내인구이동 |
| `KOSTAT5` 통계청 5자리 | 11050 광진구, 31011 장안구 | 인구동향(출생·사망), 등록센서스 |
| `KOSTAT7_2026` 7자리 | 1236010 목포시 | 2026-07 이후 갱신된 e-지방지표(사업체), 광주·전남만 |
| `LFS4` 지역별고용조사 4자리 | 3731 "대구 군위군" | 지역별고용조사 |

`data/derived/region-codes/sgg_code_map_20251231.csv`가 데이터에 실제로 나온 모든 코드를 한 행씩 기준 단위(`lgu_code`)에 붙인다. `method` 열이 근거다.

- `kostat_mois_polygon_overlap+name`: SGIS 2025 경계(통계청 코드)와 기준 경계(행안부 코드)를 겹쳐 서로 최대 겹침 + 이름 일치 + 겹침 0.75 이상. 252쌍 모두 1:1. 겹침이 가장 낮은 곳은 신안군 0.79(섬 작도 차이), 2순위 겹침은 최대 0.15.
- `city_of_general_gu_by_name` / `general_gu_name_then_containment`: 일반구의 소속 시는 이름("수원시장안구")으로 정하고 경계 포함(99% 이상)으로 확인. 시 코드는 같은 체계·같은 시점 코드 목록에서 (시도, 시 이름)으로 찾음.
- `name_match_*`: 지역별고용조사·7자리 코드는 이름으로. 이름이 겹치는 고성군(강원·경남)은 고용조사 목록의 도 블록으로 가리고, `validate.py`가 맞바꾼 경우보다 인구 비율이 1에 가까운지 확인.
- `single_tier_sido_row`: 세종처럼 표가 시도 행만 줄 때, 기준 단위가 하나뿐인 시도에 한해 그 값을 씀.
- 제외: 행안부 표의 출장소 13행(`excluded_sub_office`), 값이 모두 0인 폐지 코드 25행(`abolished_code_all_values_zero`), 시도·전국 합계 행.

## 연결표 패키지 v0.2에서 발견한 문제

`kr-sgg-crosswalk_v0.2`의 기초자치단체 228개 기준(`lgu_base20251231.*`, `crosswalk_lgu_*`)은 `build/build_sgg_crosswalk.py`의
`lgu_code()`가 `sggcd[:4] + "0"`으로 시 코드를 만든다. 그 결과

- 증평군(43745)이 영동군(43740)에 합쳐져 단위가 229개가 아니라 228개가 됐고,
- 끝자리가 0이 아닌 자치구(광진구 11215, 강북구 11305, 금천구 11545, 미추홀구 28177, 연수구 28185, 부평구 28237, 계양구 28245, 광주 남구 29155)에 존재하지 않거나 다른 단위의 코드가 붙었다.

이 시제공은 패키지의 일반구 구분 252개 경계만 쓰고 229개 기준은 위 원칙으로 새로 만들었다. 패키지 수정은 통합 설계에서 다룬다.
