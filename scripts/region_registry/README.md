# 행정구역 단위 레지스트리와 시점별 레이어

설계: [`docs/REGION_CROSSWALK_INTEGRATION_PLAN.md`](../../docs/REGION_CROSSWALK_INTEGRATION_PLAN.md) v2.1의 2-1(단위 레지스트리)·2-3(시점별 레이어).

## 실행

```bash
python scripts/region_registry/build_registry.py               # data/raw/mois/ 아래 가장 최근 판 사용
python scripts/region_registry/validate_registry.py --offices   # --offices: admdongkor 출장소 목록과 대조(인터넷 필요)
```

입력은 행정안전부 「행정기관(행정동) 및 관할구역(법정동) 변경내역」 게시판의 `jscodeYYYYMMDD(말소코드포함).zip`을 `data/raw/mois/jscode<날짜>/x/`에 푼 `KIKcd_H.<날짜>(말소코드포함)`이다(gitignore, 받은 기록은 `data/manifests/mois-kik-with-abolished-<날짜>.json`).

## 규칙

- **수준(level)**: 행안부 코드 체계 안의 위치(시도 / 시군구 행 / 읍면동 행)로 행의 자리를 정하고, 시군구 행 안에서는 이름으로 나눈다.
  - `lgu`: 기초자치단체, 제주 행정시, 세종(시군구명이 빈칸인 단층제 행)
  - `general_gu`: "OO시 OO구"
  - `sub_office`: "…출장소"
  - 읍면동 행은 `admin_dong`. 그중 "…출장소", "…지소"(출장지소), "…분소"(동 분소)는 `dong_sub_office`
- **상위 단위**: 같은 시도에서 이름이 같고 하위 단위의 생성일에 살아 있는 행으로 찾는다(`parent_method`). 코드 앞자리로 만들지 않는다. 증평군 43745를 앞자리로 보면 영동군 43740의 일반구가 되는 오류가 있다.
  - 이름의 공백 차이는 무시한다("부천시소사구" = "부천시 소사구").
  - 행안부 원자료의 날짜가 어긋나 생성일에 상위가 없으면, 유효기간이 겹치는 같은 이름의 상위가 하나뿐일 때만 그것을 쓰고 `_validity_overlap`으로 표시한다. 광주 남구 동은 1995-01-01 생성인데 남구는 1995-03-01 생성이라 이 경우에 해당한다. 2026-10-12판 기준 26건.
  - 코드 앞자리 상위와 같은지는 `prefix_parent_agrees`에 검증용으로만 남긴다(현재 불일치 0).
- **유효기간**: `valid_from` = 생성일자, `valid_to` = 말소일자 하루 전. 생성일과 말소일이 같은 402개 코드는 남기되 어느 레이어에도 들어가지 않는다.
- **레이어**: `kr-lgu@<날짜>`(기초 단위), `kr-sgg@<날짜>`(일반구 구분: 일반구가 있는 시는 일반구로 대신), `kr-admdong@<날짜>`(출장소 제외 행정동). 기본 날짜는 2008–2025 연말과 2026-10-01.

## 결과 (2026-10-12판)

| 기준일 | 기초 단위 | 일반구 구분 | 행정동 |
|---|---|---|---|
| 2008-12-31 | 232 | 249 | 3,498 |
| 2010-12-31 | 230 | 251 | 3,477 |
| 2014-12-31 | 229 | 252 | 3,496 |
| 2016-12-31 | 229 | 250 | 3,503 |
| 2025-12-31 | 229 | 252 | 3,562 |
| 2026-10-01 | 230 | 256 | 3,564 |

검증 23/23(`--offices`와 레이어 경계 대조 포함):
- 기초 단위 수가 19개 시점 모두 실제 역사와 일치.
- `kr-sgg@2025-12-31`·`kr-sgg@2026-10-01`이 경계 기반 연결표 패키지의 252·256개와 코드까지 일치.
- `kr-lgu@2025-12-31`이 2025 시군구 표 229개와 일치.
- 행정동 3,562 vs SGIS 2025(2025-06-30) 경계 3,559.
- 공식 사건 7건 확인(철원 재부여, 군위 편입, 전북, 세종, 미추홀, 증평, 화성 일반구).
- 출장소 392개가 admdongkor `find_offices()`와 완전 일치.

## 변경 사건 (설계안 2-2)

```bash
python scripts/region_registry/build_events.py
python scripts/region_registry/validate_events.py     # KIRD 대조 포함(data/raw/external/kird/kird.py 있을 때)
```

- 수준(`lgu`, `sgg`, `admdong`)마다 레이어 구성원이 바뀌는 날을 모두 찾는다. 3일 이내 변화는 한 묶음으로 보되(연기군 2012-06-30 말소 → 세종 2012-07-01 생성), 레이어 기준일을 넘어서는 묶지 않는다.
- 묶음 안에서 없어진 단위와 생긴 단위를 잇는다.
  1. 이름이 같은 짝: 같은 시도이거나, 그날 시도 자체가 없어진 경우만 1차로 인정한다. 2026-07-01에 인천과 광주의 동구·서구가 같은 날 바뀌었기 때문이다.
  2. 시도를 넘는 짝(군위 경북 → 대구): 그 이름이 묶음 안에서 하나뿐일 때만 인정한다.
  3. 나머지는 시도(행정동은 시·군) 단위로 묶어 크기로 유형을 정한다: `rename` 1:1, `merge` n:1, `split` 1:n, `reorganize` n:m, `absorbed` n:0, `new` 0:n.
  4. 묶음 안에 잃기만 한 무리와 얻기만 한 무리가 하나씩이면 합친다(연기군 → 세종).
- `recode`(같은 이름 1:1) 외에는 `needs_boundary`이다. 몫은 경계 겹침 단계(P4)에서 정한다. `absorbed`에는 같은 기간 새 일반구의 상위 시를 흡수 대상 후보(`absorb_hint`)로 남긴다(청원군 → 청주시).
- 결과(`data/derived/region-registry/events.csv`, 2026-10-12판):

| 수준 | recode | rename | merge | split | reorganize | absorbed | new |
|---|---|---|---|---|---|---|---|
| lgu | 60 | 4 | 1 | 0 | 1 | 1 | 0 |
| sgg | 61 | 4 | 1 | 4 | 2 | 0 | 0 |
| admdong | 838 | 59 | 27 | 26 | 52 | 35 | 88 |

- 검증 9/9:
  - 세 수준 모두 이웃 레이어 사이 증감이 사건으로 100% 설명됨.
  - 기초 단위 코드 재부여 60건, 비재부여 7건이 실제 역사와 같음.
  - 2026 인천 개편에 광주 구가 섞이지 않음.
  - KIRD 계승·분할 12건 중 11건 일치, 1건(포천군→포천시, 2003)은 범위 밖.
- 한계: 코드가 바뀌지 않은 단위의 경계 이동(청주 상당구·흥덕구의 2014 재편, 공주시·청원군 일부의 세종 편입)은 이 단계에 나오지 않는다. 연결표 단계에서 `area_ceded_to_new`로 잡는다.

## 레이어 경계 (설계안 2-3 경계)

```bash
python scripts/region_registry/build_layer_boundaries.py --detail   # admdongkor 원본 해상도, data/raw/admdongkor/에 캐시
```

- 레이어마다 그 날짜 이전 가장 최근의 admdongkor 경계 버전을 붙인다. 2008–2025 연말 중 2016·2017·2018·2020·2021·2022년은 연말 판이 없어 그 해 마지막 판(2-11월)을 쓴다.
- 레이어 단위와 경계 단위를 코드로 대조한다. 기초 단위는 경계의 일반구를 레지스트리의 상위 시로 접어서 비교한다. 결과는 `data/derived/region-registry/layer_boundaries.csv`.
- 차이는 네 갈래로 나눈다.
  - `no_polygon`: 어느 판에도 경계가 없음. 군사분계선 북쪽 철원 근동·원동·원남·임남면, 고성 수동면 5곳.
  - `source_gap`: 다른 판에는 있는데 이 판에만 없음. 파주 장단면은 2013년판부터, 진서면·철원 근동면은 2015년판에만 있다. 울산 중앙동은 2008년판에서만 빠졌다.
  - `version_lag`: 경계판 날짜와 레이어 날짜 사이의 변경. 기준일 당일 시행(통영 4개 동 2010-12-31 말소)과 기준일 직후 시행(함안 칠원읍 2015-01-01 생성)을 포함하고, 사건 목록으로 설명되는 구성 변화(2016-07 부천 일반구 폐지)도 여기에 넣는다.
  - `unexplained`: 위 어디에도 해당하지 않음. 현재 0건.
- 결과(57개 레이어):
  - 기초 단위 19개 모두 코드까지 일치.
  - 일반구 구분은 2016년만 `version_lag`(2016-02-01판에 부천 일반구 3개가 남아 있음).
  - 행정동은 2015년만 완전 일치. 나머지는 위 세 갈래(`no_polygon`, `source_gap`, `version_lag`)로 모두 설명된다.
- 연결표(P4)에 주는 영향: 경계판이 연말에 없는 해는 레이어 경계를 쓰지 말고, 사건 시행일 바로 앞뒤의 admdongkor 판(64개 시점)을 쓴다. 경계 없는 5개 면은 인구가 없으므로 1:1(코드 재부여)로만 잇는다.

## 레이어별 코드 대응 (설계안 2-5)

```bash
python scripts/region_registry/build_code_map_layers.py   # 공식 연계정보: data/raw/external/kostat-linkage/linkage_<날짜>.csv
python scripts/region_registry/validate_code_map.py
```

- 근거: 레이어 경계판의 읍면동 경계 하나하나에 통계청 코드(2021년판까지 `emd7`, 2022년판부터 `emd8`)와 행안부 10자리 코드(`emdcd`)가 함께 붙어 있다. 같은 경계에 붙은 두 코드를 한 쌍으로 본다. 통계청 시군구는 통계청 코드 안의 시군구 자리이고, 행안부 시군구는 같은 경계들의 행안부 시군구다. 한 체계의 코드를 잘라 다른 체계 코드를 만들지 않는다.
- 결과: `code_map_layers.csv`(시군구·기초 단위, 레이어 38개), `code_map_layers_admdong.parquet`(행정동). 모든 레이어에서 1:1이다.
- 원자료 오류 처리(`code_map_source_anomalies.csv`):
  - 2018년판에서 남동구 동 하나에만 붙은 통계청 시군구 23057은 소수 쌍으로 버린다.
  - 2019년판에 두 번 들어 있는 검암경서동은 하나로 합친다.
- 공식 대조(국가데이터처 법정동 연계정보 2026-10-01판, 개정판 6개가 한 파일에 있음): 각 레이어를 그 날짜 이전 1년 안의 가장 최근 개정판과 비교한다(`code_map_linkage_check.csv`).
  - `kr-sgg@2025-12-31` 252쌍이 2025-10-01판과 모두 일치한다. 3단계에서 SGIS 경계 겹침으로 만든 2025 대응표와도 일치한다.
  - `kr-sgg@2026-10-01`: 2026-07 개편 지역 12개 시군구(광주 5개 구, 전남 5개 시, 인천 서해·검단구)에서 admdongkor 코드가 공식과 다르다. 행정동은 257개가 다르다.
- 공식 개정판이 있는 레이어는 공식 코드를 `kostat_final`로 쓰고(`kostat_source = official_linkage`), 없는 레이어(2008–2024)는 경계판 코드를 쓴다(`boundary_polygon`).
- 검증 10/10.

## 연결표 (설계안 2-4)

```bash
python scripts/region_registry/build_crosswalk.py     # 이웃 레이어 사이 연결(면적·인구 가중)
python scripts/region_registry/crosswalk_chain.py     # 표준 연결표: lgu·sgg → 2025-12-31, 2026-10-01 / admdong → 2026-10-01
python scripts/region_registry/crosswalk_chain.py --level lgu --from 2010-12-31 --to 2025-12-31   # 임의 두 시점
python scripts/region_registry/validate_crosswalk.py
```

- **무엇을 나눌지는 공식 사건이 정한다.**
  - 사건이 없는 단위: 1:1.
  - `recode`: 1:1.
  - 코드가 없어진 단위: 면적 배분(`area_abolished_code`).
  - 코드는 남았지만 새 단위에 땅을 1% 이상 내준 단위: 자기 + 새 단위로 배분(`area_ceded_to_new`). 청원군→세종 3.4%, 2014 청주 상당구·흥덕구 재편이 여기서 잡힌다.
- **겹침 규칙**은 연결표 패키지 v0.2와 같다.
  - 폭 20m 미만 띠, 0.2%이면서 5,000㎡ 미만인 조각은 잡음으로 지운다.
  - 기존 단위로 가는 5% 미만 조각은 버린다.
  - 새 단위로 가는 조각은 작아도 남긴다. 단, 행정동 수준에서는 같은 시·군·구 안에서만 남긴다. 그렇지 않으면 2024 부천 동 코드 재부여 때 서울 구로구 동의 경계 잡음이 부천으로 샜다.
- **경계판**: 원천 단위는 그 구간 첫 사건 전날 이전의 최신 판, 대상 단위는 마지막 사건 이후 첫 판을 쓴다. 그 판에 코드가 없으면 가장 가까운 판으로 대체한다(`src_version`, `tgt_version`).
- **인구 가중**(`w_src_pop`, `w_tgt_pop`):
  - 2025 집계구의 대표점에 사건 시점에 가까운 해의 인구를 얹는다. 2017년 이전 사건은 2015년, 2018–2022년은 2020년, 2023년 이후는 2024년 인구를 쓴다(`pop_year`).
  - 연결표의 대상 몫(`w_tgt_pop`)도 출발 레이어 날짜에 맞는 해의 인구를 쓴다.
  - 변경 뒤 개발된 땅이 있으면 나중 인구로 나눈 몫이 크게 틀어진다. 공주시→세종(2012)은 면적 8.2%인데 2024년 인구로는 44%, 2015년 인구로도 18%다. 2015년에 이미 행복도시 입주가 시작됐기 때문이다. 이런 사건은 면적 몫이 더 나을 수 있어 둘 다 제공한다.
  - 과거 연도(2015·2020) 집계구 값의 `N/A`에는 작은 값을 가린 칸도 섞여 있다(2015년 2,706명, 2020년 1,027명). 2024년의 `N/A`는 거주자 없음이다.
  - 조각에 사는 사람이 없으면 면적 몫을 쓴다.
- **새 땅**: 어떤 원천 경계와도 겹치지 않는 대상 단위(새솔동, 2018, 시화호 간척지)는 받는 쪽이 없는 채로 둔다. `crosswalk_edges.manifest.json`의 `targets_without_source`에 기록한다.
- **일반구 폐지·부활**(부천 2016 폐지, 2024 부활): 그 사이 레이어에는 '부천시' 하나뿐이라, 이웃 연결을 곱하면 옛 원미구가 새 3개 구로 면적만큼 흩어진다. 일반구가 시로 합쳐졌다가(`merge`) 같은 시에서 다시 나뉜(`split`) 경우, 그 일반구에서 출발하는 연결만 행정동 연결표를 거쳐 계산한다(`gu_cycles`, `via_dongs`). 원미구 2010 → 원미구 2025 99.8%. 다른 단위는 그대로 둔다: 인천 서구처럼 행정동 경로가 경계판 잡음으로 해마다 흔들리는 곳이 있기 때문이다.
- **검증 23/23**:
  - 이웃 연결·이어 붙인 연결표 모두 원천 몫·대상 몫의 합이 1이다.
  - 모든 단위가 원천·대상으로 등장한다(새 땅만 예외).
  - 사건이 있는 모든 구간이 원하던 인구총조사 연도를 썼다(대체 연도 0건).
  - 사례 7건(부천 원미구 포함): 청원→청주 1, 공주→세종 8.2%, 청원→세종 3.4%, 연기→세종 1, 인천 중구→영종구 89%, 청주 상당구→청원구, 부천 원미구 2010→원미구 2025 99.8%.
  - **연결표 패키지 v0.2와 이름 기준 3,656행이 일치하고 면적 몫 차이는 0**이다. 다른 것은 v0.2의 증평 버그와 여주군 2% 미만 조각(v0.2 잡음)뿐이다.
  - **서울 행정동 패키지 v0.1과는 2010–2025년에 같은 연결이 99.7%, 그중 몫 일치가 99.7%**다. 차이 20행은 위례 일대 시·구 경계 조각(2~5%)과 강남 동 1곳의 날짜 기준 차이(v0.1은 경계판 날짜, 이쪽은 행안부 시행일)다.

## CI·배포 (P8)

- **CI**(`.github/workflows/ci.yml`): 원자료(`data/raw/`)는 git에 없으므로 커밋된 산출물만으로 검사한다.
  - `region-registry`: 스크립트 문법 검사(`py_compile`), `validate_registry.py`·`validate_events.py`·`validate_code_map.py`·`validate_crosswalk.py`. 원자료가 필요한 대조(v0.2 패키지, KIRD, admdongkor 출장소)는 건너뜀으로 표시된다.
  - `kr-sgg-crosswalk`: Python·R 예제를 돌린 뒤 패키지 검증(Python·R 결과 비교 포함). R은 CI에서만 돈다.
  - `scripts/sgg2025/validate.py`는 KOSIS 원자료 JSON이 있어야 해서 CI에 넣지 않는다.
- **경계 GPKG**(GitHub Release): `build_release_gpkg.py`가 `dist/region-layers/`(gitignore)에 수준별 GPKG 3개, `manifest.json`(SHA-256), `RELEASE_NOTES.md`를 만든다. 레이어 날짜마다 테이블 하나, EPSG:5179.

```bash
python scripts/region_registry/build_release_gpkg.py
gh release create region-layers-YYYYMMDD dist/region-layers/*.gpkg dist/region-layers/manifest.json --title "행정구역 시점별 레이어 경계 YYYY-MM-DD" --notes-file dist/region-layers/RELEASE_NOTES.md
```

  - 2026-10-27 빌드: 기초 단위 93MB, 일반구 구분 95MB, 행정동 269MB. 행정동은 레이어 경계판에 아직 없는 동 168건(19개 레이어 합)이 가장 가까운 판의 경계를 쓰고(`polygon_version`), 2023년 이후 북쪽 접경 5개 면은 경계가 없다.
- **지도용 벡터 타일**(PMTiles, 같은 Release): `build_release_pmtiles.py`가 위 GPKG에서 수준별 PMTiles를 만든다(GDAL PMTiles 드라이버). 모든 시점이 한 파일에 있고, 지역마다 속한 시점 표시(`d2008`…`d2025`, `d202610`)가 1이다. `manifest.json`의 `tiles`와 `RELEASE_NOTES.md`의 타일 절을 고쳐 쓴다. 앱은 `layers/providers/region-layers`가 Release에서 구간별로 읽어 `/api/layers/region-layers/<수준>/<z>/<x>/<y>.pbf`로 준다.

```bash
python scripts/region_registry/build_release_pmtiles.py
gh release upload region-layers-YYYYMMDD dist/region-layers/*.pmtiles dist/region-layers/manifest.json --clobber
```

  - 2026-10-28 빌드: 기초 단위 12.7MB(z4–12), 일반구 구분 12.6MB(z5–12), 행정동 34.8MB(z8–12). 지역×시점 4,362 / 4,766 / 66,633개. 2026-10-27 빌드는 단순화·타일 크기 옵션을 레이어 옵션으로 넘겨 GDAL이 무시했고, 저배율 타일에서 지역이 빠졌다(서울 행정동 z8 1,323개 중 731개 누락). `write_pmtiles()`가 무시된 옵션을 오류로 막는다.
  - 시도(`--levels sido`, 2026-10-29): 따로 그린 경계가 없어 시점마다 기초 단위를 행안부 시도 코드(10자리 코드 앞 두 자리)로 합친다. 2.9MB(z4–10), 318개(2008–2011 16개, 2012–2025 17개, 2026-10-01 16개). 경계판 차이로 생긴 1ha 미만 틈 구멍(2011년 4,374개)은 메운다. 영산호·수영만처럼 어느 기초 단위에도 속하지 않는 물은 그대로 빈다.
- **집계구 인구 타일**(PMTiles, Release `oa-population-YYYYMMDD`): `build_release_oa_pmtiles.py`가 `data/raw/sgis/oa-2025`의 2025 집계구 경계에 2015·2020·2024 인구를 붙여 `dist/oa-population/`에 만든다. 속성은 `p<연도>`(인구)와 `dn<연도>`(명/㎢)이고, N/A는 비워 둔다. 연도별 집계구 합이 `data/manifests/sgis-oa-2025.json` 기록과 다르면 멈춘다. 앱 레이어는 `layers/people/population-oa`.
- **100m 격자 타일**(PMTiles, Release `grid-100m-YYYYMMDD`): `build_release_grid_pmtiles.py`가 `data/raw/sgis/grid/100m`의 SGIS 격자 통계(자료신청 90231)를 격자 코드에서 계산한 정사각형에 붙여 `dist/grid-100m/`에 만든다. 속성은 `cell`, `p<연도>`(인구 2015–2024), `h`·`u`·`b`·`w<연도>`(가구·주택·사업체·종사자, 2015·2020·2024)이고, 그 해 파일에 없는 격자는 비워 둔다. 원자료 해시가 `data/manifests/sgis-request-90231.json`과 다르거나 써 넣은 합계가 원자료 합과 다르면 멈춘다. 앱 레이어는 `layers/people/population-100m`.

```bash
python scripts/region_registry/build_release_oa_pmtiles.py
gh release create oa-population-YYYYMMDD dist/oa-population/* --title "집계구 인구 YYYY-MM-DD" --notes-file dist/oa-population/RELEASE_NOTES.md
```

  - 2026-10-29 빌드: 90.2MB(z10–14), 집계구 108,510개. 합계 2015 51,066,669 / 2020 51,828,109 / 2024 51,805,547(기록과 같음). 서울 도심 z10 타일 17,489개 중 17,483개(빠진 6개는 타일 경계에 11㎡ 이하로 걸친 것), z12 이상 전부.
