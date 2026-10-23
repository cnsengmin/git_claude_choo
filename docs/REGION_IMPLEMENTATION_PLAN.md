# 설계안 v2.1 구현 계획 (작업 분할)

기준: [`REGION_CROSSWALK_INTEGRATION_PLAN.md`](REGION_CROSSWALK_INTEGRATION_PLAN.md) v2.1, 승인 2026-10-22.
브랜치 `feature/region-crosswalk`. 커밋·푸시는 사용자 확인 후.

## 현재 상태 (2026-10-22)

| 항목 | 상태 | 위치 |
|---|---|---|
| 2025 시군구 단년도 표(229) | 완료, 검증 31/31 | `scripts/sgg2025/`, `data/derived/sgg2025/` |
| 단위 레지스트리·시점별 레이어(2-1, 2-3 목록) | 완료, 검증 20/20 | `scripts/region_registry/`, `data/derived/region-registry/` |
| 집계구 경계 2025·통계 2024 (P3) | 완료: 108,510개, 전국 인구 공표치와 차이 0 | `data/raw/sgis/oa-2025/`, `data/manifests/sgis-oa-2025.json` |
| 변경 사건 (P1) | 완료, 검증 9/9, KIRD 11/11(1건 범위 밖) | `scripts/region_registry/build_events.py`, `data/derived/region-registry/events.csv` |
| 레이어 경계 (P2) | 완료, 57개 레이어 차이 모두 설명(기초 단위 19/19 일치), 레지스트리 검증 23/23 | `scripts/region_registry/build_layer_boundaries.py`, `data/derived/region-registry/layer_boundaries.csv` |
| 레이어별 코드 대응 (P5) | 완료, 검증 10/10. 2025 시군구 252쌍 공식 연계정보와 일치, 2026-10-01은 공식 코드로 대체 | `scripts/region_registry/build_code_map_layers.py`, `data/derived/region-registry/code_map_layers.csv` |
| 연결표·인구 가중 (P4) | 완료, 검증 23/23(P6에서 부천 일반구 폐지·부활 보정). v0.2와 3,656행 일치(몫 차이 0), 서울 v0.1과 99.7% 일치. 인구 가중은 2015·2020·2024 집계구 인구 | `scripts/region_registry/build_crosswalk.py`, `crosswalk_chain.py`, `data/derived/region-registry/crosswalk/` |
| 시군구 연결표 패키지 v0.3 (P6) | 완료, 패키지 검증 40/40(R 비교는 CI에서). 기초 단위 229, 2008–2025, 면적·인구 몫, 통계청 코드 | `packages/kr-sgg-crosswalk/`, `scripts/region_registry/build_sgg_package.py` |
| 그 밖(P7 Atlas 반영, P8 CI·배포) | 미착수 | 아래 |

## 작업 묶음

각 묶음은 하나의 세션(또는 한 번의 작업)으로 끝낼 수 있는 크기다. 화살표는 선행 관계.

| 묶음 | 내용 | 선행 | 만지는 파일 | 크기 |
|---|---|---|---|---|
| **P0 체크포인트** | 지금까지 결과 커밋 | – | 기존 산출물 | 소 |
| **P1 변경 사건** (2-2) | 같은 날 말소·생성 코드 묶기, `recode`/`rename`/`merge`/`split` 분류(이름 기준 1차), KIRD 88건 방향 대조(2-6) | 레지스트리 | `scripts/region_registry/events.py`, `data/derived/region-registry/events*` | 중 |
| **P2 경계 버전** (2-3 경계) | admdongkor로 연말 경계 버전 받기·캐시, 레이어 단위 집합 = 경계 단위 집합 검증 | 레지스트리 | `scripts/region_registry/boundaries.py`, `data/raw/admdongkor/` | 중 |
| **P3 집계구 마무리** | 병합(`fetch_sgis_oa.py merge`), 전체 대조(`check --write`), receipt·문서 | 수집 완료 | `scripts/sgg2025/fetch_sgis_oa.py`, `data/manifests/sgis-oa-2025.json` | 소 |
| **P4 연결표** (2-4) | 이웃 시점 엣지(면적 가중 + 잡음 규칙 + 사건 없는 단위 1:1), 임의 두 시점 이어 붙이기, 인구 가중 `w_pop` | P1, P2, P3 | `scripts/region_registry/crosswalk.py` | 대 |
| **P5 코드 대응** (2-5) | 레이어별 통계청·고용조사·7자리 코드 대응, 국가데이터처 연계정보 대조 | 레지스트리, P2 | `scripts/region_registry/code_map.py` | 중 |
| **P6 패키지 v0.3** (3) | 연결표 패키지를 레지스트리 기반으로 재생성, 2025 표·서울 패키지 연결 | P4 | `packages/` | 중 |
| **P7 Atlas KR 반영** (5) | TS 타입 3종, 데이터셋 목록 6개, CSV/Parquet 읽기 코드 | 파일 형식 확정(P1·P4 스키마) | `lib/atlas-registry/`, `lib/atlas-data/` | 중 |
| **P8 CI·배포** | `py_compile`, 산출물만으로 도는 검증, R 비교는 CI에서만, GPKG를 GitHub Release로 | P6 | `.github/workflows/ci.yml` | 소 |

## 순서

```
P0 ─┬─ P1 ─┐
    ├─ P2 ─┼─ P4 ─ P6 ─ P8
    ├─ P3 ─┘
    └─ P5 (P2 뒤)        P7 (P1·P4 스키마 뒤, 다른 묶음과 파일이 겹치지 않음)
```

- 동시에 돌릴 수 있는 것: P1·P2·P3(파일이 겹치지 않음), 그다음 P5·P7.
- 순서대로 해야 하는 것: P4는 P1·P2·P3 뒤, P6은 P4 뒤.

## 사용 한도

2026-10-22 현재 5시간 한도 76%(약 1시간 50분 뒤 초기화). 병렬 세션은 한도를 빨리 쓰므로, 한도가 초기화되기 전에는 이 세션에서 P0 → P3 → P1을 순서대로 하고, 초기화 뒤 P2·P5·P7을 병렬로 나누는 것을 권한다.
