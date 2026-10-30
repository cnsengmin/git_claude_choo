# 전국 시군구 연결표 패키지 v0.3

2008–2025년 연도별 시군구 자료를 하나의 기준 경계로 맞춰 **균형 패널**을 만드는 연결표(crosswalk)와 변환 함수입니다.
통계값은 들어 있지 않습니다. KOSIS 등에서 받은 시군구 자료를 넣어 변환합니다.

v0.3은 행정안전부 행정기관코드 변경내역(말소코드 포함)에서 만든 단위 레지스트리와 공식 변경 사건으로 다시 만들었습니다. v0.2와 달라진 점은 [CHANGELOG.md](CHANGELOG.md)에 있습니다.

## 무엇을 쓰면 되나
| 파일 | 기준 경계 | 단위 | 단위 수 | 권장 |
|---|---|---|---|---|
| `crosswalk/crosswalk_lgu_to_base20251231.csv` | 2025-12-31 | 기초 단위(일반구를 시로 합침, 제주 행정시·세종 포함) | 229 | **기본** |
| `crosswalk/crosswalk_sgg_to_base20251231.csv` | 2025-12-31 | 일반구 구분 시군구 | 252 | 통계가 일반구로 나올 때 |
| `crosswalk/crosswalk_lgu_to_base20261001.csv` | 2026-10-01 | 기초 단위 | 230 | 2026년 이후 자료와 이을 때 |
| `crosswalk/crosswalk_sgg_to_base20261001.csv` | 2026-10-01 | 일반구 구분 시군구 | 256 | 〃 |

- 연도 `Y`의 행은 Y년 12월 31일에 시행 중인 단위입니다(`layer_date`). 2026-10-01 기준표에는 2026-10-01 단위(`year` = 2026) 행도 있습니다.
- 2025-12-31 기준이면 2008–2025년 자료 중 단위를 나눠야 하는 경우는 세종 출범(공주시·청원군 일부)뿐입니다. 통합(창원, 청주·청원)은 통째로 옮겨집니다.
- 2026-10-01 기준은 인천 중구·동구·서구를 나눠야 합니다(예: 중구 면적 89%가 영종구).

## 사용법
입력: `year`, `code`(그 해 기준 5자리 시군구 코드), 변수들.

```python
import sys; sys.path.insert(0, "code")
import pandas as pd
from harmonize import load_crosswalk, harmonize, check_totals
cw = load_crosswalk("crosswalk/crosswalk_lgu_to_base20251231.csv")
df = pd.read_csv("내_자료.csv", dtype={"code": str})
panel = harmonize(df, cw, extensive=["pop"], intensive=["aged_pct"], intensive_weight="pop", weights="pop")
check_totals(df, panel, "pop")
```
```r
source("code/harmonize.R")
cw <- load_crosswalk("crosswalk/crosswalk_lgu_to_base20251231.csv")
df <- read_utf8_csv("내_자료.csv", char_cols = "code")
panel <- harmonize(df, cw, extensive = "pop", intensive = "aged_pct", intensive_weight = "pop", weights = "pop")
```

### 코드 체계 (`code_system`)
KOSIS 안에서도 표마다 시군구 코드 체계가 다릅니다. **코드 앞자리를 잘라 바꾸지 마세요.**

| 값 | 열 | 예(종로구) | 주로 쓰는 표 |
|---|---|---|---|
| `mois` (기본) | `src_code` | 11110 | 주민등록인구, 인구이동, 행정 자료 |
| `mois10` | `src_code10` | 1111000000 | 행정기관코드 10자리 |
| `kostat` | `src_kostat` | 11010 | 인구총조사, 인구동향(출생·사망), 사업체조사 |

- 통계청 코드는 각 연도 경계판의 코드를 붙였고, 2025-10 이후 레이어는 국가데이터처 법정동 연계정보 공식 코드입니다.
- 일반구가 있는 시(수원시 등)는 기초 단위 연결표에 통계청 시 코드가 없습니다. 일반구 자료를 `to_lgu()`로 합친 뒤 넣으세요. 소속은 `units/sgg_units_by_year.csv`의 `lgu_code`이고, 코드 앞자리로 추정하지 않습니다.

```python
from harmonize import load_units, to_lgu
gu = to_lgu(df_gu, load_units("units/sgg_units_by_year.csv"), code_system="kostat", sum_cols=["pop"])
```

### 가중치 (`weights`)
| 값 | 열 | 뜻 |
|---|---|---|
| `area` (기본, v0.2와 같음) | `w_src`, `w_tgt` | 땅 면적 비율 |
| `pop` | `w_src_pop`, `w_tgt_pop` | 집계구 인구 비율. 사건 시점에 가까운 인구총조사(2017년 이전 2015, 2018–2022년 2020, 2023년 이후 2024) |

- 차이는 나뉜 단위(`method = area_split`)에만 납니다.
- 인구·가구 같은 값은 보통 `pop`이 낫습니다. 단, 변경 뒤 개발된 땅은 몫이 커 보입니다: 2012 공주시 → 세종은 면적 8.2%, 2015년 인구 18%(이미 행복도시 입주가 시작됨).
- 결과의 `alloc_share` > 0 이면 단위를 나눈 값이 섞였다는 뜻입니다.

## 연결 방식 (`method`)
| 값 | 뜻 |
|---|---|
| `code_1to1` | 코드가 그대로 이어짐 |
| `code_changed_whole` | 단위 전체가 다른 코드로 감: 코드 재부여(강원 42→51, 전북 45→52, 광주·전남 → 12, 군위 47720 → 27720), 명칭 변경(인천 남구 → 미추홀구), 통합(마산·진해 → 창원, 청원 → 청주, 연기 → 세종) |
| `area_split` | 단위가 둘 이상으로 나뉨(면적·인구 몫으로 배분) |

규칙:
- 무엇을 나눌지는 공식 변경 사건이 정합니다. 사건이 없는 단위는 경계 그림이 달라 보여도 1:1입니다.
- 폭 20m 미만 띠, 0.2%이면서 5,000㎡ 미만인 조각은 경계 재작도 오차로 지웁니다. 기존 단위로 가는 5% 미만 조각도 오차로 봅니다. 새로 생긴 단위로 가는 조각은 1% 이상이면 남깁니다.
- 일반구가 폐지됐다가 다시 생긴 부천(2016 폐지, 2024 부활)처럼 중간 레이어가 합쳐진 경우, 나뉜 단위는 행정동 연결표를 거쳐 몫을 계산합니다(원미구 2010 → 원미구 2025 99.8%).

변경 사건은 `crosswalk/events_{lgu,sgg}.csv`(시행일, 유형, 이전·이후 코드)에 있습니다.

## 단위 목록
`units/{lgu,sgg}_units_by_year.csv`: 연도별 단위, 5·10자리 행안부 코드, 통계청 코드, 경계판(`boundary_version`), 면적, 집계구 인구(`pop_census`, `pop_year`). 일반구 목록에는 소속 기초 단위(`lgu_code`)가 있습니다.

경계 GPKG는 용량 때문에 이 폴더에 넣지 않고 GitHub Release(`region-layers-YYYYMMDD`)로 배포합니다: 수준별 파일 하나, 레이어 날짜마다 테이블 하나(예: `lgu_20251231`), EPSG:5179.

## 한계
- 면적 배분은 사람이 땅에 고르게 산다고 가정하고, 인구 배분은 2025 집계구 대표점 위의 인구총조사 값을 씁니다. 2010년 집계구 인구는 SGIS가 주지 않아 2008–2017년 사건은 2015년 인구를 씁니다.
- 연도 Y의 경계는 Y년 12월 31일 이전 가장 최근 경계판이고, 연말 판이 없는 해(2016·2017·2018·2020·2021·2022)는 그 해 마지막 판입니다.
- 2026-07 이후 경계는 원자료(SGIS)에 아직 없어 vuski/admdongkor 2026 판을 씁니다.

## 검증
`python examples/example.py && Rscript examples/example.R && python tests/validate.py`

- 몫 합, 연도별 기준 단위 전부 대응, 원천 단위 누락 없음
- 기초 단위 229개, 증평군, 자치구 8곳 코드
- 사례: 철원 코드 재부여, 군위 소속 변경, 창원 통합, 청원 흡수, 세종 출범·편입, 미추홀구, 부천 일반구 폐지·부활, 청주 일반구 재편, 2026 인천 개편
- 통계청 코드 입력 결과가 행안부 코드와 같음
- `to_lgu` 합계
- Python·R 일치 (R이 있을 때)

저장소 쪽에서는 v0.2(2010–2025)와 3,656행이 같고 몫 차이가 0인지 따로 대조합니다(`scripts/region_registry/validate_crosswalk.py`).

## 함께 쓰는 자료
- **2025 시군구 표**: 저장소의 `data/derived/sgg2025/lgu229_2025.csv`(229개 × 91열)는 이 패키지의 2025-12-31 기초 단위와 같은 코드(`lgu_code` = `code`)를 씁니다.
- **서울 행정동 패키지 v0.1**: 기준 경계(2026-10-01, 서울 427개 동)가 저장소 레이어 `kr-admdong@2026-10-01`과 같습니다. 행정동 연결표는 저장소의 `data/derived/region-registry/crosswalk/admdong_to_20261001.csv`(전국)에 있습니다.

## 출처·라이선스
- 단위·사건: 행정안전부 행정기관코드 변경내역(말소코드 포함, 2026-10-12 판).
- 경계: 통계청 SGIS(공공누리 제1유형) → vuski/admdongkor 가공(CC BY 4.0).
- 인구: 통계청 SGIS 집계구 인구총조사(공공누리 제1유형).
- 이 패키지의 연결표: CC BY 4.0. 코드: MIT.

> 본 데이터는 통계청 통계지리정보서비스(SGIS)에서 공공누리 제1유형으로 개방한 행정구역 경계·집계구 통계와 행정안전부 행정기관코드를 가공한 것이며(경계 가공: vuski/admdongkor, https://github.com/vuski/admdongkor), CC BY 4.0으로 배포됩니다.
