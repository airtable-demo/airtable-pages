from __future__ import annotations
"""
airtable_assets.py — credential-locked access to the Shared Asset Library base.

Reads customer-story and demo-video proof points from the shared Assets base,
authenticating with an Airtable Personal Access Token (PAT) that the platform
injects as the AIRTABLE_ASSETS_PAT environment variable via the credential-locked
skill mechanism (credentialSchema). Like the runner helper, this removes the
dependency on each AE's own connected Airtable integration, so a cloned AutoBDR
instance can pull proof points with zero per-AE Airtable setup.

The PAT must be scoped to base appiwo5qAXaewDXHu with data.records:read. It is
configured ONCE in the outbound_account_play skill credentials, encrypted by the
platform, never visible in skill source or to anyone the skill is shared with.

Other outbound skills that need proof points (Sequence Generation,
prospect_landing_page_generator, etc.) can reuse this single configured PAT via a
cross-skill call:
    RunWithCredentials("outbound_account_play", "python3 airtable_assets.py list ...")

Usage:
  python3 airtable_assets.py check
  python3 airtable_assets.py list [--type Video|"Customer story"]
                                  [--persona "Product"] [--use-case "roadmapping"]
                                  [--industry "Gaming"] [--max 200] [--format json|table]

Prints JSON (default) of matching asset records. Filters are case-insensitive
substring matches applied across the relevant multi-select/text fields.
Exit codes: 0 = ok, 1 = runtime error, 2 = misconfiguration (missing PAT).
"""
import argparse
import json
import os
import subprocess
import sys

BASE_ID = "appiwo5qAXaewDXHu"
TABLE_ID = "tblWkh1kC4aifkBj0"
VIEW_ID = "viwuKAjz3bioNZV5d"
API_ROOT = "https://api.airtable.com/v0"

# The primary field literal name carries a leading U+FEFF BOM ("﻿Asset name").
# We fetch ALL fields (no fields[] selection) to sidestep the BOM entirely, then
# resolve the asset-name value by scanning keys that end with "Asset name".
FIELD_TYPE = "Type"
FIELD_PERSONAS = "Personas"
FIELD_USECASES = "Use cases"
FIELD_INDUSTRIES = "Industries"
FIELD_URL = "URL"
FIELD_DESC = "Description"


def _pat() -> str:
    pat = os.environ.get("AIRTABLE_ASSETS_PAT", "").strip()
    if not pat:
        print(json.dumps({
            "ok": False,
            "error": (
                "AIRTABLE_ASSETS_PAT not set. Configure the Shared Assets PAT in "
                "the outbound_account_play skill credentials (encrypted). It must "
                "be scoped to base appiwo5qAXaewDXHu with data.records:read."
            ),
        }))
        sys.exit(2)
    return pat


def _curl(url: str) -> dict:
    cmd = [
        "curl", "-sS", "-X", "GET", url,
        "-H", "Authorization: Bearer " + _pat(),
        "-w", "\n%{http_code}",
    ]
    # Do NOT pass --proxy "". HTTPS_PROXY from the environment is required.
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=45)
    except subprocess.TimeoutExpired:
        return {"_http": 0, "_error": "curl timed out after 45s"}
    raw = proc.stdout or ""
    if proc.returncode != 0:
        return {"_http": 0, "_error": (proc.stderr or "curl failed").strip()}
    nl = raw.rfind("\n")
    body, code = (raw[:nl], raw[nl + 1:]) if nl != -1 else (raw, "")
    try:
        parsed = json.loads(body) if body.strip() else {}
    except json.JSONDecodeError:
        parsed = {"_unparsed": body}
    if not isinstance(parsed, dict):
        parsed = {"_value": parsed}
    parsed["_http"] = int(code) if code.strip().isdigit() else 0
    return parsed


def _asset_name(fields: dict) -> str:
    for k, v in fields.items():
        if k.endswith("Asset name"):
            return v if isinstance(v, str) else str(v)
    return ""


def _as_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return ", ".join(str(x) for x in value)
    return str(value)


def _fetch_all() -> "tuple[list, dict]":
    records: list = []
    offset = ""
    while True:
        url = API_ROOT + "/" + BASE_ID + "/" + TABLE_ID + "?pageSize=100&view=" + VIEW_ID
        if offset:
            url += "&offset=" + offset
        r = _curl(url)
        if r.get("_http") != 200:
            return records, {"ok": False, "http": r.get("_http"),
                             "error": r.get("error") or r.get("_error") or r}
        records.extend(r.get("records", []))
        offset = r.get("offset", "")
        if not offset:
            break
    return records, {"ok": True}


def cmd_check() -> int:
    r = _curl(API_ROOT + "/" + BASE_ID + "/" + TABLE_ID + "?maxRecords=1&view=" + VIEW_ID)
    http = r.get("_http", 0)
    if http == 200:
        print(json.dumps({"ok": True, "http": 200, "message": "Assets PAT valid; base reachable."}))
        return 0
    print(json.dumps({
        "ok": False, "http": http,
        "error": r.get("error") or r.get("_error") or "unexpected response",
        "hint": "401 = PAT missing/invalid; 403/404 = PAT lacks access to base appiwo5qAXaewDXHu.",
    }))
    return 1


def _matches(fields: dict, args) -> bool:
    def has(field_value, needle):
        return needle.lower() in _as_text(field_value).lower()
    if args.type and not has(fields.get(FIELD_TYPE), args.type):
        return False
    if args.persona and not has(fields.get(FIELD_PERSONAS), args.persona):
        return False
    if args.use_case and not has(fields.get(FIELD_USECASES), args.use_case):
        return False
    if args.industry and not has(fields.get(FIELD_INDUSTRIES), args.industry):
        return False
    return True


def cmd_list(args) -> int:
    raw, status = _fetch_all()
    if not status.get("ok"):
        print(json.dumps(status))
        return 1
    out = []
    for rec in raw:
        f = rec.get("fields", {})
        if not _matches(f, args):
            continue
        out.append({
            "id": rec.get("id"),
            "asset_name": _asset_name(f),
            "type": f.get(FIELD_TYPE),
            "url": f.get(FIELD_URL),
            "industries": f.get(FIELD_INDUSTRIES),
            "personas": f.get(FIELD_PERSONAS),
            "use_cases": f.get(FIELD_USECASES),
            "description": f.get(FIELD_DESC),
        })
        if args.max and len(out) >= args.max:
            break
    if args.format == "table":
        for a in out:
            print("- [{}] {} | {}".format(_as_text(a["type"]), a["asset_name"], a["url"]))
        print("({} assets)".format(len(out)))
    else:
        print(json.dumps({"ok": True, "count": len(out), "assets": out}))
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="Shared Asset Library access via baked-in PAT.")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("check", help="Validate the PAT and base reachability.")

    s_list = sub.add_parser("list", help="List proof-point assets with optional filters.")
    s_list.add_argument("--type", help='e.g. "Video" or "Customer story"')
    s_list.add_argument("--persona")
    s_list.add_argument("--use-case", dest="use_case")
    s_list.add_argument("--industry")
    s_list.add_argument("--max", type=int, default=0)
    s_list.add_argument("--format", choices=["json", "table"], default="json")

    args = p.parse_args()
    if args.cmd == "check":
        return cmd_check()
    if args.cmd == "list":
        return cmd_list(args)
    return 2


if __name__ == "__main__":
    sys.exit(main())
