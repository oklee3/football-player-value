#############################################

# Imports from csv files to supabase
# Currently just uses basic stats from each standard_player file, can be expanded later

#############################################

import argparse
import csv
import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

REQUIRED_HEADERS = {
    "Player ID": "player_id",
    "Player": "player",
    "Nation": "nation",
    "Squad": "squad",
    "Age": "age",
    "Min": "minutes",
    "90s": "nineties",
    "Gls": "goals",
    "Ast": "assists",
}


def _parse_int(val: str):
    if val is None:
        return None
    val = val.strip()
    if not val:
        return None
    val = val.replace(",", "")
    if "-" in val:
        val = val.split("-", 1)[0]
    try:
        return int(float(val))
    except ValueError:
        return None


def _parse_float(val: str):
    if val is None:
        return None
    val = val.strip()
    if not val:
        return None
    val = val.replace(",", "")
    try:
        return float(val)
    except ValueError:
        return None


def _parse_nation(val: str, raw: bool):
    if val is None:
        return None
    val = val.strip()
    if not val:
        return None
    if raw:
        return val
    # FBref format is usually "us USA"; keep the country code (last token).
    parts = val.split()
    return parts[-1]


def _derive_league_season(folder_name: str) -> Tuple[str, str]:
    parts = folder_name.split("_")
    if len(parts) < 2:
        return folder_name, ""
    season = parts[-1]
    league = " ".join(parts[:-1])
    return league, season


def _iter_csv_rows(path: Path) -> Iterable[Dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        # First row is multi-index header group names; skip it.
        try:
            next(reader)
        except StopIteration:
            return
        try:
            header = next(reader)
        except StopIteration:
            return
        # Keep header length to align with rows; FBref sometimes leaves last header empty
        header_map = {}
        for idx, name in enumerate(header):
            if not name:
                continue
            if name in header_map:
                # Keep first occurrence (totals) and ignore later duplicates (per-90).
                continue
            header_map[name] = idx
        if "Player ID" not in header_map:
            # If header ends with empty cell, treat the last column as Player ID.
            if header and header[-1] == "":
                header_map["Player ID"] = len(header) - 1
            else:
                header_map["Player ID"] = len(header) - 1
        missing = [h for h in REQUIRED_HEADERS if h not in header_map]
        if missing:
            raise ValueError(f"Missing required headers {missing} in {path}")
        for row in reader:
            if not row:
                continue
            row_dict = {}
            for name in REQUIRED_HEADERS:
                idx = header_map[name]
                row_dict[name] = row[idx] if idx < len(row) else ""
            yield row_dict


def _postgrest_upsert(
    url: str,
    key: str,
    table: str,
    rows: List[Dict],
    on_conflict: str,
):
    endpoint = f"{url.rstrip('/')}/rest/v1/{table}?on_conflict={on_conflict}"
    data = json.dumps(rows).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=data,
        method="POST",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            # Read to ensure request completes; ignore body.
            resp.read()
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        raise RuntimeError(f"Supabase error {e.code}: {body or e.reason}") from e


def main():
    parser = argparse.ArgumentParser(description="Import FBref standard_player.csv files into Supabase.")
    parser.add_argument(
        "--base-dir",
        default="fbref_player_stats_csv",
        help="Base directory containing season folders.",
    )
    parser.add_argument(
        "--table",
        default="player_seasons",
        help="Target table name.",
    )
    parser.add_argument("--batch-size", type=int, default=1000)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--nation-raw", action="store_true", help="Store nation field as-is.")
    args = parser.parse_args()

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    if not supabase_url or not supabase_key:
        print("Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) env vars.")
        sys.exit(1)

    base_dir = Path(args.base_dir)
    if not base_dir.exists():
        print(f"Base dir not found: {base_dir}")
        sys.exit(1)

    csv_paths = sorted(base_dir.glob("*/standard_player.csv"))
    if not csv_paths:
        print(f"No standard_player.csv files found under {base_dir}")
        sys.exit(1)

    total_rows = 0
    batch_map: Dict[Tuple[str, str, str], Dict] = {}

    for csv_path in csv_paths:
        league, season = _derive_league_season(csv_path.parent.name)
        for row in _iter_csv_rows(csv_path):
            record = {
                "player_id": row["Player ID"].strip(),
                "player": row["Player"].strip(),
                "season": season,
                "league": league,
                "squad": row["Squad"].strip(),
                "age": _parse_int(row["Age"]),
                "minutes": _parse_int(row["Min"]),
                "nineties": _parse_float(row["90s"]),
                "goals": _parse_int(row["Gls"]),
                "assists": _parse_int(row["Ast"]),
                "nation": _parse_nation(row["Nation"], args.nation_raw),
            }
            if not record["player_id"] or not record["season"] or not record["league"]:
                continue
            key = (record["player_id"], record["season"], record["league"])
            batch_map[key] = record
            total_rows += 1
            if len(batch_map) >= args.batch_size:
                if args.dry_run:
                    batch_map.clear()
                    continue
                _postgrest_upsert(
                    supabase_url,
                    supabase_key,
                    args.table,
                    list(batch_map.values()),
                    on_conflict="player_id,season,league",
                )
                batch_map.clear()

    if batch_map and not args.dry_run:
        _postgrest_upsert(
            supabase_url,
            supabase_key,
            args.table,
            list(batch_map.values()),
            on_conflict="player_id,season,league",
        )

    print(f"Processed {total_rows} rows across {len(csv_paths)} files.")


if __name__ == "__main__":
    main()
