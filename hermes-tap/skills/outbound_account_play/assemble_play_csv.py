#!/usr/bin/env python3
"""
Generic CSV assembler for outbound_account_play.

Inputs:
  - prospects.json: array of prospect rows with first_name, last_name, full_name,
    title, seniority, company, email, email_status, linkedin_url, city, state,
    country, score, etc.
  - persona_assignments.json: object mapping persona_key -> {label, prospects: [full_name, ...]}.
    Orchestrator (LLM) builds this from the prospect list — typically 3-5 buckets.
  - sequence files keyed by persona_key (passed as repeated --persona persona_key:/path/to/seq.json)

For each prospect:
  - Look up persona_key by name
  - Take the persona's sequence and swap `NAME` and `{{first_name}}` for the prospect's first_name
  - Emit a row with all prospect cols + per-email subject/body/wait_days + LI fields

Sequence file shape (from the Sequence Generation skill):
  {
    "prospect": {...},  # ignored — we fan out
    "config": {"sequence_length": 7, "website_url": "...", "signoff_name": "..."},
    "emails": [{step, role, subject, body, wait_days, ...}],
    "linkedin": {connect_message, followup_template, voice_note_script, stops_on_any_response}
  }

CLI:
  python3 assemble_play_csv.py \\
    --prospects /path/to/prospects.json \\
    --assignments /path/to/persona_assignments.json \\
    --persona capital_projects_pmo:/path/to/seq_capital_projects_pmo.json \\
    --persona engineering_facilities:/path/to/seq_engineering_facilities.json \\
    [--persona ...] \\
    --output /path/to/out.csv

Writes:
  - output csv
  - output.summary.json next to it
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path


def personalize(text: str | None, first_name: str) -> str:
    if not text:
        return ""
    out = text.replace("{{first_name}}", first_name)
    out = re.sub(r"\bNAME\b", first_name, out)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prospects", required=True)
    ap.add_argument("--assignments", required=True)
    ap.add_argument("--persona", action="append", required=True,
                    help="Repeated. Format: persona_key:/path/to/seq.json")
    ap.add_argument("--output", required=True)
    args = ap.parse_args()

    prospects = json.loads(Path(args.prospects).read_text())
    assignments = json.loads(Path(args.assignments).read_text())

    sequences: dict[str, dict] = {}
    for spec in args.persona:
        if ":" not in spec:
            print(f"ERROR: --persona must be persona_key:/path/to/seq.json, got: {spec}", file=sys.stderr)
            return 2
        key, path = spec.split(":", 1)
        sequences[key] = json.loads(Path(path).read_text())

    # Build name -> persona_key lookup
    name_to_persona = {}
    for pkey, pmeta in assignments.items():
        for fullname in pmeta.get("prospects", []):
            name_to_persona[fullname.strip().lower()] = pkey

    rows = []
    persona_counts = {k: 0 for k in sequences}
    unmatched = []

    for p in prospects:
        full = (p.get("full_name") or "").strip().lower()
        alt = f"{(p.get('first_name') or '').strip()} {(p.get('last_name') or '').strip()}".lower()
        pkey = name_to_persona.get(full) or name_to_persona.get(alt)
        if pkey is None or pkey not in sequences:
            unmatched.append(p.get("full_name") or alt)
            continue

        persona_counts[pkey] += 1
        seq = sequences[pkey]
        first = (p.get("first_name") or "").strip()

        row = {
            "persona": assignments[pkey].get("label", pkey),
            "full_name": p.get("full_name", ""),
            "first_name": p.get("first_name", ""),
            "last_name": p.get("last_name", ""),
            "title": p.get("title", ""),
            "seniority": p.get("seniority", ""),
            "company": p.get("company", ""),
            "email": p.get("email", ""),
            "email_status": p.get("email_status", ""),
            "linkedin_url": p.get("linkedin_url", "") or "",
            "city": p.get("city", "") or "",
            "state": p.get("state", "") or "",
            "country": p.get("country", "") or "",
            "score": p.get("score", ""),
        }

        for i, em in enumerate(seq.get("emails", []), start=1):
            row[f"e{i}_subject"] = em.get("subject", "")
            row[f"e{i}_body"] = personalize(em.get("body", ""), first)
            row[f"e{i}_wait_days"] = em.get("wait_days", "")

        li = seq.get("linkedin", {})
        row["li_connect"] = personalize(li.get("connect_message", ""), first)
        row["li_followup"] = personalize(li.get("followup_template", ""), first)
        row["li_voice_note_script"] = personalize(li.get("voice_note_script", ""), first)

        rows.append(row)

    if unmatched:
        print(f"WARN: {len(unmatched)} unmatched prospect(s):", file=sys.stderr)
        for u in unmatched:
            print(f"  - {u}", file=sys.stderr)

    if not rows:
        print("ERROR: no rows produced", file=sys.stderr)
        return 2

    # Pick email count from the first sequence (assume all personas have same length)
    email_count = max((len(s.get("emails", [])) for s in sequences.values()), default=0)

    base = [
        "persona", "full_name", "first_name", "last_name", "title", "seniority",
        "company", "email", "email_status", "linkedin_url", "city", "state",
        "country", "score",
    ]
    email_cols = []
    for i in range(1, email_count + 1):
        email_cols += [f"e{i}_subject", f"e{i}_body", f"e{i}_wait_days"]
    li_cols = ["li_connect", "li_followup", "li_voice_note_script"]
    cols = base + email_cols + li_cols

    out = Path(args.output)
    with open(out, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, quoting=csv.QUOTE_ALL)
        w.writeheader()
        for r in rows:
            for c in cols:
                r.setdefault(c, "")
            w.writerow(r)

    summary = {
        "rows_written": len(rows),
        "unmatched": unmatched,
        "persona_distribution": persona_counts,
        "email_count_per_sequence": email_count,
        "linkedin_touches_per_sequence": 3,
        "columns_total": len(cols),
        "csv_path": str(out),
        "csv_size_bytes": out.stat().st_size,
    }
    out.with_suffix(".summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
