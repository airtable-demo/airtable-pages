#!/usr/bin/env python3
"""build_proofpoint_request.py — deterministic Slack message for the AutoBDR
customer-stories proof-point request (Phase 1.5 of an outbound account play).

WHY THIS EXISTS: the customer-stories agent ONLY replies when it is @-tagged.
Hand-composed requests have dropped the leading mention and gotten no response.
This builder ALWAYS emits the mention as the literal first token, so the tag can
never be lost. Run it and send its exact stdout via ExecuteIntegration
SlackSendMessage to the channel — do NOT re-type the message by hand.

Portable: the bot id / channel default to the shared customer-stories agent but
are overridable for other deployments (--bot-id / --channel).

Usage:
  python3 build_proofpoint_request.py \
    --account "Deckers Brands" \
    --function "Human Resources / People Operations" \
    --industry "footwear & apparel, multi-brand: HOKA, UGG, Teva" \
    --classification "expansion customer" \
    --personas "VP/Director/Sr Manager of People Ops, Total Rewards, Comp, Benefits, HRIS, Payroll, HRBP" \
    --use-case "People/HR" \
    --preference "Consumer/retail or large multi-brand enterprises" \
    --json
"""
from __future__ import annotations

import argparse
import json
import sys

DEFAULT_BOT_ID = "U0B1UK945B4"   # @customer-stories agent (the auto-responder)
DEFAULT_CHANNEL = "C0B1CU8V2NB"  # #customer-stories-hyperagent


def build_message(account, function, use_case=None, industry=None, personas=None,
                  classification=None, preference=None, bot_id=DEFAULT_BOT_ID):
    """Return the proof-point request string, ALWAYS leading with the @mention."""
    mention = "<@%s>" % bot_id
    acct = account
    qualifiers = []
    if industry:
        qualifiers.append(industry)
    if classification:
        qualifiers.append(classification)
    if qualifiers:
        acct = "%s (%s)" % (account, "; ".join(qualifiers))

    parts = [
        "%s Proof points needed for an outbound play." % mention,
        "Function: %s." % function,
        "Account: %s." % acct,
    ]
    if personas:
        parts.append("Target personas: %s." % personas)
    use_label = use_case if use_case else function
    parts.append(
        "Looking for 2-3 customer stories with named customers, the %s use case, "
        "and a hard metric (hours saved, cycle-time cut, adoption / onboarding / "
        "visibility gains), plus any PUBLIC PR-approved customer-story URLs I can "
        "share directly." % use_label
    )
    if preference:
        parts.append("%s preferred." % preference)
    parts.append("Thanks!")
    return " ".join(parts)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--account", required=True)
    ap.add_argument("--function", required=True,
                    help="POV business function / persona group, e.g. 'Human Resources / People Operations'")
    ap.add_argument("--use-case", default="", help="short use-case label for the ask; defaults to --function")
    ap.add_argument("--industry", default="", help="industry / brand context, shown in parens after the account")
    ap.add_argument("--personas", default="", help="target persona titles")
    ap.add_argument("--classification", default="",
                    help="relationship from Databricks enrichment, e.g. 'expansion customer' / 'net-new'")
    ap.add_argument("--preference", default="", help="optional 'X preferred' analog line")
    ap.add_argument("--bot-id", default=DEFAULT_BOT_ID, help="customer-stories agent user id to tag")
    ap.add_argument("--channel", default=DEFAULT_CHANNEL, help="customer-stories Slack channel id")
    ap.add_argument("--json", action="store_true",
                    help="emit {channel, text} JSON (text is the SlackSendMessage body) instead of plain text")
    a = ap.parse_args()

    text = build_message(
        account=a.account,
        function=a.function,
        use_case=a.use_case or None,
        industry=a.industry or None,
        personas=a.personas or None,
        classification=a.classification or None,
        preference=a.preference or None,
        bot_id=a.bot_id,
    )

    # Safety net: the message MUST start with the mention or the bot won't reply.
    if not text.startswith("<@%s>" % a.bot_id):
        sys.stderr.write("ERROR: built message does not lead with the bot mention\n")
        return 2

    if a.json:
        print(json.dumps({"channel": a.channel, "text": text}))
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
