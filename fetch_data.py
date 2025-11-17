#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# dependencies = [
#   "pandas>=2.0.0",
#   "huggingface_hub>=0.23.0",
# ]
# ///

"""
Fetch Anthropic/EconomicIndex and build compact countries_all.json and states_all.json.

Run with uv (no manual env setup):
  uv run fetch_data.py [--repo-id Anthropic/EconomicIndex] [--local-dir Anthropic_EconomicIndex]
                       [--release release_YYYY_MM_DD] [--output-dir ./output]
                       [--min-observations 50] [--top-topics 10] [--compact]

Notes
- Single-file, schema-tolerant. Works best with enriched output CSVs in the dataset.
- If enriched CSVs are not present, it falls back to any CSV in release/data/output.
- Produces two JSON files with a concise schema ready for front-end use.
- Pretty (indented) JSON is default. Use --compact for minified files.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional

import pandas as pd
from huggingface_hub import snapshot_download


# --------------------------- minimal logging helpers ---------------------------


def log(msg: str) -> None:
    print(msg, file=sys.stderr)


def info(msg: str) -> None:
    log(f"[INFO] {msg}")


def ok(msg: str) -> None:
    log(f"[OK]   {msg}")


def warn(msg: str) -> None:
    log(f"[WARN] {msg}")


def err(msg: str) -> None:
    log(f"[ERR]  {msg}")


# ------------------------------ small utilities -------------------------------


def natural_sort_key(s: str):
    return tuple(int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s))


def parse_date_series(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series, errors="coerce")


def find_column(df: pd.DataFrame, candidates: Iterable[str]) -> Optional[str]:
    lower_map = {c.lower(): c for c in df.columns}
    for cand in candidates:
        if cand.lower() in lower_map:
            return lower_map[cand.lower()]
    return None


def normalize_string_series(s: pd.Series) -> pd.Series:
    return s.astype(str).str.strip()


def write_json(path: Path, obj, pretty: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        if pretty:
            json.dump(obj, f, ensure_ascii=False, indent=2)
        else:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def read_csv_safe(path: Path) -> pd.DataFrame:
    info(f"Reading: {path}")
    return pd.read_csv(path, low_memory=False)


def find_latest_release(root: Path) -> Path:
    candidates = sorted((p for p in root.glob("release_*") if p.is_dir()), key=lambda p: natural_sort_key(p.name))
    if not candidates:
        raise FileNotFoundError(f"No release_* directories found under {root}")
    return candidates[-1]


def find_enriched_csv(release_dir: Path) -> Path:
    out_dir = release_dir / "data" / "output"
    if not out_dir.exists():
        raise FileNotFoundError(f"Missing output dir: {out_dir}")
    candidates = list(out_dir.glob("*enriched*.csv")) or list(out_dir.glob("*.csv"))
    if not candidates:
        raise FileNotFoundError(f"No CSVs in {out_dir}")
    chosen = sorted(candidates, key=lambda p: natural_sort_key(p.name))[-1]
    info(f"Selected CSV: {chosen}")
    return chosen


def read_iso_metadata(release_dir: Path) -> Optional[pd.DataFrame]:
    iso_path = release_dir / "data" / "intermediate" / "iso_country_codes.csv"
    if iso_path.exists():
        try:
            return read_csv_safe(iso_path)
        except Exception as e:  # noqa: BLE001
            warn(f"Failed reading {iso_path}: {e}")
    return None


# --------------------------- light schema detection ---------------------------


@dataclass
class Schema:
    geo_id: Optional[str]
    geo_name: Optional[str]
    geography: Optional[str]
    country_code: Optional[str]
    country_name: Optional[str]
    state_code: Optional[str]
    state_name: Optional[str]
    facet: Optional[str]
    variable: Optional[str]
    value: Optional[str]
    cluster_name: Optional[str]
    level: Optional[str]
    date_end: Optional[str]
    usage_index: Optional[str]
    usage_count: Optional[str]
    topic: Optional[str]
    request_pct: Optional[str]
    request_pct_index: Optional[str]
    job_group: Optional[str]
    soc_pct: Optional[str]


def detect_schema(df: pd.DataFrame) -> Schema:
    s = Schema(
        geo_id=find_column(df, ["geo_id", "geography_id"]),
        geo_name=find_column(df, ["geo_name", "geography", "name", "geography_name"]),
        geography=find_column(df, ["geography", "geo_category"]),
        country_code=find_column(df, ["country_code", "iso2", "iso_alpha2", "iso_alpha_2", "country_iso2", "country_iso_2"]),
        country_name=find_column(df, ["country", "country_name", "geo_name", "geography", "name"]),
        state_code=find_column(df, ["state_code", "admin1_code", "subregion1_code", "region1_code", "state", "us_state_code", "iso_3166_2"]),
        state_name=find_column(df, ["state_name", "admin1_name", "subregion1_name", "region1_name", "state", "us_state"]),
        facet=find_column(df, ["facet", "dimension"]),
        variable=find_column(df, ["variable", "metric"]),
        value=find_column(df, ["value", "val"]),
        cluster_name=find_column(df, ["cluster_name", "cluster", "label", "topic_label"]),
        level=find_column(df, ["level", "aggregation_level", "stat_level"]),
        date_end=find_column(df, ["date_end", "end_date", "period_end", "as_of"]),
        usage_index=find_column(df, ["usage_per_capita_index", "usage_pc_index", "usage_index"]),
        usage_count=find_column(df, ["usage_count", "count", "total_requests"]),
        topic=find_column(df, ["request_category", "topic", "topic_name", "category"]),
        request_pct=find_column(df, ["request_pct", "topic_pct", "category_pct"]),
        request_pct_index=find_column(df, ["request_pct_index", "topic_pct_index", "category_pct_index"]),
        job_group=find_column(df, ["soc", "soc_group", "job_group", "occupation_group"]),
        soc_pct=find_column(df, ["soc_pct", "job_group_pct", "occupation_pct"]),
    )
    for k, v in s.__dict__.items():
        info(f"Schema: {k:>18} -> {v}")
    return s


# ------------------------------ core transforms ------------------------------


def latest_overall(df: pd.DataFrame, schema: Schema, kind: str) -> pd.DataFrame:
    dfc = df.copy()
    id_col = (schema.country_code if kind == "country" else schema.state_code) or schema.geo_id or (schema.country_name if kind == "country" else schema.state_name) or schema.geo_name
    name_col = (schema.country_name if kind == "country" else schema.state_name) or schema.geo_name
    if not id_col and not name_col:
        raise ValueError(f"Cannot locate id/name columns for kind={kind}")

    if id_col in dfc.columns:
        dfc[id_col] = normalize_string_series(dfc[id_col])
    if name_col in dfc.columns:
        dfc[name_col] = normalize_string_series(dfc[name_col])

    # Prefer level==0 (overall)
    if schema.level and schema.level in dfc.columns:
        dfc = dfc[pd.to_numeric(dfc[schema.level], errors="coerce").eq(0)]

    date_col = schema.date_end
    if date_col and date_col in dfc.columns:
        dfc[date_col] = parse_date_series(dfc[date_col])
    else:
        date_col = "__date__"
        dfc[date_col] = pd.Timestamp("1970-01-01")

    # Filter by facet if present
    if schema.facet and schema.facet in dfc.columns:
        facet_val = "country" if kind == "country" else "state_us"
        mask = dfc[schema.facet].astype(str).str.lower().eq(facet_val)
        if mask.any():
            dfc = dfc[mask]

    # Long-format pivot if variable/value present
    if schema.variable and schema.value and schema.variable in dfc.columns and schema.value in dfc.columns:
        key_cols = [c for c in [id_col, name_col] if c]
        last = dfc.groupby(key_cols, as_index=False)[date_col].max().rename(columns={date_col: "last_updated"})
        tmp = dfc.merge(last, on=key_cols, how="inner")
        tmp = tmp[tmp[date_col] == tmp["last_updated"]]
        pivot = tmp.pivot_table(index=key_cols, columns=schema.variable, values=schema.value, aggfunc="first").reset_index()
        pivot.columns = [str(c) for c in pivot.columns]
        latest = pivot.copy()
        if "usage_per_capita_index" in latest.columns:
            latest.rename(columns={"usage_per_capita_index": "usage_index"}, inplace=True)
        elif schema.usage_index and schema.usage_index in latest.columns:
            latest.rename(columns={schema.usage_index: "usage_index"}, inplace=True)
        if "usage_count" in latest.columns:
            latest.rename(columns={"usage_count": "total_observations"}, inplace=True)
        elif schema.usage_count and schema.usage_count in latest.columns:
            latest.rename(columns={schema.usage_count: "total_observations"}, inplace=True)
        if "last_updated" in latest.columns:
            latest["last_updated"] = pd.to_datetime(latest["last_updated"], errors="coerce").astype(str)
    else:
        cols = {c for c in [id_col, name_col, schema.usage_index, schema.usage_count, schema.date_end] if c}
        latest = (
            dfc.sort_values([id_col or name_col, date_col]).groupby(id_col or name_col, as_index=False).tail(1)[list(cols)]
        )
        latest.rename(columns={
            (schema.usage_index or ""): "usage_index",
            (schema.usage_count or ""): "total_observations",
            (schema.date_end or ""): "last_updated",
        }, inplace=True)

    if "usage_index" in latest.columns:
        latest["usage_index"] = pd.to_numeric(latest["usage_index"], errors="coerce")
    if "total_observations" in latest.columns:
        latest["total_observations"] = pd.to_numeric(latest["total_observations"], errors="coerce").fillna(0).astype(int)
    if "last_updated" in latest.columns:
        latest["last_updated"] = pd.to_datetime(latest["last_updated"], errors="coerce").astype(str)

    latest.rename(columns={id_col: "id", name_col: "name"}, inplace=True)
    # Ensure both id and name are present
    if "id" not in latest.columns and "name" in latest.columns:
        latest["id"] = latest["name"]
    if "name" not in latest.columns and "id" in latest.columns:
        latest["name"] = latest["id"]
    latest = latest[[c for c in ["id", "name", "usage_index", "total_observations", "last_updated"] if c in latest.columns]]
    return latest.drop_duplicates(subset=[c for c in ["id", "name"] if c in latest.columns])


def compute_rank(df: pd.DataFrame) -> pd.DataFrame:
    if "usage_index" in df.columns:
        df = df.sort_values("usage_index", ascending=False).reset_index(drop=True)
        df["usage_rank"] = df.index + 1
    return df


def privacy_flag(df: pd.DataFrame, threshold: int) -> pd.DataFrame:
    if "total_observations" in df.columns:
        df["privacy_flag"] = (df["total_observations"] < int(threshold)).astype(bool)
    return df


def top_topics(df: pd.DataFrame, schema: Schema, kind: str, top_k: int = 10) -> dict:
    out: dict = {}

    # Preferred: long-format with cluster_name/variable/value + facet + geography
    if all([
        schema.cluster_name, schema.variable, schema.value, schema.facet, schema.geography
    ]) and all(col in df.columns for col in [schema.cluster_name, schema.variable, schema.value, schema.facet, schema.geography]):
        target_geo = "country" if kind == "country" else "state_us"
        dft = df[(df[schema.facet] == "request") & (df[schema.geography] == target_geo)].copy()
        if dft.empty:
            return {}
        dft[schema.cluster_name] = dft[schema.cluster_name].astype(str)
        dft = dft[~dft[schema.cluster_name].str.lower().str.contains("not_classified")]

        id_col = schema.geo_id or (schema.country_code or schema.country_name if kind == "country" else schema.state_code or schema.state_name)
        if not id_col or id_col not in dft.columns:
            return {}

        pivot = dft.pivot_table(index=[id_col, schema.cluster_name], columns=schema.variable, values=schema.value, aggfunc="first").reset_index()
        for col in ["request_pct", "request_pct_index"]:
            if col in pivot.columns:
                pivot[col] = pd.to_numeric(pivot[col], errors="coerce")
        for gid, grp in pivot.groupby(id_col):
            mf = []
            md = []
            if "request_pct" in grp.columns:
                top_pct = grp.sort_values("request_pct", ascending=False).head(top_k)
                mf = [{"topic": r[schema.cluster_name], "pct": float(r["request_pct"]) if pd.notna(r["request_pct"]) else None} for _, r in top_pct.iterrows()]
            if "request_pct_index" in grp.columns:
                top_idx = grp.sort_values("request_pct_index", ascending=False).head(top_k)
                md = [{"topic": r[schema.cluster_name], "index": float(r["request_pct_index"]) if pd.notna(r["request_pct_index"]) else None} for _, r in top_idx.iterrows()]
            out[str(gid)] = {"most_frequent_topics": mf, "most_distinctive_topics": md}
        return out

    # Fallback: wide format
    topic_col = schema.topic
    pct_col = schema.request_pct
    idx_col = schema.request_pct_index
    if not topic_col or (not pct_col and not idx_col):
        return {}
    dfc = df[df[topic_col].notna()].copy()
    dfc[topic_col] = dfc[topic_col].astype(str)
    dfc = dfc[~dfc[topic_col].str.lower().str.contains("not_classified")]

    id_col = (schema.country_code if kind == "country" else schema.state_code) or (schema.country_name if kind == "country" else schema.state_name)
    if not id_col:
        return {}
    dfc[id_col] = dfc[id_col].astype(str)
    if pct_col and pct_col in dfc.columns:
        dfc[pct_col] = pd.to_numeric(dfc[pct_col], errors="coerce")
    if idx_col and idx_col in dfc.columns:
        dfc[idx_col] = pd.to_numeric(dfc[idx_col], errors="coerce")
    for gid, grp in dfc.groupby(id_col):
        mf = []
        md = []
        if pct_col and pct_col in grp.columns:
            top_pct = grp.sort_values(pct_col, ascending=False).head(top_k)
            mf = [{"topic": r[topic_col], "pct": float(r[pct_col]) if pd.notna(r[pct_col]) else None} for _, r in top_pct.iterrows()]
        if idx_col and idx_col in grp.columns:
            top_idx = grp.sort_values(idx_col, ascending=False).head(top_k)
            md = [{"topic": r[topic_col], "index": float(r[idx_col]) if pd.notna(r[idx_col]) else None} for _, r in top_idx.iterrows()]
        out[str(gid)] = {"most_frequent_topics": mf, "most_distinctive_topics": md}
    return out


def job_groups(df: pd.DataFrame, schema: Schema, kind: str) -> dict:
    out: dict = {}

    # Preferred: long-format facet 'soc_occupation' with variable 'soc_pct'
    if all([schema.facet, schema.variable, schema.value, schema.cluster_name, schema.geography]) and all(
        col in df.columns for col in [schema.facet, schema.variable, schema.value, schema.cluster_name, schema.geography]
    ):
        target_geo = "country" if kind == "country" else "state_us"
        dfx = df[(df[schema.facet] == "soc_occupation") & (df[schema.variable] == "soc_pct") & (df[schema.geography] == target_geo)].copy()
        if not dfx.empty:
            dfx[schema.cluster_name] = dfx[schema.cluster_name].astype(str)
            dfx = dfx[~dfx[schema.cluster_name].str.lower().str.contains("not_classified")]
            id_col = schema.geo_id or (schema.country_code or schema.country_name if kind == "country" else schema.state_code or schema.state_name)
            if id_col and id_col in dfx.columns:
                dfx[schema.value] = pd.to_numeric(dfx[schema.value], errors="coerce")
                for gid, grp in dfx.groupby(id_col):
                    grp_sorted = grp.sort_values(schema.value, ascending=False)
                    rows = [{"group": r[schema.cluster_name], "pct": float(r[schema.value]) if pd.notna(r[schema.value]) else None} for _, r in grp_sorted.iterrows()]
                    out[str(gid)] = rows
                return out

    # Fallback: wide format using job_group/soc_pct
    if not (schema.job_group and schema.soc_pct):
        return {}
    dfc = df[df[schema.job_group].notna()].copy()
    dfc[schema.job_group] = dfc[schema.job_group].astype(str)
    dfc = dfc[~dfc[schema.job_group].str.lower().str.contains("not_classified")]
    id_col = (schema.country_code if kind == "country" else schema.state_code) or (schema.country_name if kind == "country" else schema.state_name)
    if not id_col:
        return {}
    dfc[id_col] = dfc[id_col].astype(str)
    dfc[schema.soc_pct] = pd.to_numeric(dfc[schema.soc_pct], errors="coerce")
    for gid, grp in dfc.groupby(id_col):
        rows = [{"group": r[schema.job_group], "pct": float(r[schema.soc_pct]) if pd.notna(r[schema.soc_pct]) else None} for _, r in grp.sort_values(schema.soc_pct, ascending=False).iterrows()]
        out[str(gid)] = rows
    return out


def to_records(df: pd.DataFrame) -> list[dict]:
    return [
        {k: (None if pd.isna(v) else (float(v) if isinstance(v, (float, int)) and k != "total_observations" else v)) for k, v in row.items()}
        for row in df.to_dict(orient="records")
    ]


def attach_details(objs: list[dict], topics_map: dict, jobs_map: dict) -> None:
    index_by_id = {str(o.get("id")): o for o in objs if o.get("id") is not None}
    index_by_name = {str(o.get("name")): o for o in objs if o.get("name") is not None}
    # Topics
    for gid, payload in topics_map.items():
        o = index_by_id.get(str(gid)) or index_by_name.get(str(gid))
        if not o:
            continue
        if payload.get("most_frequent_topics"):
            o["most_frequent_topics"] = payload["most_frequent_topics"]
        if payload.get("most_distinctive_topics"):
            o["most_distinctive_topics"] = payload["most_distinctive_topics"]
    # Jobs
    for gid, job_list in jobs_map.items():
        o = index_by_id.get(str(gid)) or index_by_name.get(str(gid))
        if not o:
            continue
        if job_list:
            o["job_groups"] = job_list


def add_region(countries_df: pd.DataFrame, iso_df: Optional[pd.DataFrame]) -> pd.DataFrame:
    if iso_df is None:
        return countries_df
    code_col = find_column(iso_df, ["iso2", "iso_alpha2", "iso_alpha_2", "country_code"])
    region_col = find_column(iso_df, ["region", "world_region", "continent"])
    if not code_col or not region_col:
        return countries_df
    left_key = "id" if "id" in countries_df.columns else "name"
    if left_key not in countries_df.columns:
        return countries_df
    merged = countries_df.merge(iso_df[[code_col, region_col]].drop_duplicates(), left_on=left_key, right_on=code_col, how="left")
    merged.rename(columns={region_col: "region"}, inplace=True)
    merged.drop(columns=[code_col], inplace=True, errors="ignore")
    return merged


# ------------------------------ final formatting ------------------------------


def _date_ymd(s: object) -> Optional[str]:
    if s is None:
        return None
    try:
        return str(pd.to_datetime(s, errors="coerce").date())
    except Exception:
        try:
            st = str(s)
            return st[:10] if st else None
        except Exception:
            return None


def _first_present(d: dict, keys: list[str]):
    for k in keys:
        if k is None:
            continue
        v = d.get(str(k))
        if v is not None:
            return v
    return None


def _topics_payload_to_demo(payload: dict, kind: str) -> tuple[object, object]:
    mf_raw = payload.get("most_frequent_topics") or []
    md_raw = payload.get("most_distinctive_topics") or []
    mf = (
        [
            {"rank": i + 1, "text": r.get("topic"), "share": r.get("pct")}
            for i, r in enumerate(mf_raw)
            if r.get("topic") is not None
        ]
        if mf_raw
        else []
    )
    md = (
        [
            {"rank": i + 1, "text": r.get("topic"), "index": r.get("index")}
            for i, r in enumerate(md_raw)
            if r.get("topic") is not None
        ]
        if md_raw
        else []
    )
    return ({} if not mf else mf, {} if not md else md)


def _jobs_payload_to_demo_countries(jobs_list: Optional[list[dict]]) -> object:
    if not jobs_list:
        return {}
    top = jobs_list[0]
    return {"name": top.get("group"), "share": top.get("pct")}


def _jobs_payload_to_demo_states(jobs_list: Optional[list[dict]]) -> object:
    if not jobs_list:
        return {}
    return [{"name": r.get("group"), "share": r.get("pct")} for r in jobs_list]


def _build_iso_maps(iso_df: Optional[pd.DataFrame]) -> tuple[dict, dict]:
    if iso_df is None:
        return {}, {}
    iso2_col = find_column(iso_df, ["iso2", "iso_alpha2", "iso_alpha_2", "country_iso2", "country_code"])  # country_code may be iso2 in some files
    iso3_col = find_column(iso_df, ["iso3", "iso_alpha3", "iso_alpha_3", "country_iso3"])
    if not iso2_col or not iso3_col:
        return {}, {}
    iso3_from_iso2 = {}
    iso2_from_iso3 = {}
    for _, r in iso_df[[iso2_col, iso3_col]].dropna().iterrows():
        iso2 = str(r[iso2_col]).strip()
        iso3 = str(r[iso3_col]).strip()
        if iso2:
            iso3_from_iso2[iso2] = iso3
        if iso3:
            iso2_from_iso3[iso3] = iso2
    return iso3_from_iso2, iso2_from_iso3


def _int_if_whole(x: Optional[float]) -> Optional[float | int]:
    if x is None:
        return None
    try:
        xv = float(x)
        if abs(xv - round(xv)) < 1e-12:
            return int(round(xv))
        return xv
    except Exception:
        return x  # leave as-is


def format_countries(
    countries_df: pd.DataFrame,
    iso_df: Optional[pd.DataFrame],
    topics_map: dict,
    jobs_map: dict,
    release_end: Optional[str] = None,
) -> list[dict]:
    iso3_from_iso2, iso2_from_iso3 = _build_iso_maps(iso_df)
    records: list[dict] = []
    for _, r in countries_df.iterrows():
        rid = r.get("id")
        name = r.get("name")
        rid_str = str(rid) if pd.notna(rid) else None
        iso2 = None
        iso3 = None
        if rid_str:
            if len(rid_str) == 2:
                iso2 = rid_str
                iso3 = iso3_from_iso2.get(rid_str)
            elif len(rid_str) == 3:
                iso3 = rid_str
                iso2 = iso2_from_iso3.get(rid_str)

        # topics/jobs payloads can be keyed by id or name
        payload = _first_present(topics_map, [rid_str, name, iso2, iso3]) or {}
        mf, md = _topics_payload_to_demo(payload, kind="country")
        jobs_list = _first_present(jobs_map, [rid_str, name, iso2, iso3])

        # Countries job_groups: match original behavior
        # - if none -> {}
        # - if exactly one -> object {name, share}
        # - if many -> array of {name, share}
        if not jobs_list:
            job_val: object = {}
        elif isinstance(jobs_list, list) and len(jobs_list) == 1:
            job_val = {"name": jobs_list[0].get("group"), "share": jobs_list[0].get("pct")}
        else:
            job_val = [{"name": j.get("group"), "share": j.get("pct")} for j in (jobs_list or [])]

        rec = {
            "country_code": iso3 or rid_str or (name if isinstance(name, str) else None),
            "country": name,
            "usage_rank": int(r.get("usage_rank")) if pd.notna(r.get("usage_rank")) else None,
            "usage_index": _int_if_whole(float(r.get("usage_index")) if pd.notna(r.get("usage_index")) else None),
            "total_observations": int(r.get("total_observations")) if pd.notna(r.get("total_observations")) else 0,
            "last_updated": _date_ymd(r.get("last_updated")) or release_end,
            "region": r.get("region") if ("region" in countries_df.columns) else None,
            # Original demo has iso2 null. Keep null to match exactly.
            "iso2": None,
            "privacy_flag": bool(r.get("privacy_flag")) if pd.notna(r.get("privacy_flag")) else None,
            "most_frequent_topics": mf,
            "most_distinctive_topics": md,
            "job_groups": job_val,
        }
        records.append(rec)
    # Sort by country_code then country
    records.sort(key=lambda x: (str(x.get("country_code") or ""), str(x.get("country") or "")))
    return records


def format_states(
    states_df: pd.DataFrame,
    topics_map: dict,
    jobs_map: dict,
    release_end: Optional[str] = None,
) -> list[dict]:
    records: list[dict] = []
    for _, r in states_df.iterrows():
        rid = r.get("id")
        name = r.get("name")
        rid_str = str(rid) if pd.notna(rid) else None

        payload = _first_present(topics_map, [rid_str, name]) or {}
        mf, md = _topics_payload_to_demo(payload, kind="state")
        jobs_list = _first_present(jobs_map, [rid_str, name])
        jobs_val = _jobs_payload_to_demo_states(jobs_list)

        rec = {
            "state_code": rid_str or (name if isinstance(name, str) else None),
            "state": name,
            "usage_rank": int(r.get("usage_rank")) if pd.notna(r.get("usage_rank")) else None,
            "usage_index": _int_if_whole(float(r.get("usage_index")) if pd.notna(r.get("usage_index")) else None),
            "total_observations": int(r.get("total_observations")) if pd.notna(r.get("total_observations")) else 0,
            "last_updated": _date_ymd(r.get("last_updated")) or release_end,
            "privacy_flag": bool(r.get("privacy_flag")) if pd.notna(r.get("privacy_flag")) else None,
            "most_frequent_topics": mf,
            "most_distinctive_topics": md,
            "job_groups": jobs_val,
        }
        records.append(rec)
    records.sort(key=lambda x: (str(x.get("state_code") or ""), str(x.get("state") or "")))
    return records


# ------------------------------------ main ------------------------------------


def build(
    repo_id: str,
    local_dir: Path,
    release: Optional[str],
    output_dir: Optional[Path],
    min_obs: int,
    top_topics_n: int,
    pretty: bool = False,
) -> tuple[Path, Path]:
    # Download snapshot
    local_dir.mkdir(parents=True, exist_ok=True)
    info(f"Downloading snapshot: {repo_id} -> {local_dir}")
    snap = snapshot_download(
        repo_id=repo_id,
        repo_type="dataset",
        local_dir=str(local_dir),
        local_dir_use_symlinks=False,
    )
    ok(f"Snapshot at: {snap}")

    root = Path(snap)
    release_dir = root / release if release else find_latest_release(root)
    info(f"Using release: {release_dir}")

    csv_path = find_enriched_csv(release_dir)
    df = read_csv_safe(csv_path)
    schema = detect_schema(df)

    # Core aggregates
    countries_df = latest_overall(df, schema, kind="country")
    states_df = latest_overall(df, schema, kind="state")

    countries_df = compute_rank(countries_df)
    states_df = compute_rank(states_df)
    countries_df = privacy_flag(countries_df, min_obs)
    states_df = privacy_flag(states_df, min_obs)

    # Optional region from iso metadata
    iso_df = read_iso_metadata(release_dir)
    countries_df = add_region(countries_df, iso_df)

    # Topics and jobs
    topics_c = top_topics(df, schema, kind="country", top_k=top_topics_n)
    topics_s = top_topics(df, schema, kind="state", top_k=top_topics_n)
    jobs_c = job_groups(df, schema, kind="country")
    jobs_s = job_groups(df, schema, kind="state")

    # Derive release end date for fallback when per-geo last_updated is missing
    release_end = None
    try:
        # Try to compute from data first
        if schema.date_end and schema.date_end in df.columns:
            de = pd.to_datetime(df[schema.date_end], errors="coerce")
            if de.notna().any():
                release_end = str(de.max().date())
        if not release_end:
            # Parse from CSV name like ..._YYYY-MM-DD_to_YYYY-MM-DD.csv
            m = re.search(r"to_(\d{4}-\d{2}-\d{2})", str(csv_path))
            if m:
                release_end = m.group(1)
    except Exception:
        pass

    # Assemble final outputs matching demo structure
    countries_objs = format_countries(countries_df, iso_df, topics_c, jobs_c, release_end=release_end)
    states_objs = format_states(states_df, topics_s, jobs_s, release_end=release_end)

    # Output directory (write next to running script / current working dir by default)
    if output_dir is None:
        out_dir = Path.cwd()
    else:
        out_dir = output_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    countries_path = out_dir / "countries_all.json"
    states_path = out_dir / "states_all.json"
    write_json(countries_path, countries_objs, pretty=pretty)
    write_json(states_path, states_objs, pretty=pretty)
    return countries_path, states_path


def main() -> int:
    p = argparse.ArgumentParser(description="Fetch dataset and build compact JSON outputs")
    p.add_argument("--repo-id", default="Anthropic/EconomicIndex", help="Hugging Face dataset repo id")
    p.add_argument("--local-dir", default="Anthropic_EconomicIndex", help="Local dataset directory")
    p.add_argument("--release", default="", help="release_YYYY_MM_DD to use (default: latest)")
    p.add_argument("--output-dir", default="", help="Custom output directory (default: current directory)")
    p.add_argument("--min-observations", type=int, default=50, help="Privacy threshold for total_observations")
    p.add_argument("--top-topics", type=int, default=10, help="Top N topics to include")
    p.add_argument("--compact", action="store_true", help="Write compact JSON without indentation (minified)")
    args = p.parse_args()

    repo_id = args.repo_id
    local_dir = Path(args.local_dir)
    release = args.release.strip() or None
    output_dir = Path(args.output_dir).resolve() if args.output_dir.strip() else None
    min_obs = int(args.min_observations)
    top_topics_n = int(args.top_topics)

    try:
        # Default is pretty unless --compact is provided
        c_path, s_path = build(
            repo_id,
            local_dir,
            release,
            output_dir,
            min_obs,
            top_topics_n,
            pretty=(not bool(args.compact)),
        )
        ok(f"countries_all.json: {c_path}")
        ok(f"states_all.json:    {s_path}")
        # Remove the dataset folder after building
        try:
            import shutil, os, stat
            def _onerror(func, path, exc_info):
                try:
                    os.chmod(path, stat.S_IWRITE)
                    func(path)
                except Exception:
                    pass
            if local_dir.exists() and local_dir.is_dir():
                info(f"Deleting dataset folder: {local_dir}")
                shutil.rmtree(local_dir, onerror=_onerror, ignore_errors=True)
                ok(f"Deleted: {local_dir}")
        except Exception as de:
            warn(f"Failed to delete dataset folder '{local_dir}': {de}")
        return 0
    except Exception as e:  # noqa: BLE001
        err(str(e))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
