#!/usr/bin/env python3
"""
fetch_market.py — pull REAL market data for each neighborhood and cache it to
data/market.json, which generate.py reads at build time.

Source: Zillow Home Value Index (ZHVI), zip-code level, published free for
public use with attribution at https://www.zillow.com/research/data/.
We do NOT scrape Zillow/Redfin listing pages (against their ToS); this is their
official, redistributable research dataset.

ZHVI updates monthly, so this only needs to run occasionally (it's decoupled
from the daily site build). If the download fails, any existing market.json is
left untouched so the build never breaks.

    python3 fetch_market.py          # refresh data/market.json
"""
import csv
import json
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "data", "market.json")

ZHVI_URL = ("https://files.zillowstatic.com/research/public_csvs/zhvi/"
            "Zip_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv")

# Representative ZIP for each neighborhood (slug -> zip).
NEIGHBORHOOD_ZIPS = {
    "coral-gables": "33134",
    "pinecrest": "33156",
    "south-miami": "33143",
    "kendall": "33176",
    "cutler-bay": "33189",
}

SOURCE = "Zillow Home Value Index (ZHVI), zillow.com/research/data"


def fetch_csv(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read().decode("utf-8", "replace")


def main():
    try:
        text = fetch_csv(ZHVI_URL)
    except Exception as e:  # network/HTTP problem — keep the old cache
        print(f"fetch_market: download failed ({e!r}); keeping existing market.json")
        return 1

    rdr = csv.reader(text.splitlines())
    header = next(rdr)
    name_i = header.index("RegionName")
    date_cols = [i for i, c in enumerate(header) if c[:2] == "20" and "-" in c]
    latest_date = header[date_cols[-1]]

    want = {z: slug for slug, z in NEIGHBORHOOD_ZIPS.items()}
    rows = {}
    for row in rdr:
        z = row[name_i]
        if z in want:
            rows[z] = row

    neighborhoods = {}
    for slug, z in NEIGHBORHOOD_ZIPS.items():
        row = rows.get(z)
        if not row:
            print(f"fetch_market: WARN no row for {slug} (zip {z})")
            continue

        def val(offset):
            i = date_cols[offset]
            return float(row[i]) if row[i] else None

        cur = val(-1)
        mo_ago = val(-2)
        yr_ago = val(-13)
        if cur is None:
            continue
        neighborhoods[slug] = {
            "zip": z,
            "zhvi": round(cur),
            "yoy_pct": round((cur / yr_ago - 1) * 100, 1) if yr_ago else None,
            "mom_pct": round((cur / mo_ago - 1) * 100, 1) if mo_ago else None,
        }

    if not neighborhoods:
        print("fetch_market: no neighborhoods resolved; keeping existing market.json")
        return 1

    data = {
        "as_of": latest_date,
        "source": SOURCE,
        "neighborhoods": neighborhoods,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"fetch_market: wrote {len(neighborhoods)} neighborhoods to {OUT} (as of {latest_date})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
