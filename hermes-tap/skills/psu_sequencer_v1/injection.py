from __future__ import annotations
"""
Per-lead injection generator (top-10 accounts only).
Computed PER LEAD at intake -> written to a custom variable (custom85) ->
rendered into the email at send. The account base copy is already account-customized;
this adds the per-lead layer: position/team ack + MSA-for-non-ENT-user + social proof.

DRAFT COPY - phrasing marked for Luke's review. Mechanism is final; words are his call.
"""
import re
from typing import Optional, List

# ---- function/team derivation from title (lightweight, deterministic) --------
FUNCTION_KEYWORDS = [
    ("Marketing",  r"market|brand|demand gen|growth|content|comms|campaign|seo|social"),
    ("Product",    r"\bproduct\b|\bpm\b|roadmap|product manager|product owner"),
    ("Engineering",r"engineer|developer|\bdev\b|software|swe|devops|infra|platform|technical lead"),
    ("Sales",      r"\bsales\b|account exec|\bae\b|\bbdr\b|\bsdr\b|revenue|gtm|account manager"),
    ("Operations", r"operations|\bops\b|program manager|project manager|\bpmo\b|biz ops"),
    ("Design",     r"design|\bux\b|\bui\b|creative|researcher"),
    ("Finance",    r"finance|fp&a|account(ing|ant)|controller|treasury"),
    ("Data",       r"\bdata\b|analytics|analyst|\bbi\b|insights|science"),
    ("People",     r"people|human resources|\bhr\b|talent|recruit|l&d"),
    ("IT",         r"information technology|\bit\b|helpdesk|systems admin|workplace tech"),
]

def derive_function(title: Optional[str], sfdc_function: Optional[str] = None) -> Optional[str]:
    if sfdc_function:
        return sfdc_function
    t = (title or "").lower()
    for fn, pat in FUNCTION_KEYWORDS:
        if re.search(pat, t):
            return fn
    return None

def _humanize_teams(teams: List[str]) -> str:
    teams = [t for t in (teams or []) if t]
    if not teams:
        return ""
    if len(teams) == 1:
        return teams[0]
    if len(teams) == 2:
        return f"{teams[0]} and {teams[1]}"
    return f"{', '.join(teams[:-1])}, and {teams[-1]}"

def build_custom85(title: Optional[str], account: str, ent_user: bool, ent_account: bool,
                   account_teams: Optional[List[str]] = None,
                   sfdc_function: Optional[str] = None) -> str:
    """Return the per-lead injection string for custom85 (top-10 leads only).
    ent_account == True implies an MSA/Enterprise agreement is in place.
    account_teams = functions already using Airtable at the account (from Databricks)."""
    fn = derive_function(title, sfdc_function)
    teams = _humanize_teams(account_teams)
    parts = []

    # 1) MSA angle — only when the person is NOT on an enterprise license but the account HAS an MSA
    if (not ent_user) and ent_account:
        parts.append(
            f"{account} already has an Enterprise agreement with Airtable in place, so your "
            f"team can get set up with no procurement lift and full enterprise security and governance."
        )

    # 2) Social proof — teams we already work with at the account (+ tie to their function)
    if teams and fn:
        parts.append(f"We already work with {teams} at {account}, and partner closely with {fn} teams like yours.")
    elif teams:
        parts.append(f"We already work with {teams} at {account}.")
    elif fn:
        parts.append(f"We partner with a number of {fn} teams on workflows like yours.")

    return " ".join(parts).strip()


if __name__ == "__main__":
    samples = [
        # title, account, ent_user, ent_account, account_teams
        ("Marketing Manager", "Meta", False, True, ["Product", "Brand"]),
        ("Staff Product Manager", "Cisco", True, True, ["Engineering", "Product Ops"]),
        ("Data Analyst", "Electronic Arts", False, True, []),
        ("Software Engineer", "Adobe", True, True, ["Design"]),
        ("Office Coordinator", "Riot Games", False, True, None),
    ]
    print("=== custom85 per-lead injection (DRAFT copy) ===")
    for ti, ac, eu, ea, tm in samples:
        fn = derive_function(ti)
        s = build_custom85(ti, ac, eu, ea, tm)
        print(f"\n[{ac}] {ti}  (function={fn}, ent_user={eu})")
        print(f"  custom85 = {s!r}")
