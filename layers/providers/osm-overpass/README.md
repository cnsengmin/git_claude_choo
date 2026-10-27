# osm-overpass

OpenStreetMap Overpass API로 분석 반경 안의 건물, 도로, 토지이용, 녹지·수계를 바로 가져옵니다.

- 경로: `GET /api/layers/osm-overpass?x=<경도>&y=<위도>&radius=<m>`. 반경은 50–1,500m로 제한합니다.
- 레이어: `physical/buildings`, `physical/roads`, `physical/green-water`, `planning/land-use`. 모두 이 응답 하나에서 `kind` 값으로 나눠 그립니다.
- 라이선스: © OpenStreetMap contributors (ODbL). 공식 건축물·도로·지적·계획 자료가 아니라 맥락을 보는 보완 자료입니다.

## 주의
- overpass-api.de는 User-Agent 없는 요청을 406으로 거절합니다. `server.ts`가 앱 이름을 User-Agent로 보냅니다.
- 공용 서버라 느립니다. 2026-10-27 기준 1km 반경 응답에 약 43초가 걸렸습니다.
- 지도 중심이나 반경이 바뀌면 화면이 불러온 자료를 지웁니다. 분석 중심에 묶인 자료이기 때문입니다.

## 확인 (2026-10-27)
- `node scripts/layers/check-live.mjs http://localhost:3100 osm-overpass` (안양 평촌, 300m 반경): 건물 45, 도로 128, 전체 192개, 38.4초.
- 로컬 화면 Site Analysis, 1km 반경: 건물 610, 도로 807, 토지이용 59, 녹지·수계 28. 도로와 녹지가 분석 원 안에 그려집니다.
