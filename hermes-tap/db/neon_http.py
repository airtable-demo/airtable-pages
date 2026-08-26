"""neon_http.py — Neon serverless (HTTPS) driver. THE way to reach Neon from a
sandbox/host that blocks raw Postgres on port 5432 (verified: this fleet's sandbox
resets 5432; only HTTPS egress works).

Uses ONLY the stdlib. Placeholders are $1, $2, ... (NOT psycopg's %s).

    db = NeonHTTP(DATABASE_URL)          # postgresql://user:pass@host/db?...
    db.exec("INSERT ... ON CONFLICT ... RETURNING status", [a, b])  -> {"rows":[...], "rowCount":n}
    db.claim_send(...) / is_blocked(...) — same atomic semantics as ops_db.OpsDB
"""
from __future__ import annotations
import json, urllib.request, urllib.error, datetime


class NeonHTTP:
    def __init__(self, conn_string: str):
        self.conn = conn_string
        # serverless endpoint = the non-pooler host
        host = conn_string.split("@")[-1].split("/")[0]
        self.host = host.replace("-pooler", "")
        self.url = f"https://{self.host}/sql"

    def exec(self, query: str, params: list | None = None) -> dict:
        body = json.dumps({"query": query, "params": params or []}).encode()
        req = urllib.request.Request(self.url, data=body, method="POST", headers={
            "Content-Type": "application/json",
            "Neon-Connection-String": self.conn,
        })
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"NeonHTTP {e.code}: {e.read().decode()[:300]}")

    @staticmethod
    def _today_ct() -> str:
        try:
            from zoneinfo import ZoneInfo
            return datetime.datetime.now(ZoneInfo("America/Chicago")).date().isoformat()
        except Exception:
            return datetime.datetime.utcnow().date().isoformat()

    # ---- atomic double-send mutex ----
    def claim_send(self, mailbox, recipient, lane, claimed_by="", send_date=None) -> bool:
        recipient = recipient.strip().lower()
        send_date = send_date or self._today_ct()
        res = self.exec(
            "INSERT INTO send_claim (mailbox,recipient,send_date,lane,claimed_by)"
            " VALUES ($1,$2,$3,$4,$5)"
            " ON CONFLICT (mailbox,recipient,send_date,lane) DO NOTHING RETURNING status",
            [mailbox, recipient, send_date, lane, claimed_by])
        return res.get("rowCount") == 1

    def release_claim(self, mailbox, recipient, lane, send_date=None):
        self.exec("UPDATE send_claim SET status='released'"
                  " WHERE mailbox=$1 AND recipient=$2 AND lane=$3"
                  " AND send_date=COALESCE($4, send_date)",
                  [mailbox, recipient.strip().lower(), lane, send_date])

    # ---- DNC gate (fail closed) ----
    def is_blocked(self, email, account=None):
        email = email.strip().lower(); domain = email.split("@")[-1]
        acct = (account or "").strip().lower()
        try:
            res = self.exec(
                "SELECT level,value FROM dnc_ledger"
                " WHERE (expires_at IS NULL OR expires_at>now())"
                " AND ((scope='email' AND value=$1) OR (scope='domain' AND value=$2)"
                "   OR (scope='account' AND value=$3)) LIMIT 1",
                [email, domain, acct])
            rows = res.get("rows", [])
            return (True, f"{rows[0]['level']}:{rows[0]['value']}") if rows else (False, "")
        except Exception as e:
            return (True, f"db_error_fail_closed:{e}")

    # ---- send log ----
    def log_send(self, mailbox, recipient, subject, lane, step=None, account=None,
                 thread_id=None, gmail_msg_id=None):
        self.exec(
            "INSERT INTO send_log (gmail_msg_id,thread_id,mailbox,recipient,subject,lane,step,account)"
            " VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (gmail_msg_id) DO NOTHING",
            [gmail_msg_id, thread_id, mailbox, recipient.strip().lower(), subject, lane, step, account])
