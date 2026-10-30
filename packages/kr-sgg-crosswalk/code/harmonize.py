"""연도별 시군구 통계를 기준 경계 시군구로 변환한다 (kr-sgg-crosswalk v0.3).

필요 패키지: pandas

예)
    import pandas as pd
    from harmonize import load_crosswalk, harmonize, check_totals

    cw = load_crosswalk("crosswalk/crosswalk_lgu_to_base20251231.csv")
    df = pd.read_csv("내_자료.csv", dtype={"code": str})   # year, code, 변수들
    panel = harmonize(df, cw, extensive=["pop"], intensive=["aged_pct"],
                      intensive_weight="pop", weights="pop")
"""
from __future__ import annotations

import warnings

import pandas as pd

CODE_COLS = ["src_code", "src_code10", "src_kostat", "tgt_code", "tgt_code10", "tgt_kostat",
             "code", "code10", "kostat", "lgu_code", "lgu_code10", "layer_date", "boundary_version"]
SRC_KEY = {"mois": "src_code", "mois10": "src_code10", "kostat": "src_kostat"}
WEIGHTS = {"area": ("w_src", "w_tgt"), "pop": ("w_src_pop", "w_tgt_pop")}


def _read(path) -> pd.DataFrame:
    if str(path).endswith(".parquet"):
        df = pd.read_parquet(path)
    else:
        df = pd.read_csv(path, dtype={c: str for c in CODE_COLS}, keep_default_na=False, na_values=[""])
    for c in CODE_COLS:
        if c in df.columns:
            df[c] = df[c].fillna("").astype(str)
    return df


def load_crosswalk(path) -> pd.DataFrame:
    return _read(path)


def load_units(path) -> pd.DataFrame:
    """units/{lgu,sgg}_units_by_year.csv"""
    return _read(path)


def to_lgu(data: pd.DataFrame, sgg_units: pd.DataFrame, *, year_col: str = "year", code_col: str = "code",
           code_system: str = "mois", sum_cols: list[str] | None = None) -> pd.DataFrame:
    """일반구 단위 자료를 기초자치단체(시) 단위로 합친다. 코드 앞자리를 자르지 않고
    units/sgg_units_by_year.csv의 소속(lgu_code)을 쓴다. 합계형 변수만 넣으세요.

    code_system  'mois'(5자리 행안부) 또는 'kostat'(5자리 통계청). 반환 코드는 행안부 5자리.
    """
    key = {"mois": "code", "kostat": "kostat"}[code_system]
    u = sgg_units[["year", key, "lgu_code"]].rename(columns={"year": year_col, key: code_col})
    u = u[u[code_col] != ""]
    d = data.copy()
    d[code_col] = d[code_col].astype(str).str.strip()
    d[year_col] = d[year_col].astype(int)
    u[year_col] = u[year_col].astype(int)
    m = d.merge(u, on=[year_col, code_col], how="left")
    if m.lgu_code.isna().any():
        bad = m[m.lgu_code.isna()][[year_col, code_col]].drop_duplicates().head(10).values.tolist()
        warnings.warn(f"소속 시군구를 찾지 못한 행 {int(m.lgu_code.isna().sum())}건 — 빠집니다. 예: {bad}")
        m = m[m.lgu_code.notna()]
    cols = sum_cols or [c for c in d.columns if c not in (year_col, code_col) and pd.api.types.is_numeric_dtype(d[c])]
    out = m.groupby([year_col, "lgu_code"], as_index=False)[cols].sum(min_count=1)
    return out.rename(columns={"lgu_code": code_col})


def harmonize(data: pd.DataFrame, crosswalk: pd.DataFrame, *,
              year_col: str = "year", code_col: str = "code", code_system: str = "mois",
              extensive: list[str] | None = None,
              intensive: list[str] | None = None,
              intensive_weight: str | None = None,
              weights: str = "area") -> pd.DataFrame:
    """시군구 자료를 기준 경계로 변환.

    code_system      자료의 코드 체계: 'mois'(5자리 행안부, 기본), 'mois10', 'kostat'(5자리 통계청)
    extensive        합계형 변수(인구, 가구, 사업체 수 등). 원천 몫 w_src로 나눠 더한다.
    intensive        비율·평균형 변수(고령화율, 평균연령 등). 가중평균한다.
    intensive_weight 비율형 변수의 가중치로 쓸 합계형 변수(예: 인구). 없으면 대상 몫 w_tgt.
    weights          'area'(면적 몫 w_src·w_tgt, v0.2와 같음) 또는 'pop'(인구 몫 w_src_pop·w_tgt_pop).
                     나뉜 단위에만 차이가 난다. 인구 몫은 사건 시점에 가까운 인구총조사(2015·2020·2024)로
                     계산했으며, 변경 뒤 개발된 땅(예: 2012 공주시 → 세종)은 몫이 커 보일 수 있다.

    반환: year, tgt_code, tgt_sidonm, tgt_name, 변수들, 품질 지표
      n_src          기준 단위 하나를 만든 원천 단위 수
      alloc_share    값 중 단위를 나눈 경로(method = area_split)로 들어온 몫 (0이면 나눈 것 없음)
    """
    extensive = list(extensive or [])
    intensive = list(intensive or [])
    if not extensive and not intensive:
        raise ValueError("extensive 또는 intensive 변수를 하나 이상 지정하세요.")
    if intensive_weight and intensive_weight not in data.columns:
        raise ValueError(f"intensive_weight '{intensive_weight}' 열이 자료에 없습니다.")
    if code_system not in SRC_KEY:
        raise ValueError(f"code_system은 {list(SRC_KEY)} 중 하나입니다.")
    if weights not in WEIGHTS:
        raise ValueError(f"weights는 {list(WEIGHTS)} 중 하나입니다.")
    ws, wt = WEIGHTS[weights]
    src = SRC_KEY[code_system]

    d = data.copy()
    d[code_col] = d[code_col].astype(str).str.strip()
    d[year_col] = d[year_col].astype(int)

    cw = crosswalk.rename(columns={"year": year_col})
    cw = cw[cw[src] != ""]
    years_cw = set(cw[year_col].unique())
    bad_years = sorted(set(d[year_col]) - years_cw)
    if bad_years:
        raise ValueError(f"crosswalk에 없는 연도: {bad_years} (제공 연도: {min(years_cw)}–{max(years_cw)})")

    m = d.merge(cw, left_on=[year_col, code_col], right_on=[year_col, src], how="left", indicator=True)
    miss = m[m["_merge"] == "left_only"]
    if len(miss):
        sample = miss[[year_col, code_col]].drop_duplicates().head(10).values.tolist()
        hint = (" 통계청 코드라면 code_system='kostat'. 일반구가 있는 시의 통계청 시 코드는 기초 단위 연결표에 없으니"
                " 일반구 자료를 to_lgu()로 합치세요.") if code_system == "mois" else ""
        warnings.warn(f"crosswalk에서 찾지 못한 (연도, 코드) {len(miss)}건 — 결과에서 빠집니다. 예: {sample}. "
                      f"그 해 12월 31일 기준 코드인지 확인하세요.{hint}")
    m = m[m["_merge"] == "both"].drop(columns="_merge")
    m["_alloc"] = (m["method"] == "area_split").astype(float)

    keys = [year_col, "tgt_code", "tgt_sidonm", "tgt_name"]
    parts = []

    if extensive:
        ext = m[keys].copy()
        for v in extensive:
            ext[v] = m[v] * m[ws]
        ext["_alloc_val"] = m[extensive[0]] * m[ws] * m["_alloc"]
        parts.append(ext.groupby(keys, as_index=False).sum(min_count=1))

    if intensive:
        base_w = m[intensive_weight] * m[ws] if intensive_weight else m[wt]
        it = m[keys].copy()
        for v in intensive:
            ok = m[v].notna() & base_w.notna()
            it[f"_num_{v}"] = (m[v] * base_w).where(ok)
            it[f"_den_{v}"] = base_w.where(ok)
        g = it.groupby(keys, as_index=False).sum(min_count=1)
        for v in intensive:
            g[v] = g[f"_num_{v}"] / g[f"_den_{v}"]
        parts.append(g[keys + intensive])

    out = parts[0]
    for p in parts[1:]:
        out = out.merge(p, on=keys, how="outer")

    q = m.groupby(keys).agg(n_src=(src, "nunique")).reset_index()
    out = out.merge(q, on=keys, how="left")
    if extensive:
        denom = out[extensive[0]].where(out[extensive[0]] != 0)
        out["alloc_share"] = (out.pop("_alloc_val") / denom).fillna(0).round(4)
    else:
        a = m.groupby(keys)["_alloc"].max().rename("alloc_share").reset_index()
        out = out.merge(a, on=keys, how="left")
    return out.sort_values([year_col, "tgt_code"]).reset_index(drop=True)


def check_totals(data: pd.DataFrame, panel: pd.DataFrame, var: str,
                 year_col: str = "year") -> pd.DataFrame:
    """합계형 변수의 연도별 총합이 변환 전후로 같은지 확인."""
    a = data.groupby(year_col)[var].sum().rename("before")
    b = panel.groupby(year_col)[var].sum().rename("after")
    r = pd.concat([a, b], axis=1)
    r["diff_pct"] = ((r["after"] / r["before"] - 1) * 100).round(4)
    return r
