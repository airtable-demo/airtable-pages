-- =============================================================
-- Luke's agent fleet — shared operational state (Neon Postgres)
-- Run once on a fresh Neon DB:  psql $DATABASE_URL -f schema.sql
-- Free tier: 0.5 GB is tens of millions of send_log rows. Plenty.
-- =============================================================

-- -----------------------------------------------------------
-- 1. DNC / hold ledger — the single source of truth for who
--    NOT to contact. Replaces the engine_core hardcoded tuples
--    AND the prose-in-brief holds (the recurring breach source).
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS dnc_ledger (
    id            BIGSERIAL PRIMARY KEY,
    scope         TEXT NOT NULL CHECK (scope IN ('account','domain','email')),
    value         TEXT NOT NULL,                 -- 'cisco' | 'cisco.com' | 'jane@co.com'
    level         TEXT NOT NULL CHECK (level IN ('hard','code_red','temp','soft')),
    reason        TEXT,
    decided_by    TEXT DEFAULT 'luke',
    effective_from TIMESTAMPTZ DEFAULT now(),
    expires_at    TIMESTAMPTZ,                    -- NULL = permanent
    created_at    TIMESTAMPTZ DEFAULT now(),
    UNIQUE (scope, value)
);
-- hard  = never contact (Apple/Roblox/Block). code_red = no net-new outbound (T-Mobile).
-- temp  = time-boxed hold (Cisco temp DNC had an expires_at). soft = advisory.
-- Inbound replies are ALWAYS worked regardless of this table (that path is the
-- Prospect Reply Drafter); this ledger gates NET-NEW outbound only.

-- -----------------------------------------------------------
-- 2. send_claim — THE double-send fix. One row per (mailbox,
--    recipient) per send day. The atomic INSERT ... ON CONFLICT
--    is the mutex that Hyperagent tables and Airtable never had.
--    Claim BEFORE sending; if the insert conflicts, skip the send.
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS send_claim (
    mailbox       TEXT NOT NULL,                 -- 'luke.sorensen@airtable.com'
    recipient     TEXT NOT NULL,                 -- lowercase prospect email
    send_date     DATE NOT NULL,                 -- America/Chicago calendar day
    lane          TEXT NOT NULL,                 -- 'psu_e1' | 'psu_cadence' | 'reply' | ...
    claimed_by    TEXT,                          -- run/tick identifier for debugging
    claimed_at    TIMESTAMPTZ DEFAULT now(),
    status        TEXT NOT NULL DEFAULT 'claimed'
                  CHECK (status IN ('claimed','sent','released','bounced')),
    PRIMARY KEY (mailbox, recipient, send_date, lane)
);
CREATE INDEX IF NOT EXISTS idx_send_claim_recipient ON send_claim (recipient);

-- -----------------------------------------------------------
-- 3. send_log — append-only record of every actual send.
--    Written AFTER the Gmail API confirms, keyed by Gmail
--    message id so recounts dedupe correctly.
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS send_log (
    id             BIGSERIAL PRIMARY KEY,
    gmail_msg_id   TEXT UNIQUE,                  -- null until send confirmed
    thread_id      TEXT,
    mailbox        TEXT NOT NULL,
    recipient      TEXT NOT NULL,
    subject        TEXT,
    lane           TEXT NOT NULL,
    step           TEXT,                         -- 'E1','E2',... or 'reply'
    account        TEXT,
    sent_at        TIMESTAMPTZ DEFAULT now(),
    ct_date        DATE GENERATED ALWAYS AS
                   ((sent_at AT TIME ZONE 'America/Chicago')::date) STORED
);
CREATE INDEX IF NOT EXISTS idx_send_log_ctdate  ON send_log (ct_date);
CREATE INDEX IF NOT EXISTS idx_send_log_recip   ON send_log (recipient);
CREATE INDEX IF NOT EXISTS idx_send_log_account ON send_log (account);

-- -----------------------------------------------------------
-- 4. leads_ledger — one row per active lead (replaces the stale
--    Hyperagent Leads table cmqil72fp05ea07adl268px76).
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads_ledger (
    id             BIGSERIAL PRIMARY KEY,
    email          TEXT UNIQUE NOT NULL,
    first_name     TEXT,
    account        TEXT,
    title          TEXT,
    tier           TEXT CHECK (tier IN ('ATL','BTL')),
    mql_type       TEXT,                         -- HR | moving champion | PSU | MQL
    ent_user       BOOLEAN,
    ent_acct       BOOLEAN,
    sequence_id    TEXT,                         -- matrix 21793-96 or top-10 custom
    current_step   TEXT,
    next_due       TIMESTAMPTZ,
    gmail_thread   TEXT,
    e1_msg_id      TEXT,
    replied        BOOLEAN DEFAULT FALSE,
    opted_out      BOOLEAN DEFAULT FALSE,
    bounced        BOOLEAN DEFAULT FALSE,
    status         TEXT DEFAULT 'active',        -- active | done | held | dropped
    source_created TIMESTAMPTZ,                  -- Airtable Created (the watermark field)
    updated_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leads_due    ON leads_ledger (next_due) WHERE status='active';
CREATE INDEX IF NOT EXISTS idx_leads_acct   ON leads_ledger (account);

-- -----------------------------------------------------------
-- 5. pacing_checkpoint — verified daily send counts, written by
--    the orchestrator's own Gmail recount (never a specialist's
--    self-report). Feeds the 10a/12p/2p/4p/6p CT checkpoints.
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS pacing_checkpoint (
    id           BIGSERIAL PRIMARY KEY,
    ct_date      DATE NOT NULL,
    checkpoint   TEXT NOT NULL,                  -- '10:00','12:00','14:00','16:00','18:00'
    expected     INT,
    verified     INT,                            -- from live Gmail recount
    net_new      INT,
    cadence      INT,
    behind       BOOLEAN GENERATED ALWAYS AS (verified < expected) STORED,
    recorded_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE (ct_date, checkpoint)
);

-- -----------------------------------------------------------
-- 6. config_sync — prompt/skill hash heartbeats (replaces the
--    AutoBDR config-sync Airtable heartbeats).
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS config_sync (
    id            BIGSERIAL PRIMARY KEY,
    agent         TEXT NOT NULL,                 -- 'autobdr' | 'psu-sequencer' | ...
    canonical_hash TEXT,
    live_hash     TEXT,
    in_sync       BOOLEAN,
    skills_hash   TEXT,
    note          TEXT,                          -- e.g. 'no-flip: staged, card not clicked'
    checked_at    TIMESTAMPTZ DEFAULT now()
);

-- -----------------------------------------------------------
-- 7. kv_state — durable cursors/config that were in the HA
--    'State' table (intake watermark, last sweep date, etc.)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS kv_state (
    key        TEXT PRIMARY KEY,                 -- 'intake_watermark','last_sweep_date',...
    value      JSONB,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed the standing DNC rulings (as of 2026-08-20/25 ledger)
INSERT INTO dnc_ledger (scope, value, level, reason) VALUES
  ('account','apple','hard','contractual no-contact'),
  ('account','roblox','hard','full DNC (Luke 2026-06-18)'),
  ('account','block','hard','full DNC (Luke 2026-06-18)'),
  ('account','t-mobile','code_red','no net-new outbound (Luke 2026-08-20)'),
  ('domain','t-mobile.com','code_red','T-Mobile domain'),
  ('domain','t-mobil.com','code_red','T-Mobile typo domain'),
  ('account','williams-sonoma','code_red','only account NOT released in 8/20 ruling; leak verified 8/25'),
  ('domain','wsgc.com','code_red','Williams-Sonoma domain')
ON CONFLICT (scope, value) DO NOTHING;
