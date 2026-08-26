#!/usr/bin/env python3
"""
Generic merge + filter for outbound_account_play.

After LeadIQ reveal returns emails, this script:
  0. FIT GATE (v2, 2026-07-09): drops candidates below --min-score (default 2).
     Score-1 "low" generics NEVER silently fill a play — pass --allow-low ONLY with
     explicit AE sign-off, and even then lows only top up after every >=min-score
     candidate is used, loudly reported in the fit report.
  1. Merges scored search records with reveal records by normalized LinkedIn URL
  2. Filters: email status must contain "Verified" (Verified / VerifiedLikely)
  3. Filters: email local part must contain first or last name (>=3 chars)
  4. Filters: email domain must be in the account's owned-domain whitelist
  5. Re-applies title skip patterns on the REVEALED title (LeadIQ reveal can return
     updated titles different from search; catches misrouted records)
  6. Dedupes by full name (catches same person with two LinkedIn URLs)
  7. Sorts by score desc, then by seniority rank, then by name
  8. Trims to exactly --count — shortfalls are surfaced honestly, never backfilled
  9. Writes <output>.fit_report.json: score mix, % high-fit, seniority mix,
     shortfall, and any low-score usage. The play summary MUST surface this to
     the AE (fit quality is part of the deliverable, not a hidden internal stat).

CLI:
  python3 merge_and_filter.py \\
    --search /path/to/scored.json \\
    --reveal /path/to/revealed.json \\
    --config /path/to/persona_config.json \\
    --domains /path/to/account_domains.json \\
    --count 50 \\
    --output /path/to/final.json \\
    [--min-score 2] [--allow-low]

account_domains.json shape:
  {"domains": ["wynnresorts.com", "wynnlasvegas.com", ...]}
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


def normalize_linkedin(url: str) -> str:
    if not url:
        return ""
    return (url or "").strip().rstrip("/").lower().split("?")[0]


def name_in_email_local(email_local: str, first: str, last: str) -> bool:
    local = (email_local or "").lower()
    first = (first or "").lower().strip()
    last = (last or "").lower().strip()
    if len(first) >= 3 and first in local:
        return True
    if len(last) >= 3 and last in local:
        return True
    # tolerate partial last-name (e.g. "smith" in "smithers" or "smit" in "smith")
    if len(last) >= 3:
        for n in range(len(last), 2, -1):
            if last[:n] in local:
                return True
    return False


def should_skip_title(title: str, patterns: list) -> tuple[bool, str | None]:
    t = (title or "").lower()
    for pat in patterns:
        if re.search(pat, t):
            return True, pat
    return False, None


def seniority_rank(s: str) -> int:
    s = (s or "").lower()
    return {"director": 3, "vp": 2, "manager": 1}.get(s, 0)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--search", required=True, help="Scored search JSON ({contacts: [...]})")
    ap.add_argument("--reveal", required=True, help="LeadIQ batch_reveal JSON ({contacts: [...]})")
    ap.add_argument("--config", required=True, help="Persona config JSON (skip_patterns reused)")
    ap.add_argument("--domains", required=True, help="Domain whitelist JSON ({domains: [...]})")
    ap.add_argument("--count", type=int, default=50, help="Trim to exactly N records")
    ap.add_argument("--output", required=True, help="Output path for final filtered JSON")
    ap.add_argument("--min-score", type=int, default=2,
                    help="Minimum persona-fit score for the final list (default 2)")
    ap.add_argument("--allow-low", action="store_true",
                    help="Permit below-min-score candidates to top up AFTER all qualifying "
                         "candidates — requires explicit AE sign-off, loudly reported")
    args = ap.parse_args()

    search = json.loads(Path(args.search).read_text()).get("contacts", [])
    reveal = json.loads(Path(args.reveal).read_text()).get("contacts", [])
    cfg = json.loads(Path(args.config).read_text())
    whitelist = {d.lower() for d in json.loads(Path(args.domains).read_text())["domains"]}

    # Dedupe reveal records by LinkedIn URL (prefer one with email)
    rev_by_ln = {}
    for r in reveal:
        key = normalize_linkedin(r.get("linkedinUrl", "")) or f"name:{(r.get('name') or '').lower()}"
        if key not in rev_by_ln or (r.get("email") and not rev_by_ln[key].get("email")):
            rev_by_ln[key] = r
    reveal = list(rev_by_ln.values())

    # Index search by LinkedIn URL
    search_by_ln = {}
    for c in search:
        ln = normalize_linkedin(c.get("linkedinUrl", ""))
        if ln:
            search_by_ln[ln] = c
        else:
            search_by_ln[f"{(c.get('name') or '').lower()}_{(c.get('company') or '').lower()}"] = c

    # Merge
    merged = []
    for r in reveal:
        ln = normalize_linkedin(r.get("linkedinUrl", ""))
        sr = search_by_ln.get(ln)
        if not sr and r.get("name"):
            sr = search_by_ln.get(f"{r['name'].lower()}_{(r.get('company') or '').lower()}")
        sr = sr or {}

        name_str = r.get("name", "") or ""
        parts = name_str.split(" ", 1)
        first = sr.get("firstName") or (parts[0] if parts else "")
        last = sr.get("lastName") or (parts[1] if len(parts) > 1 else "")
        full = name_str or sr.get("name", "")

        email = r.get("email") or ""
        es_raw = r.get("emailStatus") or ""
        email_status = es_raw.split("/")[-1] if "/" in es_raw else es_raw
        email_domain = email.split("@")[-1].lower() if "@" in email else ""

        city = sr.get("city") or ""
        state = sr.get("state") or ""
        country = sr.get("country") or ""
        if not city and r.get("location"):
            lp = r["location"].split(",")
            if len(lp) >= 2:
                city = lp[0].strip()
                country = lp[-1].strip()

        merged.append({
            "first_name": first,
            "last_name": last,
            "full_name": full,
            "title": r.get("title") or sr.get("title", ""),
            "seniority": sr.get("seniority", ""),
            "company": r.get("company") or sr.get("company", ""),
            "email": email,
            "email_status": email_status,
            "email_domain": email_domain,
            "linkedin_url": r.get("linkedinUrl") or sr.get("linkedinUrl", ""),
            "city": city,
            "state": state,
            "country": country,
            "score": sr.get("score", 0),
            "relevance_reason": sr.get("relevance_reason", "unknown"),
        })

    print(f"Merged: {len(merged)}", file=sys.stderr)

    # F1: email status Verified*
    f1 = [c for c in merged if c["email"] and "Verified" in c["email_status"]]
    print(f"After Verified-email filter: {len(f1)}", file=sys.stderr)

    # F2: name in email local part
    f2 = []
    for c in f1:
        local = c["email"].split("@")[0] if "@" in c["email"] else ""
        if name_in_email_local(local, c["first_name"], c["last_name"]):
            f2.append(c)
    print(f"After name-in-email filter: {len(f2)}", file=sys.stderr)

    # F3: domain whitelist
    f3 = [c for c in f2 if c["email_domain"] in whitelist]
    f3_drop = [c for c in f2 if c["email_domain"] not in whitelist]
    print(f"After domain-whitelist filter: {len(f3)} (dropped {len(f3_drop)})", file=sys.stderr)
    for c in f3_drop:
        print(f"  dropped non-whitelist: {c['full_name']} | {c['email']}", file=sys.stderr)

    # F4: revealed-title skip
    skip_pats = cfg.get("skip_patterns", [])
    f4 = []
    for c in f3:
        skip, pat = should_skip_title(c["title"], skip_pats)
        if not skip:
            f4.append(c)
        else:
            print(f"  dropped title-skip: {c['full_name']} | {c['title']} | matched {pat}", file=sys.stderr)
    print(f"After title-skip filter: {len(f4)}", file=sys.stderr)

    # F5: name dedup
    seen, f5 = set(), []
    for c in f4:
        nk = (c["full_name"] or "").lower().strip()
        if nk and nk not in seen:
            seen.add(nk)
            f5.append(c)
    print(f"After name-dedup: {len(f5)}", file=sys.stderr)

    # F6 (FIT GATE): enforce min-score. Lows never silently fill the play.
    qualified = [c for c in f5 if c["score"] >= args.min_score]
    lows = [c for c in f5 if 0 < c["score"] < args.min_score]
    print(f"After min-score>={args.min_score} gate: {len(qualified)} "
          f"(benched {len(lows)} low-fit)", file=sys.stderr)

    sort_key = lambda c: (-c["score"], -seniority_rank(c.get("seniority", "")), c["full_name"])
    qualified.sort(key=sort_key)
    lows.sort(key=sort_key)

    final = qualified[: args.count]
    low_used = 0
    if len(final) < args.count and args.allow_low and lows:
        top_up = lows[: args.count - len(final)]
        low_used = len(top_up)
        final = final + top_up
        print(f"!! --allow-low: topped up with {low_used} below-min-score candidates "
              f"(AE sign-off required; surfaced in fit report)", file=sys.stderr)

    for c in final:
        c.pop("email_domain", None)

    Path(args.output).write_text(json.dumps(final, indent=2))
    print(f"Final: {len(final)} -> {args.output}", file=sys.stderr)

    score_dist = {}
    for c in final:
        score_dist[c["score"]] = score_dist.get(c["score"], 0) + 1
    seniority_dist = {}
    for c in final:
        sk = (c.get("seniority") or "unknown").lower() or "unknown"
        seniority_dist[sk] = seniority_dist.get(sk, 0) + 1
    n_high = score_dist.get(3, 0)
    fit_report = {
        "requested": args.count,
        "final_count": len(final),
        "shortfall": max(0, args.count - len(final)),
        "score_mix": score_dist,
        "pct_high_fit": round(n_high / len(final), 2) if final else 0.0,
        "avg_score": round(sum(c["score"] for c in final) / len(final), 2) if final else 0.0,
        "seniority_mix": seniority_dist,
        "min_score": args.min_score,
        "low_fit_used": low_used,
        "low_fit_benched": len(lows) - low_used,
        "note": ("SURFACE THIS TO THE AE in the play summary. pct_high_fit < 0.6 means the "
                 "account's talent pool is thin for this POV — consider narrowing N, widening "
                 "discovery, or adjusting the POV's target personas. A shortfall is honest; "
                 "a play padded with weak fits is not."),
    }
    report_path = Path(args.output).with_suffix(".fit_report.json")
    report_path.write_text(json.dumps(fit_report, indent=2))
    print(f"Score distribution: {score_dist} | pct_high_fit={fit_report['pct_high_fit']} "
          f"| fit report -> {report_path}", file=sys.stderr)

    return 0 if len(final) > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
