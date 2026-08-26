#!/usr/bin/env python3
"""classify_sender.py — Deterministic classification of an inbound Gmail sender.

Categorizes each inbound message into one of three buckets:
  - internal: sender's domain matches the AE's company domain (e.g., airtable.com)
  - prospect: external sender that looks like a human (not noreply/automated)
  - noise_candidate: looks like an automated/system email (Gong/Zoom/bounce/OOO/etc.)

The noise_candidate bucket is a flag to run detect_archive_candidate.py next —
this script only does fast deterministic checks, NOT the full archive decision.

CLI:
    python3 classify_sender.py --sender "jane@example.com" --subject "Re: demo" --internal-domain airtable.com
    python3 classify_sender.py --file emails.json --internal-domain airtable.com --output classified.json

JSON file mode expects [{"id":..., "sender":..., "subject":...}] and returns
[{"id":..., "category": "internal"|"prospect"|"noise_candidate", "reason": "..."}].

Exit codes: 0 success, 1 input error, 2 internal error.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from typing import Any, Dict, List, Optional, Tuple

# Sender LOCAL-PART patterns that almost always indicate automated / no-reply mail.
AUTOMATED_LOCAL_PARTS = (
    "noreply", "no-reply", "no_reply", "donotreply", "do-not-reply", "do_not_reply",
    "notifications", "notification", "alerts", "alert", "automated",
    "mailer-daemon", "postmaster", "bounce", "bounces", "bounce-no-reply",
    "system", "support-noreply", "auto-confirm", "auto-reply", "autoreply",
    "delivery", "mail-delivery", "delivery-failure",
)

# Sender DOMAIN patterns that indicate platform / automated services that we always
# want flagged as noise candidates (the recording-ready / digest detector runs next).
NOISE_DOMAINS = (
    "gong.io", "zoom.us", "mail.zoom.us",
    "linkedin.com", "outreach.io", "salesloft.com", "hubspot.com",
    "marketo.com", "marketoapp.com", "mailchimp.com", "sendgrid.net",
    "intercom-mail.com", "intercom.io",
    "calendly.com", "chili-piper.com", "chilipiper.com",
)

EMAIL_RE = re.compile(r"<?([^<>@\s]+@[^<>@\s]+)>?")


def extract_email(raw: Optional[str]) -> Optional[str]:
    """Extract a bare email address from a 'Name <addr@x>' style From header."""
    if not raw:
        return None
    m = EMAIL_RE.search(raw)
    if not m:
        return None
    return m.group(1).strip().lower()


def domain_of(email: Optional[str]) -> Optional[str]:
    if not email or "@" not in email:
        return None
    return email.rsplit("@", 1)[-1].strip().lower()


def local_part_of(email: Optional[str]) -> Optional[str]:
    if not email or "@" not in email:
        return None
    return email.split("@", 1)[0].strip().lower()


def classify(
    sender: Optional[str],
    subject: Optional[str],
    internal_domain: str,
) -> Tuple[str, str]:
    """Return (category, reason). category in {internal, prospect, noise_candidate}."""
    internal_domain = (internal_domain or "").strip().lower().lstrip("@")
    if not internal_domain:
        return "noise_candidate", "internal_domain not configured"

    email = extract_email(sender)
    if not email:
        return "noise_candidate", "could not parse sender email"

    dom = domain_of(email) or ""
    local = local_part_of(email) or ""

    # Internal first — short circuit before any noise check.
    # Match exact internal domain OR any subdomain of it.
    if dom == internal_domain or dom.endswith("." + internal_domain):
        return "internal", f"sender domain {dom} matches internal_domain {internal_domain}"

    # Known automated / platform domains → noise candidate (let archive detector decide).
    for nd in NOISE_DOMAINS:
        if dom == nd or dom.endswith("." + nd):
            return "noise_candidate", f"sender domain {dom} is a known platform/automated service"

    # Automated local parts (noreply@, mailer-daemon@, etc.) → noise candidate.
    for ap in AUTOMATED_LOCAL_PARTS:
        # Match local-part exactly or as a prefix segment (e.g. noreply-foo, bounce.x).
        if local == ap or local.startswith(ap + ".") or local.startswith(ap + "-") or local.startswith(ap + "_"):
            return "noise_candidate", f"sender local-part {local} matches automated pattern '{ap}'"

    # Otherwise: external human → prospect candidate.
    return "prospect", f"external sender {email}, domain {dom}"


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--sender", help="From header value (e.g., 'Jane Doe <jane@example.com>')")
    p.add_argument("--subject", default="", help="Subject line")
    p.add_argument("--internal-domain", required=True, help="AE's company domain, e.g. airtable.com")
    p.add_argument("--file", help="Path to JSON file with array of {id, sender, subject}")
    p.add_argument("--output", help="Output JSON path (for --file mode)")
    p.add_argument("--json", action="store_true", help="Single-sender mode: emit JSON instead of text")
    args = p.parse_args(argv)

    try:
        if args.file:
            with open(args.file, "r", encoding="utf-8") as fh:
                emails: List[Dict[str, Any]] = json.load(fh)
            results: List[Dict[str, Any]] = []
            for e in emails:
                cat, reason = classify(e.get("sender"), e.get("subject"), args.internal_domain)
                results.append({
                    "id": e.get("id"),
                    "sender": e.get("sender"),
                    "category": cat,
                    "reason": reason,
                })
            out = json.dumps(results, indent=2)
            if args.output:
                with open(args.output, "w", encoding="utf-8") as fh:
                    fh.write(out)
                print(f"Wrote {len(results)} classifications to {args.output}")
            else:
                print(out)
            return 0

        if not args.sender:
            print("Error: --sender or --file required", file=sys.stderr)
            return 1

        cat, reason = classify(args.sender, args.subject, args.internal_domain)
        if args.json:
            print(json.dumps({"category": cat, "reason": reason}))
        else:
            print(f"{cat}\t{reason}")
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
