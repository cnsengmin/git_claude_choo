"""예제: 연도별 시군구 자료 -> 2025-12-31 기준 기초자치단체 229개 패널.
패키지 폴더에서 실행: python examples/example.py
※ example_synthetic_input_lgu.csv의 값은 시연용 가상값입니다.
"""
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "code"))
from harmonize import check_totals, harmonize, load_crosswalk  # noqa: E402

cw = load_crosswalk(ROOT / "crosswalk" / "crosswalk_lgu_to_base20251231.csv")
df = pd.read_csv(ROOT / "examples" / "example_synthetic_input_lgu.csv", dtype={"code": str})
for w in ("area", "pop"):
    panel = harmonize(df, cw, extensive=["pop"], intensive=["aged_pct"], intensive_weight="pop", weights=w)
    print(f"[weights={w}]")
    print(panel.head(3))
    print(check_totals(df, panel, "pop").tail(3))
    print("연도별 기준 단위 수:", panel.groupby("year")["tgt_code"].nunique().unique())
    print("단위를 나눈 값이 섞인 관측치:", (panel["alloc_share"] > 0).sum())
    panel.to_csv(ROOT / "examples" / f"example_output_panel_python_{w}.csv", index=False, encoding="utf-8-sig")
