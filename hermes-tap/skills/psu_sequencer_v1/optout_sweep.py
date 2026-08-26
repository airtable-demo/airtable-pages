from __future__ import annotations
"""
Retroactive Outreach opt-out cross-check for the PSU Sequencer (report-only, no sends).

Given a list of already-contacted PSU recipient emails (e.g. the last N days of Gmail "Sent"
PSU recipients that the agent extracts via GmailSearchMessages), resolve each against
Outreach's optedOut flag and REPORT any that are opted out, so Luke knows which contacted
leads should be suppressed. This NEVER emails anyone.

Runs under RunWithCredentials(skillName="Outreach Connector"). Resolves in batches (<=25 by
default, matching the ledger batch guidance) so a single invocation stays under the ~60s
RunWithCredentials cap; each lookup is ~1s once the AuthHub token is cached.

Also writes the resolved statuses into the shared opt-out cache (default
/tmp/psu_optout_cache.json), so a subsequent tick's intake keep_decision(outreach_opted_out=...)
drops the opted-out ones for free. (Note: the live guard in build_send.py already blocks any
FUTURE send to these leads regardless — this sweep exists to surface who was ALREADY contacted.)

Usage:
  python3 optout_sweep.py --file contacted_emails.txt --out sweep_report.json
  python3 optout_sweep.py a@x.com b@y.com --out sweep_report.json

Report JSON: {checked, opted_out:[...], check_failed:[...], clear_count, batches}.
"""
import argparse
import json
import sys

import optout as OPTOUT


def _chunked(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def run(emails, cache_path=OPTOUT.CACHE_DEFAULT, batch=25, timeout=45):
    # normalize: lowercase, strip, de-dupe, preserve order
    seen, ordered = set(), []
    for e in emails:
        lo = (e or "").strip().lower()
        if lo and lo not in seen:
            seen.add(lo)
            ordered.append(lo)
    opted, failed, clear = [], [], 0
    batches = 0
    for group in _chunked(ordered, batch):
        batches += 1
        res = OPTOUT.resolve_many(group, cache_path=cache_path, timeout=timeout)
        for em, st in res.items():
            if st == "opted_out":
                opted.append(em)
            elif st == "check_failed":
                failed.append(em)
            else:
                clear += 1
    return {"checked": len(ordered), "opted_out": sorted(opted),
            "check_failed": sorted(failed), "clear_count": clear, "batches": batches}


def main(argv=None):
    ap = argparse.ArgumentParser(description="Retroactive Outreach opt-out sweep (report-only).")
    ap.add_argument("emails", nargs="*")
    ap.add_argument("--file", help="file with one email per line (overrides positional args)")
    ap.add_argument("--cache", default=OPTOUT.CACHE_DEFAULT)
    ap.add_argument("--out", help="write the report JSON here")
    ap.add_argument("--batch", type=int, default=25)
    ap.add_argument("--timeout", type=int, default=45)
    a = ap.parse_args(argv)
    emails = a.emails
    if a.file:
        with open(a.file) as fh:
            emails = [ln.strip() for ln in fh if ln.strip()]
    report = run(emails, cache_path=a.cache, batch=a.batch, timeout=a.timeout)
    print(json.dumps(report, indent=2))
    if a.out:
        with open(a.out, "w") as fh:
            json.dump(report, fh, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
