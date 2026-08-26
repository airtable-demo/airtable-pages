#!/usr/bin/env python3
"""classify_seniority.py — Classify a prospect's title into ATL / ATL Possible / BTL.

Uses Luke's canonical ATL/BTL rules:

  ATL: Director+, VP, Head of, Chief, C-level, or Senior Manager of
       program management / roadmapping / similar leadership roles.
  ATL Possible: borderline titles (Senior Manager in unclear function,
       "Lead" without further qualifier, "Principal" in non-IC functions,
       "Owner" / "Founder" of small companies, etc.) OR no title available.
  BTL: IC, individual contributor, or Manager-and-below in a clearly
       non-leadership function.

This is a deterministic regex classifier. The skill recommends running this
first, then optionally falling back to an LLM classifier for "ATL Possible"
borderline cases (the agent reads the title + LinkedIn context and decides).

CLI:
    python3 classify_seniority.py --title "Senior Director of Product"
    python3 classify_seniority.py --file titles.json --output classified.json

Exit codes: 0 success, 1 input error, 2 internal error.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from typing import Any, Dict, List, Optional, Tuple

# Order matters: more specific patterns must come BEFORE more general ones.

# Definite ATL — clear seniority signals.
ATL_PATTERNS: List[Tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(c[eo]o|cto|cio|cfo|cmo|cpo|cro|cdo|cso|ciso|chro|chief\s+[a-z]+\s+officer|chief\s+of\s+staff)\b", re.I),
     "C-level / Chief role"),
    (re.compile(r"\b(president|founder|co[- ]?founder|owner|managing\s+director|partner)\b", re.I),
     "Founder / President / Managing Director"),
    (re.compile(r"\b(svp|evp|vp|vice\s+president|vice[- ]president)\b", re.I),
     "VP / SVP / EVP"),
    (re.compile(r"\b(senior\s+director|sr\.?\s+director|director\s+of|director,)\b", re.I),
     "Director / Senior Director"),
    (re.compile(r"\bdirector\b", re.I),
     "Director"),
    (re.compile(r"\bhead\s+of\b", re.I),
     "Head of [function]"),
    (re.compile(r"\b(general\s+manager|gm)\b", re.I),
     "General Manager"),
    # Senior Manager in clearly leadership functions (program management, roadmapping).
    (re.compile(r"\bsenior\s+manager\b.*\b(program|portfolio|roadmap|strategy|business\s+operations|biz\s*ops|transformation|change|chief\s+of\s+staff)\b", re.I),
     "Senior Manager in leadership/program function"),
    (re.compile(r"\b(program|portfolio|roadmap|strategy)\b.*\bsenior\s+manager\b", re.I),
     "Senior Manager in leadership/program function"),
]

# Definite BTL — clear IC / lower-level signals.
# (Senior Manager outside leadership functions falls through to ATL_POSSIBLE.)
BTL_PATTERNS: List[Tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(intern|trainee|apprentice|junior|jr\.?\s+|entry[- ]level)\b", re.I),
     "Intern / Junior / Entry-level"),
    (re.compile(r"\b(associate|assistant|coordinator|specialist|analyst|representative|rep\b|administrator|admin\b|technician|operator|operative|clerk|agent)\b", re.I),
     "Individual contributor title (Associate / Analyst / Specialist / etc.)"),
    (re.compile(r"\b(software|product|data|design|marketing|sales|support|business|systems|solutions|customer\s+success|cs|finance|accounting|hr|people)\s+(engineer|developer|designer|scientist|manager|consultant)\b", re.I),
     "Functional IC title (Engineer / Designer / Scientist / Manager)"),
    (re.compile(r"\b(engineer(?!ing\s+(director|manager|lead))|developer|designer|programmer|architect(?!ure\s+director)|consultant(?!ing\s+(director|partner))|copywriter|writer|editor|recruiter|account\s+executive|ae\b|bdr\b|sdr\b)\b", re.I),
     "Engineer / Developer / Consultant / etc."),
    (re.compile(r"\b(team\s+lead|tech\s+lead|squad\s+lead)\b", re.I),
     "Team Lead / Tech Lead (IC+ but not management)"),
    (re.compile(r"^\s*manager\b", re.I),
     "Manager (no Senior / no leadership-function qualifier)"),
    (re.compile(r"\bmanager,?\s+(of\s+)?(software|product|engineering|design|marketing|sales|support|operations|finance|hr|people|customer|account)\b", re.I),
     "Functional Manager (not Senior, not Director-equivalent)"),
]

# Patterns that push borderline titles into ATL Possible.
ATL_POSSIBLE_PATTERNS: List[Tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bsenior\s+manager\b", re.I),
     "Senior Manager (function unclear — borderline)"),
    (re.compile(r"\b(principal|staff|distinguished|fellow)\b", re.I),
     "Principal / Staff / Distinguished (senior IC — borderline)"),
    (re.compile(r"\b(lead|leader)\b", re.I),
     "Lead / Leader (ambiguous)"),
]


def classify(title: Optional[str]) -> Tuple[str, str]:
    """Return (label, reason). label in {ATL, ATL Possible, BTL, N/A}."""
    if not title or not title.strip():
        return "ATL Possible", "No title available — defaulting to ATL Possible for review"

    t = title.strip()

    # Run ATL patterns first (most specific seniority signal).
    for pat, reason in ATL_PATTERNS:
        if pat.search(t):
            return "ATL", f"Matched '{reason}' in title: {t!r}"

    # Then ATL Possible BEFORE BTL — a "Principal Engineer" or "Staff Architect"
    # must be caught by the Possible patterns before the BTL "Engineer" pattern
    # downgrades it to IC.
    for pat, reason in ATL_POSSIBLE_PATTERNS:
        if pat.search(t):
            return "ATL Possible", f"Matched '{reason}' in title: {t!r}"

    # Then BTL — IC titles that did not get escalated by Possible.
    for pat, reason in BTL_PATTERNS:
        if pat.search(t):
            return "BTL", f"Matched '{reason}' in title: {t!r}"

    # Default fallback for unparseable titles: ATL Possible (safer than BTL —
    # better to surface for review than to silently de-prioritize).
    return "ATL Possible", f"No regex match for title: {t!r} — defaulting to ATL Possible for review"


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--title", help="Job title to classify")
    p.add_argument("--file", help="Path to JSON file with [{id, title}]")
    p.add_argument("--output", help="Output JSON path (for --file mode)")
    p.add_argument("--json", action="store_true", help="Single-title mode: emit JSON")
    args = p.parse_args(argv)

    try:
        if args.file:
            with open(args.file, "r", encoding="utf-8") as fh:
                items: List[Dict[str, Any]] = json.load(fh)
            results: List[Dict[str, Any]] = []
            for it in items:
                label, reason = classify(it.get("title"))
                results.append({"id": it.get("id"), "title": it.get("title"), "label": label, "reason": reason})
            out = json.dumps(results, indent=2)
            if args.output:
                with open(args.output, "w", encoding="utf-8") as fh:
                    fh.write(out)
                print(f"Wrote {len(results)} classifications to {args.output}")
            else:
                print(out)
            return 0

        if args.title is None:
            print("Error: --title or --file required", file=sys.stderr)
            return 1

        label, reason = classify(args.title)
        if args.json:
            print(json.dumps({"label": label, "reason": reason}))
        else:
            print(f"{label}\t{reason}")
        return 0
    except FileNotFoundError as e:
        print(f"Input file not found: {e}", file=sys.stderr)
        return 1
    except json.JSONDecodeError as e:
        print(f"Invalid JSON: {e}", file=sys.stderr)
        return 1
    except Exception as e:  # noqa: BLE001
        print(f"Internal error: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
