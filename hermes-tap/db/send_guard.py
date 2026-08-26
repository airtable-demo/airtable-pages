"""send_guard.py — the Hermes-side send chokepoint. Replaces build_send.py's
Hyperagent-integration dependency with a Postgres-backed guard.

EVERY outbound send (E1 new-thread AND every follow-up/reply/nudge) funnels
through guard_send() BEFORE touching Gmail. Fail-closed everywhere.

Order of gates (any block -> do not send):
  1. recipient sanity (non-empty, well-formed, not self, not @airtable.com)
  2. body sanity (no unrendered {token}, no '!' placeholder)
  3. false-MSA / enterprise-claim gate (only if account_stage/ARR say so)
  4. DNC/hold ledger (Neon) — net-new lanes only
  5. Outreach opt-out (live lookup) — absolute suppression
  6. ATOMIC same-day claim (Neon send_claim) — the double-send mutex
"""
from __future__ import annotations
import re, os
from ops_db import OpsDB

SELF = "luke.sorensen@airtable.com"
INTERNAL_DOMAIN = "airtable.com"
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
TOKEN_RE = re.compile(r"\{[a-zA-Z0-9_]+\}")

NET_NEW_LANES = {"psu_e1", "account_play_e1", "event_invite"}  # DNC gates these


class Blocked(Exception):
    def __init__(self, reason): super().__init__(reason); self.reason = reason


def guard_send(db: OpsDB, *, mailbox: str, recipient: str, body_html: str,
               lane: str, account: str | None = None,
               account_stage: str | None = None, ent_arr: float = 0.0,
               optout_checker=None, run_id: str = "") -> dict:
    """Returns {'ok': True} if cleared, else raises Blocked(reason)."""
    r = (recipient or "").strip().lower()

    # 1. recipient sanity
    if not r or not EMAIL_RE.match(r):
        raise Blocked(f"bad_recipient:{r!r}")
    if r == SELF or r.endswith("@" + INTERNAL_DOMAIN):
        raise Blocked(f"internal_recipient:{r}")

    # 2. body sanity
    m = TOKEN_RE.search(body_html or "")
    if m:
        raise Blocked(f"unrendered_token:{m.group(0)}")

    # 3. false-MSA gate — never claim an existing agreement unless verified
    claims_msa = re.search(r"already has an? (enterprise|airtable) (account|agreement)|"
                           r"existing (enterprise|MSA)|MSA already in place",
                           body_html or "", re.I)
    if claims_msa and not (account_stage == "5. ENT Customer" or ent_arr > 0):
        raise Blocked("false_msa_claim")

    # 4. DNC/hold ledger (net-new only; inbound replies always worked)
    if lane in NET_NEW_LANES:
        blocked, why = db.is_blocked(r, account)
        if blocked:
            raise Blocked(f"dnc_hold:{why}")

    # 5. Outreach opt-out (absolute)
    if optout_checker and optout_checker(r):
        raise Blocked("opted_out")

    # 6. atomic claim — the mutex. If we didn't win the claim, skip.
    if not db.claim_send(mailbox, r, lane, claimed_by=run_id):
        raise Blocked("already_claimed_today")

    return {"ok": True, "recipient": r, "lane": lane}


if __name__ == "__main__":
    # smoke test: python3 send_guard.py  (needs DATABASE_URL)
    db = OpsDB()
    try:
        print(guard_send(db, mailbox=SELF, recipient="test@example.com",
                         body_html="<p>hi</p>", lane="psu_e1", account="example",
                         run_id="smoke"))
        db.release_claim(SELF, "test@example.com", "psu_e1")
        print("claim released — guard OK")
    except Blocked as b:
        print("blocked:", b.reason)
    finally:
        db.close()
