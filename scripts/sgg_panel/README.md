# 시군구 시계열 2008–2025 — 수집·변환·검증

산출물 설명은 [`data/derived/sgg-panel/README.md`](../../data/derived/sgg-panel/README.md).

```bash
python scripts/sgg_panel/collect_kosis_panel.py   # KOSIS 연도별 원자료 → data/raw/kosis/sgg-panel (Git 밖)
python scripts/sgg_panel/build_panel.py           # 그해 단위 연결 → 2025 경계 → lgu229_panel.csv
python scripts/sgg_panel/validate_panel.py        # 22개 검사
```

- 키: `KOSIS_API_KEY`를 `scripts/sgg2025`와 같은 방식으로 찾고(`atlas_keys.py`), 키 값은 출력하거나 기록하지 않습니다. 요청 기록(키 없음), 행 수, SHA-256은 `data/manifests/kosis-sgg-panel-fetch.json`에 남깁니다.
- 표와 항목은 2025 단년 표와 같습니다(`collect_kosis_panel.py`의 `SERIES`).

## 코드 연결
코드 앞자리를 잘라 바꾸지 않습니다. 연결표 패키지의 연도별 단위 목록(`packages/kr-sgg-crosswalk/units`)을 씁니다.

1. 행안부 코드 표는 그해 단위의 행안부 코드로, 통계청 코드 표는 통계청 코드로 찾습니다.
2. 시 전체 행이 있으면 그 값을 쓰고, 없으면 일반구 행을 소속 시(`lgu_code`)로 합칩니다. 둘 다 있으면 서로 같은지 대조합니다.
3. KOSIS는 일부 단위의 값에 다른 해의 코드를 붙여 줍니다.
   - 지금 코드를 과거 연도에 씀: 강원 42→51, 전북 45→52, 2022년 이후 군 단위 통계청 코드.
   - 연중 변경 전 코드를 씀: 2018 인천 남구 → 미추홀구, 2022 군위군의 2021년 통계청 코드.

   그해 목록에 없는 코드는 그 코드가 있는 가장 가까운 해의 단위를 찾습니다. 그 단위와 그해의 어떤 단위가 둘 다 같은 2025 기준 단위로 온전히(1:1, 몫 100%) 이어지면, 그 코드를 그해의 그 단위로 봅니다(`other_year_code_map`). 합쳐지거나 나뉜 경우는 이렇게 잇지 않습니다.
4. 연결하지 않는 행: 시도·전국 행, 출장소, 동부·읍부·면부 소계, 일반구가 있는 시의 통계청 시 합계 행(일반구로 대신 셈), 값이 0인 폐지 코드. 연결하지 않은 코드가 값을 빠뜨리지 않았다는 것은 단위 합 = KOSIS 전국 행으로 확인합니다.

## 경계 맞추기
`harmonize()`(패키지 `code/harmonize.py`)로 그해 기초 단위를 2025-12-31 기준 단위로 옮깁니다. 합산형 변수이고 인구 가중입니다.
