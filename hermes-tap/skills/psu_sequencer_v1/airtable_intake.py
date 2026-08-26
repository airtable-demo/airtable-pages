from __future__ import annotations
"""
LS-leads intake from the Airtable base (the enriched source of truth).

Luke 2026-06-17: switch new-lead intake from raw Databricks to the LS-leads
Airtable base — it catches ALL lead types (filtered on 'Last Source Date',
scope 'All leads', book = 5 AEs' accounts OR Lead Owner = Luke) and carries the
enrichment (accurate ATL/BTL + title) that raw SFDC lacks.

Auth: AIRTABLE_TOKEN (read-only Personal Access Token) injected by
RunWithCredentials. Scopes needed: data.records:read (+ schema.bases:read for
the `schema` mode). Network: uses requests, which honors HTTPS_PROXY.

Base/table/view come from the URL Luke shared:
  https://airtable.com/applILm88NgiXbRFy/tbls70vRSwhThKCIs/viw8Tnmlg5saoLmFw

Modes:
  python3 airtable_intake.py schema   -> dump table field names + a sample record (map fields once, here)
  python3 airtable_intake.py fetch     -> dump ALL view records as JSON to airtable_leads.json
  python3 airtable_intake.py count     -> just the record count in the view
"""
import os, sys, json, time, urllib.parse

BASE  = os.environ.get("AIRTABLE_BASE",  "applILm88NgiXbRFy")
TABLE = os.environ.get("AIRTABLE_TABLE", "tbls70vRSwhThKCIs")
VIEW  = os.environ.get("AIRTABLE_VIEW",  "viw8Tnmlg5saoLmFw")
TOKEN = os.environ.get("AIRTABLE_TOKEN", "")
API   = "https://api.airtable.com/v0"

def _req(url):
    import requests
    r = requests.get(url, headers={"Authorization": f"Bearer {TOKEN}"}, timeout=60)
    if r.status_code != 200:
        print(f"ERROR {r.status_code}: {r.text[:400]}", file=sys.stderr)
        sys.exit(2)
    return r.json()

def fetch_records():
    """Page through the view; return list of {id, fields, createdTime}."""
    recs, offset = [], None
    while True:
        params = {"view": VIEW, "pageSize": 100}
        if offset:
            params["offset"] = offset
        url = f"{API}/{BASE}/{TABLE}?" + urllib.parse.urlencode(params)
        data = _req(url)
        recs.extend(data.get("records", []))
        offset = data.get("offset")
        if not offset:
            break
        time.sleep(0.21)  # Airtable 5 req/s
    return recs

def main():
    if not TOKEN:
        print("AIRTABLE_TOKEN not set — configure the skill credential, then run via RunWithCredentials.", file=sys.stderr)
        sys.exit(1)
    mode = sys.argv[1] if len(sys.argv) > 1 else "count"

    if mode == "schema":
        # Try the metadata API for the authoritative field list...
        try:
            meta = _req(f"{API}/meta/bases/{BASE}/tables")
            for t in meta.get("tables", []):
                if t.get("id") == TABLE or t.get("name", "").lower().startswith("lead"):
                    print(f"TABLE {t.get('id')} :: {t.get('name')}")
                    for f in t.get("fields", []):
                        print(f"  FIELD  {f.get('name')!r:42} type={f.get('type')}")
        except SystemExit:
            print("(metadata API unavailable — falling back to record-derived fields)", file=sys.stderr)
        # ...and also show field keys + sample values from the first record.
        recs = fetch_records()
        print(f"\nVIEW record count: {len(recs)}")
        if recs:
            print("\nFIELD KEYS + sample values (record 1):")
            for k, v in recs[0]["fields"].items():
                sv = str(v)[:60]
                print(f"  {k!r:42} = {sv}")
        return

    if mode == "count":
        print(json.dumps({"view_records": len(fetch_records())}))
        return

    if mode == "fetch":
        recs = fetch_records()
        out = [{"airtable_id": r["id"], **r.get("fields", {})} for r in recs]
        json.dump(out, open("airtable_leads.json", "w"), indent=2)
        print(f"wrote airtable_leads.json ({len(out)} records)")
        return

    print(f"unknown mode {mode!r}; use schema|fetch|count", file=sys.stderr)
    sys.exit(1)

if __name__ == "__main__":
    main()
