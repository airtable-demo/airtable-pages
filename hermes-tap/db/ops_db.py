"""ops_db.py — shared operational-state helper for the fleet.

Two backends, one API:
  - Postgres (Neon):  set DATABASE_URL=postgresql://...  -> multi-process, real
    atomic claim via INSERT ... ON CONFLICT. Use this in production.
  - SQLite (local):   no DATABASE_URL -> falls back to $HERMES_HOME/ops.db (WAL).
    Same atomic claim via INSERT OR IGNORE. Zero-setup; good for single-host Hermes.

The send_claim mutex is the whole point: claim_send() is atomic in BOTH backends,
so two racing senders can't both win the same (mailbox, recipient, day, lane).
"""
from __future__ import annotations
import os, json, datetime as dt

CT = "America/Chicago"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS dnc_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL CHECK (scope IN ('account','domain','email')),
    value TEXT NOT NULL,
    level TEXT NOT NULL CHECK (level IN ('hard','code_red','temp','soft')),
    reason TEXT, decided_by TEXT DEFAULT 'luke',
    effective_from TEXT DEFAULT (datetime('now')),
    expires_at TEXT, created_at TEXT DEFAULT (datetime('now')),
    UNIQUE (scope, value));
CREATE TABLE IF NOT EXISTS send_claim (
    mailbox TEXT NOT NULL, recipient TEXT NOT NULL, send_date TEXT NOT NULL,
    lane TEXT NOT NULL, claimed_by TEXT, claimed_at TEXT DEFAULT (datetime('now')),
    status TEXT NOT NULL DEFAULT 'claimed'
      CHECK (status IN ('claimed','sent','released','bounced')),
    PRIMARY KEY (mailbox, recipient, send_date, lane));
CREATE INDEX IF NOT EXISTS idx_send_claim_recipient ON send_claim (recipient);
CREATE TABLE IF NOT EXISTS send_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, gmail_msg_id TEXT UNIQUE,
    thread_id TEXT, mailbox TEXT NOT NULL, recipient TEXT NOT NULL,
    subject TEXT, lane TEXT NOT NULL, step TEXT, account TEXT,
    sent_at TEXT DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_send_log_recip ON send_log (recipient);
CREATE TABLE IF NOT EXISTS leads_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL,
    first_name TEXT, account TEXT, title TEXT, tier TEXT, mql_type TEXT,
    ent_user INTEGER, ent_acct INTEGER, sequence_id TEXT, current_step TEXT,
    next_due TEXT, gmail_thread TEXT, e1_msg_id TEXT,
    replied INTEGER DEFAULT 0, opted_out INTEGER DEFAULT 0, bounced INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active', source_created TEXT,
    updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS pacing_checkpoint (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ct_date TEXT NOT NULL,
    checkpoint TEXT NOT NULL, expected INTEGER, verified INTEGER,
    net_new INTEGER, cadence INTEGER, recorded_at TEXT DEFAULT (datetime('now')),
    UNIQUE (ct_date, checkpoint));
CREATE TABLE IF NOT EXISTS config_sync (
    id INTEGER PRIMARY KEY AUTOINCREMENT, agent TEXT NOT NULL,
    canonical_hash TEXT, live_hash TEXT, in_sync INTEGER, skills_hash TEXT,
    note TEXT, checked_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS kv_state (
    key TEXT PRIMARY KEY, value TEXT, updated_at TEXT DEFAULT (datetime('now')));
"""

_SEED = [
    ('account','apple','hard','contractual no-contact'),
    ('account','roblox','hard','full DNC'),
    ('account','block','hard','full DNC'),
    ('account','t-mobile','code_red','no net-new outbound'),
    ('domain','t-mobile.com','code_red','T-Mobile domain'),
    ('domain','t-mobil.com','code_red','T-Mobile typo'),
    ('account','williams-sonoma','code_red','not released in 8/20 ruling'),
    ('domain','wsgc.com','code_red','Williams-Sonoma domain'),
]


def _today_ct() -> str:
    try:
        from zoneinfo import ZoneInfo
        return dt.datetime.now(ZoneInfo(CT)).date().isoformat()
    except Exception:
        return dt.datetime.utcnow().date().isoformat()


class OpsDB:
    def __init__(self, url: str | None = None):
        self.url = url or os.environ.get("DATABASE_URL")
        if self.url:  # Postgres / Neon
            import psycopg
            self._pg = True
            self.conn = psycopg.connect(self.url, autocommit=True)
        else:          # SQLite fallback
            import sqlite3
            self._pg = False
            home = os.environ.get("HERMES_HOME", os.path.expanduser("~/.hermes"))
            os.makedirs(home, exist_ok=True)
            self.conn = sqlite3.connect(os.path.join(home, "ops.db"),
                                        check_same_thread=False)
            self.conn.execute("PRAGMA journal_mode=WAL")
            self.conn.executescript(_SCHEMA)
            self.conn.executemany(
                "INSERT OR IGNORE INTO dnc_ledger (scope,value,level,reason)"
                " VALUES (?,?,?,?)", _SEED)
            self.conn.commit()

    # uniform placeholder style
    def _q(self, sql_pg: str) -> str:
        return sql_pg if self._pg else sql_pg.replace("%s", "?")

    # ---- THE double-send fix ------------------------------------------
    def claim_send(self, mailbox, recipient, lane, claimed_by="", send_date=None) -> bool:
        recipient = recipient.strip().lower()
        send_date = send_date or _today_ct()
        if self._pg:
            cur = self.conn.execute(
                """INSERT INTO send_claim (mailbox,recipient,send_date,lane,claimed_by)
                   VALUES (%s,%s,%s,%s,%s)
                   ON CONFLICT (mailbox,recipient,send_date,lane) DO NOTHING
                   RETURNING status""",
                (mailbox, recipient, send_date, lane, claimed_by))
            return cur.fetchone() is not None
        cur = self.conn.execute(
            "INSERT OR IGNORE INTO send_claim (mailbox,recipient,send_date,lane,claimed_by)"
            " VALUES (?,?,?,?,?)", (mailbox, recipient, send_date, lane, claimed_by))
        self.conn.commit()
        return cur.rowcount == 1

    def release_claim(self, mailbox, recipient, lane, send_date=None):
        sql = self._q("UPDATE send_claim SET status='released'"
                      " WHERE mailbox=%s AND recipient=%s AND lane=%s"
                      " AND send_date=COALESCE(%s, send_date)")
        self.conn.execute(sql, (mailbox, recipient.strip().lower(), lane, send_date))
        if not self._pg: self.conn.commit()

    # ---- DNC gate -------------------------------------------------------
    def is_blocked(self, email, account=None):
        email = email.strip().lower(); domain = email.split("@")[-1]
        acct = (account or "").strip().lower()
        sql = self._q("""SELECT level, value FROM dnc_ledger
             WHERE (expires_at IS NULL OR expires_at > datetime('now'))
               AND ((scope='email' AND value=%s) OR (scope='domain' AND value=%s)
                 OR (scope='account' AND value=%s)) LIMIT 1""")
        try:
            row = self.conn.execute(sql, (email, domain, acct)).fetchone()
            return (True, f"{row[0]}:{row[1]}") if row else (False, "")
        except Exception as e:
            return (True, f"db_error_fail_closed:{e}")

    # ---- send log -------------------------------------------------------
    def log_send(self, mailbox, recipient, subject, lane, step=None, account=None,
                 thread_id=None, gmail_msg_id=None, sent_at=None):
        sql = self._q("""INSERT INTO send_log
            (gmail_msg_id,thread_id,mailbox,recipient,subject,lane,step,account,sent_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,COALESCE(%s,datetime('now')))""")
        if self._pg:
            sql = sql.replace("datetime('now')", "now()") + " ON CONFLICT (gmail_msg_id) DO NOTHING"
        self.conn.execute(sql, (gmail_msg_id, thread_id, mailbox,
                                recipient.strip().lower(), subject, lane, step, account, sent_at))
        if not self._pg: self.conn.commit()

    # ---- leads ledger ---------------------------------------------------
    def upsert_lead(self, email, **fields):
        email = email.strip().lower()
        cols = ",".join(fields); ph = ",".join(["%s"] * len(fields))
        sql = self._q(f"INSERT INTO leads_ledger (email,{cols}) VALUES (%s,{ph})")
        self.conn.execute(sql, (email, *fields.values()))
        if not self._pg: self.conn.commit()

    def due_leads(self, limit=500):
        sql = self._q("""SELECT * FROM leads_ledger WHERE status='active'
            AND replied=0 AND opted_out=0 AND bounced=0 AND next_due <= datetime('now')
            ORDER BY next_due LIMIT %s""")
        if self._pg: sql = sql.replace("datetime('now')", "now()")
        return self.conn.execute(sql, (limit,)).fetchall()

    # ---- pacing ----------------------------------------------------------
    def record_checkpoint(self, ct_date, checkpoint, expected, verified, net_new, cadence):
        sql = self._q("""INSERT INTO pacing_checkpoint
            (ct_date,checkpoint,expected,verified,net_new,cadence) VALUES (%s,%s,%s,%s,%s,%s)""")
        self.conn.execute(sql, (ct_date, checkpoint, expected, verified, net_new, cadence))
        if not self._pg: self.conn.commit()

    # ---- kv --------------------------------------------------------------
    def kv_get(self, key, default=None):
        row = self.conn.execute(self._q("SELECT value FROM kv_state WHERE key=%s"),
                                (key,)).fetchone()
        return json.loads(row[0]) if row and row[0] else default

    def kv_set(self, key, value):
        v = json.dumps(value)
        if self._pg:
            self.conn.execute("""INSERT INTO kv_state (key,value,updated_at)
                VALUES (%s,%s,now()) ON CONFLICT (key) DO UPDATE
                SET value=EXCLUDED.value, updated_at=now()""", (key, v))
        else:
            self.conn.execute("INSERT OR REPLACE INTO kv_state (key,value,updated_at)"
                              " VALUES (?,?,datetime('now'))", (key, v)); self.conn.commit()

    def close(self):
        self.conn.close()
