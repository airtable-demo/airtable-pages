#!/usr/bin/env python3
"""validate_triage.py — Validate the output of an Inbox Triage run.

Reads a triage results JSON file and checks for canonical-shape violations:
- Each entry has the required fields
- Category is one of internal / prospect / noise
- For prospects: interest/seniority/source labels are from the canonical set
- For archived: reason_code is from the canonical set
- No label name is misspelled or missing its numeric prefix
- Label application order is recorded as interest > seniority > source

CLI:
    python3 validate_triage.py --file triage_results.json
    python3 validate_triage.py --file triage_results.json --strict --json

Exit codes:
  0 — clean
  1 — soft warnings (use --strict to fail on these)
  2 — hard errors (canonical contract violations)
"""
from __future__ import annotations

import argparse
import json
import sys
from typing import Any, Dict, List, Tuple

INTEREST_LABELS = {"1 Interested", "1 Maybe", "1 Not Interested"}
SENIORITY_LABELS = {"2 ATL", "2 ATL Possible", "2 BTL"}
SOURCE_LABELS = {"3 Handraiser", "3 MQL", "3 Moving Champion", "3 Other", "3 PSU"}
ARCHIVE_LABEL = "[ABDR Archived]"
ARCHIVE_REASONS = {
    "gong_recording", "zoom_recording", "bounce", "ooo",
    "platform_digest", "generic_automated",
}
CATEGORIES = {"internal", "prospect", "noise"}


def validate_entry(idx: int, e: Dict[str, Any]) -> Tuple[List[str], List[str]]:
    """Return (errors, warnings) for a single triage entry."""
    errs: List[str] = []
    warns: List[str] = []
    prefix = f"[entry {idx} id={e.get('id', '?')!r}]"

    # Required fields.
    for f in ("id", "sender", "category"):
        if f not in e or e.get(f) in (None, ""):
            errs.append(f"{prefix} missing required field '{f}'")

    cat = e.get("category")
    if cat not in CATEGORIES:
        errs.append(f"{prefix} invalid category {cat!r} (expected one of {sorted(CATEGORIES)})")

    if cat == "noise":
        rc = e.get("archive_reason_code")
        if rc not in ARCHIVE_REASONS:
            errs.append(f"{prefix} noise entry has invalid archive_reason_code {rc!r}")
        applied = e.get("labels_applied") or []
        if ARCHIVE_LABEL not in applied:
            errs.append(f"{prefix} noise entry missing {ARCHIVE_LABEL!r} in labels_applied")
        if "INBOX" in applied:
            warns.append(f"{prefix} noise entry still has INBOX label applied (archive removes it)")
        return errs, warns

    if cat == "internal":
        # Internal: no triage labels expected.
        applied = e.get("labels_applied") or []
        if any(lbl in INTEREST_LABELS | SENIORITY_LABELS | SOURCE_LABELS for lbl in applied):
            warns.append(f"{prefix} internal entry has triage labels applied: {applied!r}")
        return errs, warns

    if cat == "prospect":
        applied = e.get("labels_applied") or []
        if not applied:
            warns.append(f"{prefix} prospect entry has no labels_applied")
            return errs, warns

        interest_hits = [l for l in applied if l in INTEREST_LABELS]
        seniority_hits = [l for l in applied if l in SENIORITY_LABELS]
        source_hits = [l for l in applied if l in SOURCE_LABELS]

        if len(interest_hits) != 1:
            errs.append(f"{prefix} prospect must have exactly 1 interest label, got {interest_hits!r}")
        if len(seniority_hits) != 1:
            errs.append(f"{prefix} prospect must have exactly 1 seniority label, got {seniority_hits!r}")
        if len(source_hits) > 1:
            errs.append(f"{prefix} prospect has multiple source labels {source_hits!r}")
        # Source can be 0 if email didn't match any SFDC lead (cold prospect).

        # Check canonical application order (interest first, source last).
        if interest_hits and seniority_hits:
            i_idx = applied.index(interest_hits[0])
            s_idx = applied.index(seniority_hits[0])
            if i_idx > s_idx:
                warns.append(f"{prefix} interest label applied AFTER seniority — canonical order is interest > seniority > source")
        if seniority_hits and source_hits:
            s_idx = applied.index(seniority_hits[0])
            src_idx = applied.index(source_hits[0])
            if s_idx > src_idx:
                warns.append(f"{prefix} seniority label applied AFTER source — canonical order is interest > seniority > source")

        # Misspelling check: any label that looks like our canonical set but isn't.
        known = INTEREST_LABELS | SENIORITY_LABELS | SOURCE_LABELS | {ARCHIVE_LABEL, "INBOX", "UNREAD", "STARRED", "IMPORTANT"}
        for lbl in applied:
            if lbl in known:
                continue
            if lbl.startswith(("1 ", "2 ", "3 ")):
                errs.append(f"{prefix} unrecognized triage label {lbl!r} (numeric prefix but not canonical)")

    return errs, warns


def main(argv: List[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--file", required=True, help="Triage results JSON file")
    p.add_argument("--strict", action="store_true", help="Treat warnings as failures (exit 1)")
    p.add_argument("--json", action="store_true", help="Emit JSON report")
    args = p.parse_args(argv)

    try:
        with open(args.file, "r", encoding="utf-8") as fh:
            results: List[Dict[str, Any]] = json.load(fh)
    except FileNotFoundError as e:
        print(f"Input file not found: {e}", file=sys.stderr)
        return 2
    except json.JSONDecodeError as e:
        print(f"Invalid JSON: {e}", file=sys.stderr)
        return 2

    if not isinstance(results, list):
        print("Error: input must be a JSON array of triage entries", file=sys.stderr)
        return 2

    all_errs: List[str] = []
    all_warns: List[str] = []
    for idx, e in enumerate(results):
        errs, warns = validate_entry(idx, e)
        all_errs.extend(errs)
        all_warns.extend(warns)

    summary = {
        "total_entries": len(results),
        "internal_count": sum(1 for e in results if e.get("category") == "internal"),
        "prospect_count": sum(1 for e in results if e.get("category") == "prospect"),
        "noise_count": sum(1 for e in results if e.get("category") == "noise"),
        "errors": all_errs,
        "warnings": all_warns,
    }

    if args.json:
        print(json.dumps(summary, indent=2))
    else:
        print(f"Validated {summary['total_entries']} entries: "
              f"{summary['internal_count']} internal, "
              f"{summary['prospect_count']} prospect, "
              f"{summary['noise_count']} noise")
        if all_errs:
            print(f"\n❌ {len(all_errs)} errors:")
            for e in all_errs:
                print(f"  - {e}")
        if all_warns:
            print(f"\n⚠️  {len(all_warns)} warnings:")
            for w in all_warns:
                print(f"  - {w}")
        if not all_errs and not all_warns:
            print("\n✓ No issues.")

    if all_errs:
        return 2
    if all_warns and args.strict:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
