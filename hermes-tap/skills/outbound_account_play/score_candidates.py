#!/usr/bin/env python3
"""
Generic candidate scorer for outbound_account_play.

Reads:
  - candidates.json (output from LeadIQ batch_search.py --format json), with .contacts[].title etc.
  - persona_config.json with skip_patterns / high_patterns / medium_patterns / low_patterns
    (orchestrator generates this for each play from the POV's target_personas list)

Scores each candidate 0-3 by title regex:
  - First check skip_patterns (any match -> score 0, drop)
  - Then high_patterns -> score 3
  - Then medium_patterns -> score 2
  - Then low_patterns -> score 1
  - No match -> score 0 (drop)

FIT GATE (v2, 2026-07-09): candidates scoring BELOW --min-score (default 2) are NOT
written to the main output. They land in a sibling bench file (<output>.bench.json)
the orchestrator may only draw from with explicit reasoning surfaced to the AE.
Rationale: live-play audit showed score-1 "low" generic matches (bare 'marketing',
'planning', 'product' patterns) silently filling plays to N with poor-fit prospects.

Writes:
  - scored.json (candidates with score >= min-score, sorted by score desc then
    Director > VP > Manager)
  - scored.bench.json (score > 0 but < min-score — the consciously-usable bench)
  - scored.stats.json (score distribution + per-pattern hit counts; a pattern doing
    an outsized share of the matching is your over-broad suspect)

CLI:
  python3 score_candidates.py \\
    --candidates /path/to/leadiq_candidates.json \\
    --config /path/to/persona_config.json \\
    --output /path/to/scored.json \\
    [--top N]          (optional: keep top N only)
    [--min-score 2]    (default 2; pass 1 ONLY with explicit AE sign-off)

Persona config JSON shape:
{
  "skip_patterns":   ["\\\\bf&b\\\\b", "\\\\bmarketing\\\\b", ...],
  "high_patterns":   ["\\\\bcapital project", "\\\\bconstruction\\\\b", ...],
  "medium_patterns": ["\\\\bcontroller\\\\b", "\\\\bfp&a\\\\b", ...],
  "low_patterns":    ["\\\\bdirector.*finance\\\\b", ...]
}

The patterns are Python regex strings. The skill SKILL.md walks the orchestrator
through generating these from the POV's target_personas list per account.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


def score_title(title: str, cfg: dict) -> tuple[int, str, str]:
    """Returns (score, reason, matched_pattern)."""
    t = (title or "").lower()
    for pat in cfg.get("skip_patterns", []):
        if re.search(pat, t):
            return 0, f"skip: matched '{pat}'", pat
    for pat in cfg.get("high_patterns", []):
        if re.search(pat, t):
            return 3, f"high: matched '{pat}'", pat
    for pat in cfg.get("medium_patterns", []):
        if re.search(pat, t):
            return 2, f"medium: matched '{pat}'", pat
    for pat in cfg.get("low_patterns", []):
        if re.search(pat, t):
            return 1, f"low: matched '{pat}'", pat
    return 0, "no match", ""


def seniority_rank(s: str) -> int:
    s = (s or "").lower()
    return {"director": 3, "vp": 2, "manager": 1}.get(s, 0)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--candidates", required=True, help="LeadIQ batch_search JSON (object with .contacts[])")
    ap.add_argument("--config", required=True, help="Persona config JSON with pattern lists")
    ap.add_argument("--output", required=True, help="Output path for scored candidates JSON")
    ap.add_argument("--top", type=int, default=None, help="Optional: keep top N only")
    ap.add_argument("--min-score", type=int, default=2,
                    help="Candidates below this score go to <output>.bench.json instead of the "
                         "main output (default 2 — score-1 generics never silently fill a play)")
    args = ap.parse_args()

    cands_data = json.loads(Path(args.candidates).read_text())
    cands = cands_data.get("contacts", cands_data) if isinstance(cands_data, dict) else cands_data
    cfg = json.loads(Path(args.config).read_text())

    dist = {0: 0, 1: 0, 2: 0, 3: 0}
    pattern_hits = {}
    scored, bench = [], []
    for c in cands:
        s, reason, pat = score_title(c.get("title", ""), cfg)
        dist[s] += 1
        if pat:
            pattern_hits[pat] = pattern_hits.get(pat, 0) + 1
        if s <= 0:
            continue
        c2 = dict(c)
        c2["score"] = s
        c2["relevance_reason"] = reason
        (scored if s >= args.min_score else bench).append(c2)

    sort_key = lambda c: (-c["score"], -seniority_rank(c.get("seniority", "")), (c.get("name") or ""))
    scored.sort(key=sort_key)
    bench.sort(key=sort_key)

    if args.top:
        scored = scored[: args.top]

    out_path = Path(args.output)
    out_path.write_text(json.dumps({"contacts": scored, "total": len(scored)}, indent=2))
    bench_path = out_path.with_suffix(".bench.json")
    bench_path.write_text(json.dumps({"contacts": bench, "total": len(bench)}, indent=2))

    stats = {
        "total_input": len(cands),
        "score_distribution": dist,
        "min_score": args.min_score,
        "kept": len(scored),
        "benched_below_min_score": len(bench),
        "pattern_hits": dict(sorted(pattern_hits.items(), key=lambda kv: -kv[1])),
        "output": str(out_path),
        "bench_output": str(bench_path),
    }
    stats_path = out_path.with_suffix(".stats.json")
    stats_path.write_text(json.dumps(stats, indent=2))
    print(json.dumps(stats, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
