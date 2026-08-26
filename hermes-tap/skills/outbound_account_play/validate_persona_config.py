#!/usr/bin/env python3
"""
validate_persona_config.py — deterministic linter for the per-play persona_config.json
that score_candidates.py / merge_and_filter.py consume.

WHY THIS EXISTS (2026-07-09): AEs reported poor-fit prospects in sequences. Audit of
live plays showed the persona configs (generated ad hoc per play) carried over-broad
patterns — a bare \\bmarketing\\b on a marketing-ops POV swept in procurement people
("Director, Marketing Procurement"), SEO specialists, and even a "Marketing UAT and
Incident Manager". This linter fails those configs BEFORE any reveal credits are spent.

Checks
------
ERRORS (exit 2):
  E1  pattern does not compile as Python regex
  E2  banned bare token — a high/medium/low pattern whose entire content is one
      generic word (marketing, product, operations, planning, manager, ...).
      Compounds are fine: \\bmarketing operations\\b passes; \\bmarketing\\b fails.
      skip_patterns are EXEMPT (skipping broadly is safe).
  E3  (only with --candidates) over-broad pattern — a high/medium/low pattern that
      matches >35% of the discovery pool. A pattern that matches a third of the
      account isn't a persona, it's a department.

WARNINGS (exit 1; exit 2 under --strict):
  W1  duplicate pattern appearing in more than one list
  W2  skip-coverage gap — none of the skip_patterns cover a canonical non-target
      function (hr/recruiting, sales, customer support, legal, comms/PR, admin,
      intern). Suppress per-function with --target-function <name> when the POV
      genuinely targets it.
  W3  missing word boundaries — a plain-word pattern without \\b anchors
      (the classic: 'coo' matching 'coordinator')
  W4  empty high_patterns — nothing can score 3; the whole play would ride on
      medium/low matches

Usage
-----
  python3 validate_persona_config.py --config persona_config.json \\
      [--candidates candidates_raw.json] [--strict] \\
      [--target-function sales] [--target-function support]

Exit codes: 0 = clean, 1 = warnings only, 2 = errors (or warnings under --strict).
Prints a JSON report to stdout.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# Single generic words that are NEVER specific enough to be a high/medium/low
# pattern on their own. Each of these has swept wrong-function prospects into a
# live play or trivially would. Compound them: 'marketing operations', 'product ops'.
BANNED_BARE = {
    "marketing", "product", "sales", "operations", "ops", "planning", "strategy",
    "data", "digital", "growth", "finance", "engineering", "design", "program",
    "project", "manager", "director", "vp", "head", "analyst", "lead", "senior",
    "specialist", "coordinator", "brand", "content", "technology", "innovation",
    "transformation", "commercial", "insights", "analytics", "business",
    "development", "partner", "partnerships", "media", "creative", "experience",
    "platform", "solutions", "services", "success", "management",
}

# Canonical non-target functions a cold outbound play virtually never wants.
# Key = --target-function suppressor name, value = detection keywords.
SKIP_COVERAGE = {
    "hr": ["hr", "human resource", "recruit", "talent", "people & culture", "people team"],
    "sales": ["sales", "account executive", "account exec", "business development", "bdr", "sdr"],
    "support": ["customer service", "customer support", "customer care", "help desk", "call center"],
    "legal": ["legal", "counsel", "compliance officer", "paralegal"],
    "comms": ["communications", "public relations", "\\bpr\\b", "press"],
    "admin": ["executive assistant", "administrative assistant", "office manager", "receptionist"],
    "students": ["intern", "student", "graduate trainee", "apprentice"],
}

OVERBROAD_PCT = 0.35


def effective_content(pattern: str) -> str:
    """Strip \\b anchors and ^$ from a pattern; return remaining text."""
    s = pattern.replace("\\b", "").strip("^$ ")
    return s.strip()


def is_plain_single_token(s: str) -> bool:
    """True when the pattern content is one plain word (or &-joined word) with no
    regex machinery and no spaces — i.e. it matches anywhere the word appears."""
    return bool(re.fullmatch(r"[a-z&'\-]+", s))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--candidates", default=None,
                    help="Optional LeadIQ discovery JSON — enables the over-broad pool check (E3)")
    ap.add_argument("--strict", action="store_true", help="Warnings also fail (exit 2)")
    ap.add_argument("--target-function", action="append", default=[],
                    help="Suppress a skip-coverage warning when the POV targets that function "
                         f"(one of: {', '.join(sorted(SKIP_COVERAGE))})")
    args = ap.parse_args()

    cfg = json.loads(Path(args.config).read_text())
    titles = []
    if args.candidates:
        cdata = json.loads(Path(args.candidates).read_text())
        contacts = cdata.get("contacts", cdata) if isinstance(cdata, dict) else cdata
        titles = [(c.get("title") or "").lower() for c in contacts if c.get("title")]

    errors, warnings = [], []
    seen_patterns = {}

    for list_name in ("skip_patterns", "high_patterns", "medium_patterns", "low_patterns"):
        for pat in cfg.get(list_name, []):
            # E1 compile
            try:
                rx = re.compile(pat)
            except re.error as e:
                errors.append({"check": "E1_compile", "list": list_name, "pattern": pat, "detail": str(e)})
                continue

            # W1 duplicates
            if pat in seen_patterns and seen_patterns[pat] != list_name:
                warnings.append({"check": "W1_duplicate", "pattern": pat,
                                 "detail": f"appears in both {seen_patterns[pat]} and {list_name}"})
            seen_patterns.setdefault(pat, list_name)

            content = effective_content(pat)

            # W3 word boundaries (skip check also useful on skip list — coo/coordinator)
            if is_plain_single_token(content) and "\\b" not in pat:
                warnings.append({"check": "W3_no_word_boundary", "list": list_name, "pattern": pat,
                                 "detail": f"'{content}' without \\b anchors substring-matches "
                                           f"(e.g. 'coo' in 'coordinator')"})

            if list_name == "skip_patterns":
                continue  # E2/E3 don't apply to skips — broad skips are safe

            # E2 banned bare token
            if is_plain_single_token(content) and content in BANNED_BARE:
                errors.append({"check": "E2_banned_bare_token", "list": list_name, "pattern": pat,
                               "detail": f"bare '{content}' is too generic — compound it "
                                         f"(e.g. '\\\\b{content} operations\\\\b')"})
                continue

            # E3 over-broad against the pool
            if titles:
                hits = sum(1 for t in titles if rx.search(t))
                pct = hits / len(titles)
                if pct > OVERBROAD_PCT:
                    errors.append({"check": "E3_overbroad", "list": list_name, "pattern": pat,
                                   "detail": f"matches {hits}/{len(titles)} ({pct:.0%}) of the discovery "
                                             f"pool — that's a department, not a persona"})

    # W4 empty high
    if not cfg.get("high_patterns"):
        warnings.append({"check": "W4_no_high_patterns",
                         "detail": "high_patterns is empty — nothing can score 3; the play would ride "
                                   "entirely on medium/low matches"})

    # W2 skip coverage
    suppressed = {f.lower() for f in args.target_function}
    skip_blob = " ".join(cfg.get("skip_patterns", [])).lower()
    for func, keywords in SKIP_COVERAGE.items():
        if func in suppressed:
            continue
        if not any(kw.replace("\\b", "") in skip_blob for kw in keywords):
            warnings.append({"check": "W2_skip_coverage", "function": func,
                             "detail": f"no skip pattern covers '{func}' "
                                       f"(e.g. {keywords[0]!r}) — add one or pass --target-function {func}"})

    status = "pass"
    exit_code = 0
    if warnings:
        status, exit_code = "warnings", (2 if args.strict else 1)
    if errors:
        status, exit_code = "fail", 2

    print(json.dumps({
        "status": status,
        "errors": errors,
        "warnings": warnings,
        "pool_size": len(titles),
        "counts": {k: len(cfg.get(k, [])) for k in
                   ("skip_patterns", "high_patterns", "medium_patterns", "low_patterns")},
    }, indent=2))
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
