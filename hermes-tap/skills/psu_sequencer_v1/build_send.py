from __future__ import annotations
"""
Deterministic PSU send-packet builder + HARD recipient/body guard (fail-closed).

WHY THIS EXISTS (2026-06-23 incident):
The agent was hand-assembling Gmail follow-up calls during the Live Mode tick and
(a) omitted the `to` override on GmailReplyToMessage. Because every prior message
in a PSU thread is FROM Luke, a reply with no explicit recipient derives To=Luke,
so ~hundreds of E2 follow-ups looped back into Luke's own inbox; and (b) shipped
an unrendered "{sender}" token. A prose runbook reminder (2026-06-22 "always pass
to=email") did NOT stop it — the agent still skipped it on the next unattended tick.

This script removes recipient resolution + rendering from the agent's judgment.
It renders the step, resolves `to` STRICTLY from the prospect's email, and writes
the exact ExecuteIntegration params to a file. It FAILS CLOSED: on any unsafe
recipient (empty / self / internal @airtable.com / malformed), any unrendered
merge token or "!", any held/DNC account, or an Outreach OPT-OUT it emits
action=BLOCK, deletes the params file, and exits 2.

WHY THE OPT-OUT GUARD (2026-07-08 incident): a lead who had OPTED OUT in Outreach was
still contacted by the Gmail PSU engine and complained — the Gmail-direct engine never
consulted Outreach's opt-out state. The opt-out check (optout.py) now runs at this
chokepoint before any send. It shells out to the Outreach Connector, so build_send.py
MUST run under `RunWithCredentials skillName "Outreach Connector"` (which injects the
OUTREACH_* creds the connector needs). Fail-closed: if the lookup can't complete, BLOCK.

RAW-REPLY MODE closes the last bypass: the nudge/bump follow-up ("Re: {name}: Airtable")
used to hand-build GmailReplyToMessage and skip this chokepoint entirely (it evaded the
self-send tripwire AND the account holds — Freshworks 7/6, Sutter/Intuit/eBay/Uber 7/7).
Passing "raw_body" in the lead JSON renders that reply through the SAME guards here — so
EVERY send (E1s, cadence follow-ups, AND nudges) now routes through build_send.py.

The runbook's only send job becomes:
  1. write the lead's send-spec JSON to /tmp/psu_lead.json
  2. RunWithCredentials(skillName="Outreach Connector",
       command="cd <skill dir> && python3 build_send.py /tmp/psu_lead.json")
     (Outreach Connector creds are required for the opt-out lookup subprocess.)
  3. if it prints allow=true -> ExecuteIntegration(action=<printed action>,
     paramsFile="/tmp/psu_send_params.json")
  4. if allow=false -> DO NOT SEND. Branch on the printed block_class:
       systemic            -> mark Send-Error, HALT the send phase, alert Luke (regression guard).
       account_hold        -> suppress/skip this lead, CONTINUE the tick.
       opted_out           -> set Status=opted_out (permanent suppress), skip, CONTINUE the tick.
       optout_check_failed -> transient: skip this send, leave the lead due, CONTINUE; alert if frequent.

The recipient can no longer be derived-by-Gmail; `to` is always present and
verified before any send.

Input JSON (write to a file, pass its path):
{
  "email":         "<prospect email>",       # REQUIRED
  "first_name":    "<first name or ''>",
  "account":       "<account name>",
  "company":       "<company; defaults to account>",
  "seq":           "21793",                   # template key (matrix 21793-96 / top10 id) — TEMPLATE MODE
  "step_index":    1,                          # 0-based step to send                       — TEMPLATE MODE
  "e1_message_id": "<gmail message id of E1>", # REQUIRED for ANY reply (template reply or raw)
  "raw_body":      "<pre-composed reply HTML>" # OPTIONAL — RAW-REPLY MODE (nudge/bump); rendered
                                               #   through the same guards; forces a threaded reply.
}
Prints one-line JSON: {allow, action, block_class, to, step_index, reasons}.
"""
import argparse
import json
import os
import re
import sys

import render as R
import engine_core as EC
import optout as OPTOUT

SKILL = os.path.dirname(os.path.abspath(__file__))
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
TOKEN_RE = re.compile(r"\{[a-zA-Z_][a-zA-Z0-9_]*\}")  # leftover merge token, e.g. {sender}

# Account-hold guard at the SEND CHOKEPOINT (2026-07-06). Intake gates (keep_decision)
# only protect leads that flow through intake this tick — follow-ups (E2-E4) to leads
# sequenced BEFORE an account was frozen bypass intake entirely. Checking here means NO
# send of ANY step can reach a held/hard-DNC account, regardless of which tick built it
# or whether that tick got a sweep brief. Match on account name AND the recipient's email
# domain (belt and braces — account fields can be blank/mismatched on older ledger rows).
_DOMAIN_BLOCK_SUBSTRINGS = (tuple(EC.PENDING_HOLD) + tuple(EC.DNC_HARD) + tuple(EC.COMPLIANCE_HOLD)
                            + tuple(getattr(EC, "PSU_DNC", ())) + tuple(getattr(EC, "PSU_DNC_DOMAINS", ()))
                            + tuple(getattr(EC, "CODE_RED", ())) + tuple(getattr(EC, "CODE_RED_DOMAINS", ()))
                            + tuple(getattr(EC, "TEMP_DNC", ())) + tuple(getattr(EC, "TEMP_DNC_DOMAINS", ())))

def account_hold_reason(account_name: str, email: str) -> str:
    """Return a block reason ('code_red:…' / 'pending_hold:…' / 'hard_dnc:…' /
    'compliance_hold:…' / 'psu_dnc:…') or ''."""
    n = (account_name or "").lower()
    domain = email.split("@", 1)[1].lower() if "@" in email else ""
    # CODE-RED (2026-08-20: T-Mobile code-red). No net-new outbound of any
    # kind; name AND domain match. Inbound replies handled outside this engine.
    # 2026-08-24 (Luke): Cisco temp DNC LIFTED — TEMP_DNC is empty, loops below are inert
    # unless Luke re-adds an account. Prospect-side execs are valid targets; the exec
    # carve-out applies only to Airtable employees.
    for h in getattr(EC, "CODE_RED", ()):
        if h in n:
            return "code_red:" + h
    for h in getattr(EC, "CODE_RED_DOMAINS", ()):
        if h in domain:
            return "code_red:" + h
    for h in getattr(EC, "TEMP_DNC", ()):
        if h in n:
            return "code_red:" + h
    for h in getattr(EC, "TEMP_DNC_DOMAINS", ()):
        if h in domain:
            return "code_red:" + h
    for h in EC.PENDING_HOLD:
        if h in n or h in domain:
            return "pending_hold:" + h
    for h in EC.DNC_HARD:
        if h in n or h in domain:
            return "hard_dnc:" + h
    for h in EC.COMPLIANCE_HOLD:
        if h in n or h in domain:
            return "compliance_hold:" + h
    # PSU-outreach DNC (2026-07-06, Sutter Health): sequencer sends OFF (E1 + follow-ups);
    # replies to lead responses are handled by the Prospect Reply Drafter, not this path.
    # Name list matches account name; domain list matches recipient email domain
    # ("sutter health" can't substring-match sutterhealth.org, hence the split).
    for h in getattr(EC, "PSU_DNC", ()):
        if h in n:
            return "psu_dnc:" + h
    for h in getattr(EC, "PSU_DNC_DOMAINS", ()):
        if h in domain:
            return "psu_dnc:" + h
    return ""


# --- Block-reason classification for the runbook's send-phase branching (2026-07-08) -----
# The runbook must NOT halt the whole tick on every block: a per-lead opt-out or an
# account hold should suppress/skip that ONE lead and let the tick keep sending. Only the
# recipient/body/template "regression" class (the 480-loop flood risk) halts the tick.
#   systemic            -> recipient/body/template bug or self-loop class: mark Send-Error,
#                          HALT the send phase, alert Luke. (A systemic reason wins even if an
#                          account_hold reason is also present.)
#   account_hold        -> frozen/DNC account: suppress+skip this lead, CONTINUE the tick.
#   opted_out           -> Outreach opt-out: PERMANENTLY suppress (Status=opted_out), skip, CONTINUE.
#   optout_check_failed -> transient lookup failure: skip THIS send, leave the lead due (do NOT
#                          suppress), CONTINUE; alert Luke if it recurs (Outreach API issue).
_SUPPRESS_SKIP_PREFIX = "account_hold:"
_OPTOUT_PERM = "opted_out"
_OPTOUT_TRANSIENT = "optout_check_failed"


def classify_block(reasons):
    if not reasons:
        return None
    systemic = [r for r in reasons
                if not r.startswith(_SUPPRESS_SKIP_PREFIX)
                and r not in (_OPTOUT_PERM, _OPTOUT_TRANSIENT)]
    if systemic:
        return "systemic"
    if _OPTOUT_PERM in reasons:
        return "opted_out"
    if _OPTOUT_TRANSIENT in reasons:
        return "optout_check_failed"
    return "account_hold"


def load_templates():
    matrix = json.load(open(os.path.join(SKILL, "matrix_templates.json")))
    top10 = json.load(open(os.path.join(SKILL, "top10_templates.json")))
    return matrix, top10


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("lead_json", help="path to the lead send-spec JSON")
    ap.add_argument("--self", dest="self_addr", default="luke.sorensen@airtable.com",
                    help="the AE's own mailbox; a send resolving to this is BLOCKED")
    ap.add_argument("--params-out", default="/tmp/psu_send_params.json")
    ap.add_argument("--packet-out", default="/tmp/psu_send_packet.json")
    ap.add_argument("--optout-cache", default="/tmp/psu_optout_cache.json",
                    help="within-tick Outreach opt-out status cache (JSON email->status)")
    ap.add_argument("--optout-timeout", type=int, default=45,
                    help="per-lookup timeout (s) for the Outreach opt-out connector call")
    a = ap.parse_args()

    lead = json.load(open(a.lead_json))
    reasons = []

    email = (lead.get("email") or "").strip()
    first = (lead.get("first_name") or "").strip()
    account = (lead.get("account") or "").strip()
    company = (lead.get("company") or account).strip()
    seq = str(lead.get("seq") or "").strip()
    step_index = lead.get("step_index")
    e1_id = (lead.get("e1_message_id") or "").strip()
    self_addr = (a.self_addr or "").strip().lower()

    # --- RECIPIENT GUARD (the 480-loop root cause; absolute, fail-closed) ---
    if not email:
        reasons.append("empty_recipient")
    elif not EMAIL_RE.match(email):
        reasons.append("invalid_recipient:" + email)
    else:
        lo = email.lower()
        if lo == self_addr:
            reasons.append("recipient_is_self")            # exactly what flooded Luke's inbox
        if lo.endswith("@airtable.com"):
            reasons.append("recipient_internal_airtable")  # never a real external PSU prospect

    # --- ACCOUNT HOLD GUARD (2026-07-06; the 7/3 + 7/6 Freshworks breach class) ---
    # Absolute, fail-closed, applies to EVERY step (E1 and follow-ups). Frozen or
    # hard-DNC accounts can never be emailed through this chokepoint regardless of
    # which tick or session assembled the send.
    if email and EMAIL_RE.match(email):
        hold = account_hold_reason(account, email)
        if hold:
            reasons.append("account_hold:" + hold)

    # --- resolve the send: RAW-REPLY MODE (nudge/bump/any ad-hoc reply) or TEMPLATE MODE ---
    # RAW-REPLY MODE closes the nudge/follow-up bypass: the "Re: {name}: Airtable" bump and
    # any other hand-composed reply now route through THIS chokepoint (same recipient,
    # account-hold, opt-out, token/"!" guards) instead of a hand-built GmailReplyToMessage.
    raw_body = lead.get("raw_body")
    action = None
    params = None
    is_reply = None
    ctx = {"first_name": first, "account": account, "company": company,
           "sender": "Luke", "custom85": ""}

    if raw_body is not None:
        is_reply = True  # a raw reply always threads on E1 (never starts a new thread)
        body = R.fill(raw_body, ctx)
        leftover = TOKEN_RE.findall(body)
        if leftover:
            reasons.append("unrendered_tokens:" + ",".join(sorted(set(leftover))))
        if "!" in body:
            reasons.append("exclamation_mark")
        if not e1_id:
            reasons.append("reply_without_e1_message_id")
        action = "GmailReplyToMessage"
        params = {"messageId": e1_id, "to": email, "htmlBody": body}
    else:
        matrix, top10 = load_templates()
        tpl = top10.get(seq) or matrix.get(seq)
        step = None
        if not tpl:
            reasons.append("unknown_seq:" + seq)
        elif not isinstance(step_index, int) or not (0 <= step_index < len(tpl["steps"])):
            reasons.append("bad_step_index")
        else:
            step = tpl["steps"][step_index]
        if step is not None:
            rendered = R.render_step(step, ctx)
            subject = rendered["subject"]
            body = rendered["body_html"]
            is_reply = bool(rendered["is_reply"])
            # --- BODY/SUBJECT GUARD (catches the unrendered {sender} leak + copy rules) ---
            leftover = TOKEN_RE.findall(subject) + TOKEN_RE.findall(body)
            if leftover:
                reasons.append("unrendered_tokens:" + ",".join(sorted(set(leftover))))
            if "!" in subject or "!" in body:
                reasons.append("exclamation_mark")
            if is_reply:
                if not e1_id:
                    reasons.append("reply_without_e1_message_id")
                action = "GmailReplyToMessage"
                params = {"messageId": e1_id, "to": email, "htmlBody": body}
            else:
                action = "GmailSendMessage"
                params = {"to": email, "subject": subject, "htmlBody": body}

    # --- OUTREACH OPT-OUT GUARD (2026-07-08; fail-closed) ---
    # A lead who opted out in Outreach was still Gmail-contacted and complained. Consult
    # Outreach's optedOut flag before ANY send. Runs ONLY when the send would otherwise
    # proceed (all local guards passed AND a real action is built) -> avoids an API call for
    # already-blocked sends and limits lookups to leads that would actually send.
    #   opted_out           -> BLOCK; runbook permanently suppresses (Status=opted_out).
    #   optout_check_failed -> BLOCK (fail-closed); TRANSIENT, runbook retries next tick.
    if action is not None and not reasons:
        st = OPTOUT.resolve(email, cache_path=a.optout_cache, timeout=a.optout_timeout)
        if st == "opted_out":
            reasons.append("opted_out")
        elif st == "check_failed":
            reasons.append("optout_check_failed")

    allow = (not reasons) and action is not None and params is not None
    bclass = classify_block(reasons) if not allow else None
    packet = {
        "allow": allow,
        "action": action if allow else "BLOCK",
        "block_class": bclass,          # systemic | account_hold | opted_out | optout_check_failed
        "to": email,
        "seq": seq,
        "step_index": step_index,
        "is_reply": is_reply,
        "reasons": reasons,
        "params": params if allow else None,
    }
    json.dump(packet, open(a.packet_out, "w"), indent=2)
    if allow:
        json.dump(params, open(a.params_out, "w"))
    else:
        # never leave a stale params file that a later step could blindly reuse on a BLOCK
        try:
            os.remove(a.params_out)
        except OSError:
            pass

    print(json.dumps({"allow": allow, "action": packet["action"], "block_class": bclass,
                      "to": email, "step_index": step_index, "reasons": reasons}))
    sys.exit(0 if allow else 2)


if __name__ == "__main__":
    main()
