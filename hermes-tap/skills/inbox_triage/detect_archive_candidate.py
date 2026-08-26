#!/usr/bin/env python3
"""detect_archive_candidate.py — Decide whether an email should be auto-archived.

Inputs an email's sender, subject, and (optionally) a short body snippet, and
returns one of:

    archive   — yes, apply [ABDR Archived] and remove INBOX
    keep      — no, do not archive (continue normal triage)

With a reason code (gong_recording, zoom_recording, bounce, ooo,
platform_digest, generic_automated, etc.).

This is the second pass after classify_sender.py — only call this when the
sender was tagged noise_candidate (or when explicitly checking a borderline
case). It returns conservative defaults: when in doubt, do NOT archive.

CLI:
    python3 detect_archive_candidate.py --sender "noreply@gong.io" --subject "Your Gong recording is ready"
    python3 detect_archive_candidate.py --file emails.json --output decisions.json

JSON file mode expects [{"id":..., "sender":..., "subject":..., "snippet":?}].

Exit codes: 0 success, 1 input error, 2 internal error.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from typing import Any, Dict, List, Optional, Tuple

# (regex pattern, reason_code, description)
SUBJECT_PATTERNS: List[Tuple[re.Pattern[str], str, str]] = [
    # Gong recording-ready notifications.
    (re.compile(r"\b(gong)\b.*\b(recording|call|transcript)\b.*\b(ready|available|complete)\b", re.I),
     "gong_recording", "Gong recording-ready notification"),
    (re.compile(r"\b(recording|call|transcript)\b.*\b(ready|available|complete)\b.*\b(gong)\b", re.I),
     "gong_recording", "Gong recording-ready notification"),
    # Zoom recording-ready notifications.
    (re.compile(r"\bcloud recording\b.*\b(available|ready)\b", re.I),
     "zoom_recording", "Zoom cloud recording notification"),
    (re.compile(r"\b(zoom)\b.*\b(recording|meeting)\b.*\b(ready|available)\b", re.I),
     "zoom_recording", "Zoom recording-ready notification"),
    # Bounces / delivery failures.
    (re.compile(r"\b(delivery (status notification|has failed|failure)|undelivered mail|mail delivery (subsystem|failure)|returned mail|message not delivered|delivery incomplete|could not be delivered|address (could )?not (be )?found)\b", re.I),
     "bounce", "Bounce / delivery failure notification"),
    # Out of office / auto-reply patterns.
    (re.compile(r"\b(out of (the )?office|out-of-office|\booo\b|automatic reply|auto[- ]?reply|away from (the )?office|away from my (desk|email)|vacation (reply|response|auto)|on (vacation|leave|holiday|annual leave|parental leave|maternity|paternity)|currently (out|away|traveling))\b", re.I),
     "ooo", "Out-of-office / auto-reply"),
]

BODY_PATTERNS: List[Tuple[re.Pattern[str], str, str]] = [
    # Body-level OOO confirmations (when subject is vague like "Re: Quick question").
    (re.compile(r"\b(i am (currently |presently )?out of (the )?office|i'?m (currently |presently )?out of (the )?office|i am away from (my )?(office|desk|email)|thank you for your (email|message)[,.]? i am (currently |presently )?(out|away)|i will be out of (the )?office (until|through|from)|i am on (annual leave|vacation|holiday|parental leave|maternity|paternity|sabbatical))\b", re.I),
     "ooo", "Body matches out-of-office auto-reply"),
    # Bounce body markers (when subject is generic).
    (re.compile(r"\b(your message (was not delivered|wasn'?t delivered|could not be delivered)|the email account that you tried to reach does not exist|the recipient(?:'s)? mailbox is full|550 5\.[0-9]\.[0-9]|reason: 550|smtp; 5[0-9]{2})\b", re.I),
     "bounce", "Body matches bounce / delivery failure"),
]

# Senders that are always platform digests / system mail when the subject doesn't
# already match Gong/Zoom recording-ready. These get archived as platform_digest.
PLATFORM_DIGEST_DOMAINS = (
    "linkedin.com", "outreach.io", "salesloft.com",
    "marketo.com", "marketoapp.com", "intercom-mail.com",
)


def domain_of(email: Optional[str]) -> Optional[str]:
    if not email or "@" not in email:
        return None
    return email.rsplit("@", 1)[-1].strip().lower().rstrip(">").strip()


def extract_email(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    m = re.search(r"<?([^<>@\s]+@[^<>@\s]+)>?", raw)
    return m.group(1).strip().lower() if m else None


def decide(
    sender: Optional[str],
    subject: Optional[str],
    snippet: Optional[str] = None,
) -> Tuple[str, str, str]:
    """Return (decision, reason_code, description).

    decision: 'archive' | 'keep'
    """
    subj = subject or ""
    body = snippet or ""

    # Subject pattern checks first — strongest signals.
    for pat, code, desc in SUBJECT_PATTERNS:
        if pat.search(subj):
            return "archive", code, f"{desc} (matched subject)"

    # Body pattern checks — catch OOO/bounces when subject is generic.
    for pat, code, desc in BODY_PATTERNS:
        if pat.search(body):
            return "archive", code, f"{desc} (matched body snippet)"

    # Platform digest domains — only if nothing else matched and sender is known platform.
    email = extract_email(sender)
    dom = domain_of(email)
    if dom:
        for pd in PLATFORM_DIGEST_DOMAINS:
            if dom == pd or dom.endswith("." + pd):
                return "archive", "platform_digest", f"sender {dom} is a known platform/digest service"

    # Default: keep (don't archive on weak signal).
    return "keep", "no_match", "no archive pattern matched"


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--sender", help="From header (e.g. 'noreply@gong.io')")
    p.add_argument("--subject", default="", help="Subject line")
    p.add_argument("--snippet", default="", help="Optional body snippet (first ~500 chars)")
    p.add_argument("--file", help="Path to JSON file with [{id, sender, subject, snippet?}]")
    p.add_argument("--output", help="Output JSON path (for --file mode)")
    p.add_argument("--json", action="store_true", help="Single-message mode: emit JSON")
    args = p.parse_args(argv)

    try:
        if args.file:
            with open(args.file, "r", encoding="utf-8") as fh:
                emails: List[Dict[str, Any]] = json.load(fh)
            results: List[Dict[str, Any]] = []
            for e in emails:
                d, code, desc = decide(e.get("sender"), e.get("subject"), e.get("snippet"))
                results.append({
                    "id": e.get("id"),
                    "decision": d,
                    "reason_code": code,
                    "description": desc,
                })
            out = json.dumps(results, indent=2)
            if args.output:
                with open(args.output, "w", encoding="utf-8") as fh:
                    fh.write(out)
                archived = sum(1 for r in results if r["decision"] == "archive")
                print(f"Wrote {len(results)} decisions to {args.output} ({archived} to archive)")
            else:
                print(out)
            return 0

        if args.sender is None and args.subject == "" and args.snippet == "":
            print("Error: provide --sender / --subject / --snippet or --file", file=sys.stderr)
            return 1

        d, code, desc = decide(args.sender, args.subject, args.snippet)
        if args.json:
            print(json.dumps({"decision": d, "reason_code": code, "description": desc}))
        else:
            print(f"{d}\t{code}\t{desc}")
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
