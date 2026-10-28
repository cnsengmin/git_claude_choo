# sgg-stats

2025 시군구 단년 표(`data/derived/sgg2025/lgu229_2025.csv`, 기초 단위 229개 × 91열)를 지도용 JSON으로 줍니다.

- 경로: `GET /api/layers/sgg-stats/2025`
  - 응답: `{ year, boundaryDate: "2025-12-31", units: [{ code5, name, sido, values }] }`.
  - `values`에는 코드 열을 뺀 모든 열이 들어 있습니다. 빈 칸은 `null`입니다.
- 표가 Git에 있고 작아서(162KB) 타일을 따로 만들지 않습니다. 서버가 CSV를 읽어 한 번 캐시합니다.
- 레이어 `people/sgg-stats-2025`는 이 값을 기초 단위 경계 타일(`region-layers`의 `lgu`, 2025-12-31 시점)에 `code5`로 붙여 칠합니다. `code5`는 표의 `lgu_code`와 같은 행안부 5자리 코드입니다.
- 지표 목록 `layers/people/sgg-stats-2025/indicators.json`은 코드북에서 만듭니다(`scripts/sgg2025/build_layer_indicators.py`). 코드북이 바뀌었는데 목록을 다시 만들지 않으면 Layers CI가 실패합니다.
- 출처와 기준 시점은 지표마다 다릅니다. 표의 README(`data/derived/sgg2025/README.md`)를 따릅니다.
  - 사업체 자료는 2024년입니다.
  - 지역별고용조사는 표본조사이고, 세종은 시군구 표에 없어 고용 지표가 비어 있습니다.

## 확인
`node scripts/layers/check-live.mjs http://localhost:3000 sgg-stats`
