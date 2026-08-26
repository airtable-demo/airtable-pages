from __future__ import annotations
"""
PSU/Inbound Sequencer - deterministic engine core (Python 3.9 sandbox safe).

Pure-compute helpers the agent calls each Live Mode tick. No network / no I/O here:
classification, routing matrix, business-day cadence scheduling, DNC, send-window.
The stateful parts (Databricks intake, Gmail send/reply/read, HA Table writes) are
orchestrated by the agent via native integration tools.
"""
import re
import datetime as dt
from typing import Optional, Dict, Tuple

# --- Classification -----------------------------------------------------------
ATL_RE = re.compile(
    r"(\bchief\b|\bceo\b|\bcfo\b|\bcoo\b|\bcto\b|\bcmo\b|\bcro\b|\bcio\b|\bcxo\b|"
    r"\bsvp\b|\bevp\b|\bvp\b|\bfounder|\bpresident|vice president|head of|\bdirector)",
    re.IGNORECASE,
)

def tier_of(title: Optional[str]) -> str:
    return "ATL" if title and ATL_RE.search(title) else "BTL"

def mql_type(product_sign_up_date, latest_handraiser_date, is_champion_mover) -> str:
    # priority order: HR > moving champion > PSU > MQL
    if latest_handraiser_date:
        return "HR"
    if is_champion_mover:
        return "moving champion"
    if product_sign_up_date:
        return "PSU"
    return "MQL"

def classify(title, is_enterprise_user, account_stage) -> Dict[str, object]:
    return {
        "tier": tier_of(title),
        "ent_user": bool(is_enterprise_user),
        "ent_acct": (account_stage == "5. ENT Customer"),
    }

# --- DNC (Luke's personal policy) --------------------------------------------
DNC_HARD = ("apple", "roblox", "block")  # never auto-contact, drop at intake — even ATL, even handraisers.
# Apple = contractual no-contact. Roblox + Block (Luke 2026-06-18) = full DNC; the ONE exception is
# handraisers, which Luke contacts MANUALLY — so the sequencer still never auto-sends them.

# 2026-08-20 (Luke, explicit): Uber, Williams-Sonoma, IGT, S&B, Scopely, eBay are all
# moved to FULL CONTACT — the soft-DNC ATL-only restriction is RETIRED. DNC_SOFT is now
# EMPTY (kept as a tuple so the gate structure stays intact if Luke re-adds an account).
DNC_SOFT = ()  # was ("uber","williams-sonoma","igt","s&b","scopely","ebay") — all released 8/20
# Also already full CONTACT: intuit, autodesk, blue shield, servicetitan, EA, Meta, sutter health.

# --- CODE-RED outbound holds (no net-new outbound of any kind) -------------------
# 2026-08-20 (Luke): T-Mobile = code-red (outbound blocked). Both block
# NET-NEW outbound only — inbound replies to these accounts are still worked (that path
# lives in the Prospect Reply Drafter, not this engine).
# 2026-08-24 (Luke, explicit): Cisco temp DNC LIFTED EARLY — Cisco is a top-tier account
# and Luke wants maximum coverage to generate opps quickly. TEMP_DNC is now EMPTY (kept
# as a tuple so the gate structure stays intact if Luke re-adds an account).
# Prospect-side executives (VPs/SVPs/Presidents at Cisco or any account) are VALID targets —
# seniority at the prospect's company never blocks a send; the exec carve-out applies ONLY
# to Airtable employees (never CC/loop Airtable leadership into prospect threads).
CODE_RED = ("t-mobile", "tmobile")
CODE_RED_DOMAINS = ("t-mobile.com", "tmobile.com")
TEMP_DNC = ()                  # was ("cisco",) — Cisco released to full contact 2026-08-24 (Luke)
TEMP_DNC_DOMAINS = ()          # was ("cisco.com",)

def on_code_red(account_name: Optional[str]) -> bool:
    n = (account_name or "").lower()
    return any(h in n for h in CODE_RED) or any(h in n for h in TEMP_DNC)

# --- DUPLICATE-SEND GUARD (2026-08-24, after the Riot 7x + jesumedi 2x defect) ---------
# Verified 2026-08-24: the standing cadence re-sent identical E1s to the same recipients
# (ext.novwu@partner.riotgames.com received the same first-touch 7 times over 3 weeks;
# jesumedi@cisco.com got two copies in one minute from a retry after the original send
# actually succeeded). Root cause: send decisions were made from ledger/local state, not
# from the live Gmail Sent log, so retries and overlapping runs each opened fresh threads.
# RULE: before EVERY send (E1 or follow-up), the SENDER must check the live Gmail Sent log
# for the exact recipient address (most recent send date). A recipient with any prior send
# inside the cadence window is a SKIP, regardless of what the ledger or lead record says.
# Retries: a send is only 'failed' if Gmail returned NO message id; if a message id exists,
# NEVER re-send — verify against the Sent log first.

# --- PSU-outreach DNC (sequencer-only block; replies to lead responses still OK) ----
# 2026-08-20 (Luke): Sutter Health moved to FULL CONTACT — the PSU-only block is RETIRED.
# PSU_DNC is now EMPTY (kept as a tuple so the gate structure stays intact).
PSU_DNC = ()
PSU_DNC_DOMAINS = ()

def on_psu_dnc(account_name: Optional[str]) -> bool:
    n = (account_name or "").lower()
    return any(h in n for h in PSU_DNC)

def dnc_status(account_name: Optional[str]) -> str:
    n = (account_name or "").lower()
    if any(h in n for h in DNC_HARD):
        return "hard"
    if any(s in n for s in DNC_SOFT):
        return "soft"
    return "ok"

# --- Compliance hold (NOT DNC; pending external account-team clearance) -------
# Intuit moved OFF the DNC list 2026-06-17 (full contact). It had been held pending Luke's
# explicit in-thread confirmation re: the Carie Moore / Tyler Stirnus WRITTEN account-team
# commitment (route all Intuit user outreach through the account team first; reps were
# formally reminded to stop).
# 2026-06-23: Luke explicitly directed "unblock Intuit for now" — hold LIFTED. To reinstate
# the block (e.g. if the account-team commitment resurfaces), re-add "intuit" to this tuple.
COMPLIANCE_HOLD = ()  # empty = no compliance hold; Intuit unblocked 2026-06-23 per Luke

def on_compliance_hold(account_name: Optional[str]) -> bool:
    n = (account_name or "").lower()
    return any(h in n for h in COMPLIANCE_HOLD)

# --- Pending hold (fail-closed account freeze awaiting Luke's explicit decision) ----
# 2026-07-06: Freshworks added. Luke has had a standing "hold Freshworks" instruction
# since 2026-07-02, but it existed only as prose in sweep briefs — unattended Live Mode
# ticks (which get no brief) sent E1s to Freshworks leads on 7/3 (6 leads) and 7/6
# (sharmila.prabhakaran). This tuple makes the hold CODE-ENFORCED at intake AND at the
# build_send.py chokepoint. This is NOT a DNC classification — it is a temporary
# fail-closed freeze until Luke decides: normal / soft-DNC / hard-DNC / compliance-hold.
# To release: remove "freshworks" from the tuple (and add to DNC lists if that's the call).
PENDING_HOLD = ()  # was ("freshworks",) — Freshworks ruled FULL CONTACT 2026-08-20 (Luke). Empty = no freeze.

def on_pending_hold(account_name: Optional[str]) -> bool:
    n = (account_name or "").lower()
    return any(h in n for h in PENDING_HOLD)

def keep_decision(dnc: str, tier: str, is_handraiser: bool, compliance_hold: bool = False,
                  pending_hold: bool = False, psu_dnc: bool = False,
                  outreach_opted_out: bool = False, code_red: bool = False) -> Tuple[bool, str]:
    """Single source of truth for intake keep/drop. Returns (keep, reason).

    PRECEDENCE — Outreach opt-out, code-red, pending hold, compliance hold, PSU-outreach DNC,
    and hard DNC are ABSOLUTE and override everything, including the 'handraisers always contacted' rule.
        outreach_opted_out -> always DROP (prospect opted out in Outreach — a consent stop,
                           highest precedence). The AUTHORITATIVE opt-out check is build_send.py's
                           chokepoint guard; this drops it at intake too when the status is known
                           cheaply (e.g. from the send chokepoint's opt-out cache).
        code_red        -> always DROP (T-Mobile code-red / Cisco temp DNC — no net-new outbound)
        pending_hold    -> always DROP (account frozen awaiting Luke's explicit decision)
        compliance_hold -> always DROP (Intuit-style, pending account-team clearance)
        psu_dnc         -> always DROP from SEQUENCER intake (PSU outreach off; replies handled outside)
        hard            -> always DROP (Apple/Roblox/Block — even handraisers)
        soft            -> keep iff tier == 'ATL' OR is_handraiser; else DROP
        ok              -> keep
    Apple is a contractual no-contact; the handraiser override applies ONLY to soft-DNC.
    """
    if outreach_opted_out:
        return (False, "opted_out")                      # Outreach opt-out — consent stop, absolute
    if code_red:
        return (False, "code_red")                       # T-Mobile code-red — no outbound
    if pending_hold:
        return (False, "pending_hold")                   # frozen until Luke decides
    if compliance_hold:
        return (False, "compliance_hold")                # Intuit — held until Luke clears
    if psu_dnc:
        return (False, "psu_dnc")                        # PSU outreach off
    if dnc == "hard":
        return (False, "hard_dnc")                       # Apple/Roblox/Block — absolute
    if dnc == "soft":
        if tier == "ATL" or is_handraiser:
            return (True, "soft_ok_atl_or_handraiser")
        return (False, "soft_dnc_btl")
    return (True, "ok")

def keep_decision_for(account_name: Optional[str], tier: str, is_handraiser: bool,
                      outreach_opted_out: bool = False) -> Tuple[bool, str]:
    """Convenience wrapper that computes EVERY account gate from the account name so a
    tick can't forget one (the 7/3 and 7/6 Freshworks breaches happened because a tick
    computed dnc_status but never consulted the hold). ALWAYS prefer this at intake.

    outreach_opted_out is per-EMAIL (not derivable from the account name), so it stays a
    param the caller supplies when it already knows — cheaply — that the prospect opted out
    in Outreach (e.g. the email is marked opted_out in /tmp/psu_optout_cache.json, which the
    send chokepoint populates). The authoritative opt-out guard remains build_send.py; this
    is the cheap intake-side drop so a known-opted-out lead never even enters the ledger."""
    return keep_decision(
        dnc_status(account_name),
        tier,
        is_handraiser,
        compliance_hold=on_compliance_hold(account_name),
        pending_hold=on_pending_hold(account_name),
        psu_dnc=on_psu_dnc(account_name),
        outreach_opted_out=outreach_opted_out,
        code_red=on_code_red(account_name),
    )

# --- Routing ------------------------------------------------------------------
def route(tier: str, ent_user: bool, ent_acct: bool, account_name: Optional[str],
          top10: Dict[str, str]) -> Tuple[str, str]:
    """Return (bucket_label, source_seq_id). top10 = {acct_substr: seq_id}.
    Non-top-10 uses Luke's canonical LS-leads routing logic (source Outreach IDs 21793-21796).
    Each source sequence's COPY is cloned into Gmail templates; the ID is the template key.
    ent_acct here means account_stage == '5. ENT Customer'."""
    n = (account_name or "").lower()
    for acct_sub, seq in top10.items():
        if acct_sub and acct_sub in n:
            return ("top10:" + acct_sub, seq)
    atl = (tier == "ATL")
    if atl and ent_user:
        return ("matrix", "21794")                  # ATL + ENT-user  (High Value PSU)
    if atl and (not ent_user) and ent_acct:
        return ("matrix", "21796")                  # ATL + non-ENT-user + ENT acct
    if (not atl) and (not ent_user) and ent_acct:
        return ("matrix", "21795")                  # BTL + non-ENT-user + ENT acct
    if (not atl) and ent_user:
        return ("matrix", "21793")                  # BTL + ENT-user (any acct)
    if (not atl) and (not ent_user) and (not ent_acct):
        return ("matrix", "21793")                  # BTL + non-ENT-user + non-ENT acct
    # GAP not covered by original prompt: ATL + non-ENT-user + non-ENT acct.
    # Default to 21796 (ATL non-ENT). FLAGGED for Luke's confirmation.
    return ("matrix", "21796")

# --- Business-day cadence (4 emails: 0/3/6/9 business days) -------------------
CADENCE_BDAYS = [0, 3, 6, 9]

def add_business_days(start: dt.date, n: int) -> dt.date:
    d = start
    if n <= 0:
        while d.weekday() >= 5:  # roll weekend start to Monday
            d += dt.timedelta(days=1)
        return d
    added = 0
    while added < n:
        d += dt.timedelta(days=1)
        if d.weekday() < 5:
            added += 1
    return d

def schedule_steps(e1_date: dt.date) -> Dict[str, str]:
    return {f"E{i+1}": add_business_days(e1_date, off).isoformat()
            for i, off in enumerate(CADENCE_BDAYS)}

# --- Send window (Mon-Fri 08:00-19:00 CT) ------------------------------------
# Extended to 19:00 CT (7 PM) per Luke 2026-06-25 — applies to ALL send windows going forward.
def in_send_window(now_ct: dt.datetime) -> bool:
    return now_ct.weekday() < 5 and 8 <= now_ct.hour < 19

# --- Self test ----------------------------------------------------------------
if __name__ == "__main__":
    top10 = {"cisco": "cisco-custom-seq", "t-mobile": "tmobile-custom-seq"}

    samples = [
        # title, is_ent_user, account_stage, account_name  -> expected
        ("VP of Engineering", True,  "5. ENT Customer", "Cisco Systems, Inc."),  # top10
        ("Director, Data",    True,  "5. ENT Customer", "Rivian"),               # ATL+ENT -> 21794
        ("Head of Ops",       False, "5. ENT Customer", "Rivian"),               # ATL+nonENT+ENTacct -> 21796
        ("Head of Growth",    False, "1. Greenfield",   "Tiny Startup"),         # GAP ATL+nonENT+nonENT -> 21796
        ("Product Manager",   True,  "5. ENT Customer", "Meta"),                 # BTL+ENT -> 21793
        ("Analyst",           False, "5. ENT Customer", "Meta"),                 # BTL+nonENT+ENTacct -> 21795
        ("Coordinator",       False, "3. PQA",          "Startup Co"),           # BTL+nonENT+nonENT -> 21793
        ("Director, Ops",     False, "1. Greenfield",   "Apple Inc."),           # dnc hard
    ]
    print("=== classify + dnc + route (Luke's LS-leads logic) ===")
    for t, eu, st, an in samples:
        c = classify(t, eu, st)
        d = dnc_status(an)
        b, seq = route(c["tier"], c["ent_user"], c["ent_acct"], an, top10)
        print(f"{an:20} | {t:18} | {c['tier']} eu={int(c['ent_user'])} ea={int(c['ent_acct'])} "
              f"| dnc={d:4} | {b:14} -> {seq}")

    print("\n=== cadence (Fri E1 -> weekend skip) ===")
    for d0 in ["2026-06-19", "2026-06-15"]:  # Fri, Mon
        e1 = dt.date.fromisoformat(d0)
        print(f"E1 {d0} ({e1.strftime('%a')}): {schedule_steps(e1)}")

    print("\n=== send window ===")
    for s in ["2026-06-17T09:00", "2026-06-17T19:00", "2026-06-20T10:00"]:
        x = dt.datetime.fromisoformat(s)
        print(f"{s} ({x.strftime('%a')}): in_window={in_send_window(x)}")
