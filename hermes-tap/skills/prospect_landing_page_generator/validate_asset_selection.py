#!/usr/bin/env python3
"""
validate_asset_selection.py — deterministic guard against cross-function asset picks.

The asset ranker (asset_selection_prompt.md) chooses 2 demo videos + 2 customer
stories for a POV. The single worst failure is a demo whose business FUNCTION does
not match the POV's function (e.g. a marketing-campaign demo on a product POV).
This validator re-derives each asset's function from its own text (use cases /
personas / name / description) and compares it to the POV's target function,
independent of whatever the LLM self-reported in `function_match`. So it catches
the mistake even when the model convinces itself the pick was fine.

Input JSON (the asset_selection_prompt.md output shape):
{
  "target_function": "Product & Design",
  "videos":  [ { "name","url","description","asset_function","function_match",
                 "use_cases"?,"personas"? }, ... ],
  "stories": [ { ...same... }, ... ]
}
`use_cases` / `personas` are optional; if absent, function is inferred from
name + description + asset_function + rationale text.

Rules:
- DEMO VIDEO whose inferred function CONFLICTS with the target (different, non-adjacent,
  and confidently inferred) -> ERROR (hard). This is the marketing-demo-on-product-POV case.
- DEMO VIDEO with function_match=false and no fallback_reason -> ERROR.
- CUSTOMER STORY conflict or function_match=false -> WARNING (stories may fall back
  to a strong industry analog when no in-function story exists).
- Must have exactly 2 videos and 2 stories -> else ERROR.
- target_function missing/unclassifiable -> ERROR.

Exit codes: 0 = clean, 1 = warnings only, 2 = errors. With --strict, any ERROR exits 2.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from typing import Dict, List, Optional, Tuple

# function bucket -> keyword set (matched against asset/POV text, word-ish)
FUNCTION_KEYWORDS: Dict[str, List[str]] = {
    "marketing": [
        "marketing", "campaign", "brand", "content", "creative", "demand gen",
        "demand generation", "comms", "communications", "events", "social",
        "advertising", "advert", "seo", "go-to-market collateral", "editorial",
        "creative ops", "creative operations", "marketing ops", "marketing operations",
    ],
    "product": [
        "product", "roadmap", "product launch", "launches", "product operations",
        "product ops", "design", "ux", "ui", "feature", "product management",
        "pmm", "product marketing",  # pmm leans product
    ],
    "sales": [
        "sales", "pipeline", "account planning", "territory", "deal desk",
        "revops", "revenue operations", "crm", "gtm", "quota", "account management",
        "sales operations", "sales ops",
    ],
    "engineering": [
        "engineering", "software development", "developer", "dev workflow",
        "release management", "release", "sprint", "devops", "qa", "bug",
        "eng program",
    ],
    "operations": [
        "operations", "business operations", "program management", "pmo",
        "project management", "capital project", "capital program", "supply chain",
        "procurement", "vendor", "logistics", "manufacturing", "production",
        "biz ops", "bizops", "workflow orchestration", "process",
    ],
    "finance": [
        "finance", "fp&a", "fpa", "accounting", "budget", "forecast", "audit",
        "financial planning",
    ],
    "hr": [
        "human resources", " hr ", "people ops", "people operations", "recruiting",
        "talent", "onboarding", "l&d", "learning and development", "people team",
    ],
    "it": [
        "it ", "information technology", "helpdesk", "help desk", "service desk",
        "provisioning", "asset management", "itsm", "infrastructure",
    ],
    "cs": [
        "customer success", "customer service", "csm", "renewal", "customer support",
        "support team", "customer experience", "cx ",
    ],
    "legal": [
        "legal", "compliance", "contract", "governance", "risk management",
        "legal ops", "legal operations",
    ],
}

# pairs that should NOT be treated as conflicts (genuinely adjacent functions)
ADJACENT: List[frozenset] = [
    frozenset({"product", "engineering"}),
    frozenset({"operations", "finance"}),
    frozenset({"operations", "it"}),
    frozenset({"cs", "it"}),
    frozenset({"cs", "sales"}),
]


def infer_function(text: str) -> Tuple[Optional[str], int]:
    """Return (best_bucket, hit_count). None if no signal."""
    t = " " + re.sub(r"[\n\r/|,;:()\[\]]", " ", (text or "").lower()) + " "
    scores: Dict[str, int] = {}
    for bucket, kws in FUNCTION_KEYWORDS.items():
        c = 0
        for kw in kws:
            c += t.count(kw)
        if c:
            scores[bucket] = c
    if not scores:
        return None, 0
    best = max(scores, key=lambda k: scores[k])
    return best, scores[best]


def normalize_target(target_function: str) -> Optional[str]:
    b, _ = infer_function(target_function or "")
    return b


def is_adjacent(a: str, b: str) -> bool:
    return frozenset({a, b}) in ADJACENT


def asset_text(a: dict) -> str:
    parts = [
        str(a.get("name", "")),
        str(a.get("description", "")),
        str(a.get("asset_function", "")),
        str(a.get("rationale", "")),
    ]
    uc = a.get("use_cases")
    pe = a.get("personas")
    if isinstance(uc, list):
        parts.append(" ".join(str(x) for x in uc))
    elif uc:
        parts.append(str(uc))
    if isinstance(pe, list):
        parts.append(" ".join(str(x) for x in pe))
    elif pe:
        parts.append(str(pe))
    return " ".join(parts)


def check(data: dict) -> Tuple[List[str], List[str]]:
    errors: List[str] = []
    warnings: List[str] = []

    target_raw = data.get("target_function", "")
    target = normalize_target(target_raw)
    if not target:
        errors.append(
            "target_function missing or unclassifiable: %r (cannot validate function match)"
            % target_raw
        )

    videos = data.get("videos") or []
    stories = data.get("stories") or []
    if len(videos) != 2:
        errors.append("expected exactly 2 demo videos, got %d" % len(videos))
    if len(stories) != 2:
        errors.append("expected exactly 2 customer stories, got %d" % len(stories))

    def eval_asset(a: dict, kind: str, hard: bool) -> None:
        name = a.get("name", "<unnamed>")
        inferred, hits = infer_function(asset_text(a))
        claimed_match = a.get("function_match", None)
        fallback_reason = a.get("fallback_reason") or a.get("rationale_fallback")

        # 1) self-reported fallback handling
        if claimed_match is False:
            msg = "%s '%s' is flagged function_match=false (cross-function fallback)" % (kind, name)
            if hard and not fallback_reason and "fallback" not in str(a.get("rationale", "")).lower():
                errors.append(msg + " with no fallback_reason / rationale — not allowed for a demo video")
            else:
                warnings.append(msg + " — allowed only if no in-function asset existed; verify the pool")

        # 2) deterministic conflict (independent of the self-report)
        if target and inferred and inferred != target and hits >= 1:
            if not is_adjacent(inferred, target):
                msg = ("%s '%s' reads as function '%s' but the POV target is '%s' "
                       "(cross-function mismatch)" % (kind, name, inferred, target))
                if hard:
                    errors.append(msg)
                else:
                    warnings.append(msg)

    for v in videos:
        eval_asset(v, "demo video", hard=True)
    for s in stories:
        eval_asset(s, "customer story", hard=False)

    return errors, warnings


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True, help="asset selection JSON file")
    ap.add_argument("--strict", action="store_true", help="exit 2 on any error")
    ap.add_argument("--json", action="store_true", help="emit JSON result")
    args = ap.parse_args()

    try:
        data = json.load(open(args.file, encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        print("FAILED to read/parse %s: %s" % (args.file, e), file=sys.stderr)
        return 2

    errors, warnings = check(data)
    ok = len(errors) == 0

    if args.json:
        print(json.dumps({"ok": ok, "errors": errors, "warnings": warnings}, indent=2))
    else:
        if errors:
            print("ERRORS:")
            for e in errors:
                print("  - " + e)
        if warnings:
            print("WARNINGS:")
            for w in warnings:
                print("  - " + w)
        if ok and not warnings:
            print("OK: asset selection passes the function-match check.")
        elif ok:
            print("PASS (with warnings): no hard cross-function demo errors.")

    if errors:
        return 2
    if warnings:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
