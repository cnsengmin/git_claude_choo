# 레이어 모듈 (`layers/`)

Site Analysis 사이드바의 레이어마다 폴더가 하나씩 있습니다. 레이어를 하나씩 구현하고 확인하려고 나눴습니다. 작업은 레이어 하나를 브랜치 `layer/<id>` 하나, PR 하나로 합니다.

```
layers/
  <group>/<id>/
    layer.json      레이어 정의: 이름, 그룹, 상태, 출처 (필수)
    style.ts        지도에 그리는 방법 (자료가 연결된 레이어만)
  providers/<provider>/
    server.ts       자료를 가져오는 서버 코드: /api/layers/<provider>[/<경로>]
    check.json      실시간 검증 요청과 기대값
    README.md       무엇이 되고 무엇이 안 되는지, 확인 결과
  index.ts          모든 layer.json과 style.ts 목록 (사이드바 순서)
  groups.ts         그룹과 프리셋
  server.ts         provider 목록 (서버 전용)
```

그룹: `boundaries`, `physical`, `planning`, `mobility`, `people`, `places`.

## layer.json
| 필드 | 뜻 |
|---|---|
| `id` | 폴더 이름과 같아야 함 |
| `group` | 그룹 폴더 이름과 같아야 함 |
| `label`, `description`, `source` | 사이드바에 보이는 이름, 설명, 출처 |
| `status` | `planned`(다음) → `partial`(보완) → `available`(연결됨). 사이드바 표시가 이 값을 따릅니다 |
| `provider` | 자료를 주는 `providers/<provider>/` (선택). 있으면 `style.ts`가 필요합니다 |
| `license`, `requiresEnv` | 자료 라이선스, 필요한 환경변수 이름 (선택) |

여러 레이어가 provider 하나를 함께 쓸 수 있습니다. 예를 들어 OSM 건물·도로·녹지·하천·토지이용은 모두 `osm-overpass` 응답 하나에서 그립니다.

## style.ts
- 기본: provider의 GeoJSON 응답을 `filter`로 나눠 그립니다(`osm-overpass`). `order`가 작은 레이어가 아래에 깔립니다.
- `tiles`가 있으면 provider의 벡터 타일 `/api/layers/<provider>/<tiles.path>/{z}/{x}/{y}.pbf`를 그립니다(`region-layers`). 행정경계 레이어는 고른 시점으로 걸러지고, 지역을 누르면 이름과 코드가 뜹니다.
- `time`: 사이드바에서 고르는 시점이나 연도입니다. 선택지와, 고른 값에 따른 `filter`·`paint`를 정합니다. `key`가 같은 레이어는 선택 하나를 같이 씁니다. 예: 경계 3개는 `boundary-date`를 같이 쓰고, 집계구 인구는 `oa-year`를 씁니다.
- `describe`: 지역을 눌렀을 때 뜨는 한 줄입니다. `legend`: 레이어를 켰을 때 사이드바에 나오는 범례입니다.

## check.json
`requests`의 요청마다 `/api/layers/<provider>/<path>?<query>`를 부르고 `expect` 규칙을 검사합니다. JSON 규칙은 `min`, `minLength`, `equals`이고, 타일처럼 JSON이 아닌 응답에는 `minBytes`, `contains`를 씁니다. 자세한 형식은 `scripts/layers/check-live.mjs` 머리말에 있습니다.

## 새 레이어를 구현하는 순서
1. `layer/<id>` 브랜치를 만듭니다.
2. 자료를 가져올 provider를 `providers/<provider>/`에 만들고 `layers/server.ts`에 등록합니다. 이미 있는 provider를 쓰면 이 단계는 건너뜁니다.
3. 레이어 폴더에 `style.ts`를 추가하고, `index.ts`의 `LAYER_STYLES`에 등록합니다.
4. `layer.json`에 `provider`를 적고 `status`를 올립니다.
5. 다음 검증을 통과시킵니다.
   - `node scripts/layers/check-manifests.mjs`: 구조 검사. CI에서도 돕니다.
   - `node scripts/layers/check-live.mjs http://localhost:3000 <provider>`: 띄운 앱에 실제로 요청합니다. 외부 API를 부르므로 CI에서는 돌리지 않습니다.
6. 로컬 화면에서 지도에 그려지는지 확인하고, 결과를 provider README에 적습니다.

## 데이터
1MB를 넘는 자료는 Git에 넣지 않습니다. 정적 자료는 벡터 타일(PMTiles) 등으로 만들어 GitHub Release나 저장소 밖 저장 공간에 두고, 위치와 해시는 provider README에 적습니다. 예: `region-layers`와 `sgis-oa`는 Release의 PMTiles를 서버가 구간별로 읽어 타일로 돌려줍니다(공용 코드 `providers/pmtiles.ts`). PMTiles는 `scripts/region_registry/build_release_pmtiles.py`의 `write_pmtiles()`로 만듭니다. 이 함수는 GDAL이 무시하는 옵션을 오류로 막습니다. 무시된 옵션 때문에 저배율 타일에서 지역이 빠진 적이 있기 때문입니다.
