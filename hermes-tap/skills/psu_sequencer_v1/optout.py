from __future__ import annotations
"""
Outreach opt-out resolver for the PSU Sequencer send chokepoint (fail-closed).

WHY THIS EXISTS (2026-07-08 incident):
A lead who had OPTED OUT in Outreach was still contacted by the Gmail PSU engine and
complained. The Gmail-direct engine never consulted Outreach's opt-out state, so a
prospect who unsubscribed via an Outreach-sent email still received PSU E1s/follow-ups.
This resolves each recipient's Outreach `optedOut` flag BEFORE any send and FAILS CLOSED:
if the status cannot be determined definitively (connector missing, creds absent,
HTTP/timeout/parse error), the send is BLOCKED — never sent blind.

Status values (the only three resolve() ever returns):
  "opted_out"     -> at least one Outreach prospect record for this email has optedOut=true.
                     BLOCK the send; permanently suppress the lead (same class as bounce/opt-out).
  "clear"         -> the email resolves cleanly in Outreach (200) with NO opted-out record,
                     OR no Outreach prospect exists for it at all (not in Outreach = never
                     opted out via Outreach). SAFE to send.
  "check_failed"  -> the lookup could not be completed definitively (connector not found,
                     no creds, non-200, JSON:API errors, missing data[], subprocess crash,
                     or timeout). BLOCK (fail-closed). This is TRANSIENT — the caller should
                     retry the lead on a later tick, NOT permanently suppress it.

Design notes:
- The lookup shells out to the Outreach Connector CLI (outreach_connector.py request ...)
  so the credential boundary is clean: the connector holds the rotating Outreach OAuth
  token via its AuthHub broker. build_send.py therefore must run under
  `RunWithCredentials skillName "Outreach Connector"` (which injects OUTREACH_* env) so this
  subprocess inherits the creds. If it runs WITHOUT those creds the connector errors and we
  fail closed (block), which is safe.
- The connector's `request` CLI prints {"status": <http>, "body": <json:api payload>} and
  joins --query segments RAW, so the email VALUE is URL-encoded here (a '+' in an address
  would otherwise be decoded to a space server-side and mis-match).
- Outreach does NOT allow filter[optedOut] (filterParameter.unfilterableAttribute), so we
  look the prospect up by email and read the optedOut attribute off every returned record
  (duplicate prospect records for one email are common — ANY opted-out record blocks).
- Within-tick cache (default /tmp/psu_optout_cache.json, keyed by lowercased email): only
  DEFINITIVE statuses (opted_out / clear) are cached; "check_failed" is never cached so a
  transient API blip is retried on the next send rather than sticking as a false clear.
"""
import argparse
import json
import os
import subprocess
import sys
from urllib.parse import quote

CACHE_DEFAULT = "/tmp/psu_optout_cache.json"
_CONNECTOR_CANDIDATES = (
    os.environ.get("OUTREACH_CONNECTOR", ""),
    "/agent/workspace/skills/Outreach Connector/outreach_connector.py",
    os.path.expanduser("~/workspace/skills/Outreach Connector/outreach_connector.py"),
)


def connector_path():
    for c in _CONNECTOR_CANDIDATES:
        if c and os.path.exists(c):
            return c
    return None


def _load_cache(path):
    try:
        with open(path) as fh:
            d = json.load(fh)
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def _save_cache(path, cache):
    try:
        with open(path, "w") as fh:
            json.dump(cache, fh)
    except OSError:
        pass


class _LookupError(Exception):
    """Any condition that makes the opt-out status indeterminate -> check_failed (block)."""


def _query_outreach(email_lower, connector, timeout):
    """Return the JSON:API data[] list for this email, or raise _LookupError.

    Raises on anything that leaves the opt-out state ambiguous so the caller fails closed.
    """
    enc = quote(email_lower, safe="")  # encode the VALUE only; connector joins --query raw
    args = [
        "python3", connector, "request", "GET", "/api/v2/prospects",
        "--query", "filter[emails]=" + enc,
        "--query", "fields[prospect]=optedOut,optedOutAt,emails",
        "--query", "page[size]=50",
    ]
    try:
        p = subprocess.run(args, capture_output=True, text=True,
                           timeout=timeout, env=os.environ.copy())
    except subprocess.TimeoutExpired:
        raise _LookupError("timeout")
    except Exception as e:  # OSError etc.
        raise _LookupError("subprocess:" + str(e)[:120])
    out = (p.stdout or "").strip()
    if not out:
        raise _LookupError("empty_stdout(rc=%d):%s" % (p.returncode, (p.stderr or "")[:120]))
    try:
        payload = json.loads(out)
    except ValueError:
        raise _LookupError("unparseable_stdout")
    status = payload.get("status")
    body = payload.get("body") if isinstance(payload.get("body"), dict) else None
    if status != 200:
        raise _LookupError("http_%s" % status)
    if body is None:
        raise _LookupError("no_body")
    if body.get("errors"):
        raise _LookupError("api_errors")
    data = body.get("data")
    if not isinstance(data, list):
        raise _LookupError("no_data")
    return data


def _status_from_data(data):
    for rec in data:
        attrs = (rec or {}).get("attributes") or {}
        if attrs.get("optedOut") is True:
            return "opted_out"
    return "clear"  # empty list (not in Outreach) or present-but-none-opted-out


def resolve(email, cache_path=CACHE_DEFAULT, connector=None, timeout=45, cache=None):
    """Resolve one email to opted_out | clear | check_failed. Fail-closed on any doubt."""
    lo = (email or "").strip().lower()
    if not lo:
        return "check_failed"
    own_cache = cache is None
    if own_cache:
        cache = _load_cache(cache_path)
    cached = cache.get(lo)
    if cached in ("opted_out", "clear"):
        return cached
    conn = connector or connector_path()
    if not conn:
        return "check_failed"  # cannot verify -> block (fail-closed)
    try:
        data = _query_outreach(lo, conn, timeout)
        status = _status_from_data(data)
    except _LookupError:
        return "check_failed"  # any ambiguity -> block; NOT cached (transient, retry next tick)
    cache[lo] = status
    if own_cache:
        _save_cache(cache_path, cache)
    return status


def resolve_many(emails, cache_path=CACHE_DEFAULT, connector=None, timeout=45):
    """Resolve a list of emails, sharing one cache load/save. Returns {email_lower: status}.

    Sequential per-email calls (each ~1s once the token is cached) — keep batch sizes
    modest (<=~30) to respect the RunWithCredentials ~60s cap; run multiple batches for
    larger sets (see optout_sweep.py)."""
    cache = _load_cache(cache_path)
    conn = connector or connector_path()
    out = {}
    for e in emails:
        lo = (e or "").strip().lower()
        if not lo:
            continue
        out[lo] = resolve(lo, cache_path=cache_path, connector=conn, timeout=timeout, cache=cache)
    _save_cache(cache_path, cache)
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description="Resolve Outreach opt-out status (fail-closed).")
    ap.add_argument("emails", nargs="*", help="one or more emails to resolve")
    ap.add_argument("--file", help="file with one email per line (overrides positional)")
    ap.add_argument("--cache", default=CACHE_DEFAULT)
    ap.add_argument("--out", help="write {email: status} JSON here")
    ap.add_argument("--timeout", type=int, default=45)
    a = ap.parse_args(argv)
    emails = a.emails
    if a.file:
        with open(a.file) as fh:
            emails = [ln.strip() for ln in fh if ln.strip()]
    res = resolve_many(emails, cache_path=a.cache, timeout=a.timeout)
    print(json.dumps(res, indent=2))
    if a.out:
        with open(a.out, "w") as fh:
            json.dump(res, fh, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
