"""ops_db.py — thin Postgres helper for the fleet's shared operational state.

Usage from any Hermes skill:
    from ops_db import OpsDB
    db = OpsDB()                      # reads DATABASE_URL from env
    if db.claim_send("luke.sorensen@airtable.com", "jane@acme.com", "psu_e1", "tick-2026-08-26-10"):
        ... actually send via Gmail ...
        db.log_send(..., gmail_msg_id=...)
    else:
        ... skip: already claimed/sent today ...

Requires: pip install psycopg[binary]   (psycopg 3)
DATABASE_URL e.g. postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/fleet?sslmode=require
"""
from __future__ import annotations
import os, datetime as dt
import psycopg

CT = "America/Chicago"


class OpsDB:
    def __init__(self, url: str | None = None):
        self.url = url or os.environ["DATABASE_URL"]
        # autocommit: each call is its own transaction (claim must be atomic)
        self.conn = psycopg.connect(self.url, autocommit=True)

    # ---- THE double-send fix -------------------------------------------
    def claim_send(self, mailbox: str, recipient: str, lane: str,
                   claimed_by: str = "", send_date: dt.date | None = None) -> bool:
        """Atomically claim the right to send to `recipient` today in `lane`.
        Returns True if WE claimed it (proceed to send), False if someone else
        already did (skip). This is the mutex Hyperagent tables never had."""
        recipient = recipient.strip().lower()
        send_date = send_date or dt.datetime.now(dt.timezone.utc).astimezone(
            dt.timezone(dt.timedelta(hours=-5))).date()  # CT (close enough; use zoneinfo in prod)
        cur = self.conn.execute(
            """INSERT INTO send_claim (mailbox, recipient, send_date, lane, claimed_by)
               VALUES (%s,%s,%s,%s,%s)
               ON CONFLICT (mailbox, recipient, send_date, lane) DO NOTHING
               RETURNING (SELECT status FROM send_claim
                          WHERE mailbox=%s AND recipient=%s AND send_date=%s AND lane=%s)""",
            (mailbox, recipient, send_date, lane, claimed_by,
             mailbox, recipient, send_date, lane))
        row = cur.fetchone()
        return row is not None  # inserted -> we hold the claim

    def release_claim(self, mailbox, recipient, lane, send_date=None):
        """Give the claim back (e.g. send failed validation — don't burn the slot)."""
        self.conn.execute(
            """UPDATE send_claim SET status='released'
               WHERE mailbox=%s AND recipient=%s AND lane=%s
                 AND send_date = COALESCE(%s, send_date)""",
            (mailbox, recipient.strip().lower(), lane, send_date))

    # ---- DNC gate --------------------------------------------------------
    def is_blocked(self, email: str, account: str | None = None) -> tuple[bool, str]:
        """True if net-new outbound to this email/account is held.
        Fails CLOSED on DB error (returns blocked) — never send blind."""
        email = email.strip().lower()
        domain = email.split("@")[-1]
        acct = (account or "").strip().lower()
        try:
            cur = self.conn.execute(
                """SELECT level, value FROM dnc_ledger
                   WHERE (expires_at IS NULL OR expires_at > now())
                     AND ((scope='email'  AND value=%s)
                       OR (scope='domain' AND value=%s)
                       OR (scope='account' AND value=%s))
                   ORDER BY CASE level WHEN 'hard' THEN 0 WHEN 'code_red' THEN 1
                                       WHEN 'temp' THEN 2 ELSE 3 END
                   LIMIT 1""", (email, domain, acct))
            row = cur.fetchone()
            return (True, f"{row[0]}:{row[1]}") if row else (False, "")
        except Exception as e:
            return (True, f"db_error_fail_closed:{e}")

    # ---- send log --------------------------------------------------------
    def log_send(self, mailbox, recipient, subject, lane, step=None, account=None,
                 thread_id=None, gmail_msg_id=None, sent_at=None):
        self.conn.execute(
            """INSERT INTO send_log (gmail_msg_id, thread_id, mailbox, recipient,
                                     subject, lane, step, account, sent_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s, COALESCE(%s, now()))
               ON CONFLICT (gmail_msg_id) DO NOTHING""",
            (gmail_msg_id, thread_id, mailbox, recipient.strip().lower(),
             subject, lane, step, account, sent_at))

    # ---- leads ledger ----------------------------------------------------
    def upsert_lead(self, email, **fields):
        email = email.strip().lower()
        cols = ", ".join(fields.keys())
        ph = ", ".join(["%s"] * len(fields))
        sets = ", ".join(f"{k}=EXCLUDED.{k}" for k in fields)
        self.conn.execute(
            f"INSERT INTO leads_ledger (email,{cols}) VALUES (%s,{ph}) "
            f"ON CONFLICT (email) DO UPDATE SET {sets}, updated_at=now()",
            (email, *fields.values()))

    def due_leads(self, limit=500):
        return self.conn.execute(
            """SELECT * FROM leads_ledger
               WHERE status='active' AND replied=false AND opted_out=false
                 AND bounced=false AND next_due <= now()
               ORDER BY next_due LIMIT %s""", (limit,)).fetchall()

    # ---- pacing ----------------------------------------------------------
    def record_checkpoint(self, ct_date, checkpoint, expected, verified, net_new, cadence):
        self.conn.execute(
            """INSERT INTO pacing_checkpoint (ct_date, checkpoint, expected, verified, net_new, cadence)
               VALUES (%s,%s,%s,%s,%s,%s)
               ON CONFLICT (ct_date, checkpoint) DO UPDATE
               SET expected=EXCLUDED.expected, verified=EXCLUDED.verified,
                   net_new=EXCLUDED.net_new, cadence=EXCLUDED.cadence, recorded_at=now()""",
            (ct_date, checkpoint, expected, verified, net_new, cadence))

    # ---- kv --------------------------------------------------------------
    def kv_get(self, key, default=None):
        row = self.conn.execute("SELECT value FROM kv_state WHERE key=%s", (key,)).fetchone()
        return row[0] if row else default

    def kv_set(self, key, value):
        import json
        self.conn.execute(
            """INSERT INTO kv_state (key, value, updated_at) VALUES (%s,%s,now())
               ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()""",
            (key, json.dumps(value)))

    def close(self):
        self.conn.close()
