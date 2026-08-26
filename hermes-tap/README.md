# hermes-tap

Luke Sorensen's core-4 Hyperagent fleet, exported for Nous Research Hermes Agent.
Agents + skills live here (git = source of truth). Memories go to Honcho/Mem0.
Operational state goes to Neon Postgres.

```
hermes-tap/
  agents/<name>/SOUL.md     # profile identity -> ~/.hermes/profiles/<name>/SOUL.md
  skills/<name>/            # SKILL.md + scripts -> `hermes skills tap add`
  db/schema.sql             # Neon tables (incl. the atomic send-claim mutex)
  db/ops_db.py              # shared Postgres helper (claim_send, is_blocked, ...)
  db/send_guard.py          # the send chokepoint (replaces build_send.py's HA deps)
  memory/prune_rules.md     # how 2,458 memories get cut to a durable few hundred
  memory/import_memories.py # bulk import to Honcho or Mem0
  MANIFEST.md               # what ports / what doesn't
```

## Setup order

### 1. Neon (free)
Create a project at neon.tech → copy the `DATABASE_URL`. Then:
```bash
pip install "psycopg[binary]"
psql $DATABASE_URL -f db/schema.sql        # creates tables + seeds the DNC ledger
python3 db/send_guard.py                   # smoke test (claims + releases a send)
```
Put `DATABASE_URL` in each Hermes profile's `.env`. The send_claim table is the
atomic dedupe that fixes the double-send race Airtable/Hyperagent tables couldn't.

### 2. Memory provider — Honcho (or Mem0)
```bash
hermes memory setup        # pick honcho (free tier) — or mem0
```
Then prune + import:
```bash
# produce pruned_memories.jsonl per memory/prune_rules.md (dedupe, drop stale)
export HONCHO_API_KEY=... HONCHO_WORKSPACE=hermes
python3 memory/import_memories.py --provider honcho --file pruned_memories.jsonl --dry-run
python3 memory/import_memories.py --provider honcho --file pruned_memories.jsonl
# (Mem0: export MEM0_API_KEY=... and --provider mem0)
```

### 3. Skills tap
```bash
hermes skills tap add <your-github-user>/hermes-tap
```

### 4. Profiles
```bash
for a in autobdr psu-sequencer prospect-reply-drafter master-pipeline-agent; do
  hermes profile create $a
  cp agents/$a/SOUL.md ~/.hermes/profiles/$a/SOUL.md
done
```

## What still needs building (the integration "hands")
Gmail send/read, Google Calendar, Zoom, Airtable R/W, SFDC SOQL, Databricks SQL,
Outreach publish + opt-out, LeadIQ/Lusha reveal, Slack always-on. Recommended:
Composio MCP for the OAuth'd Google/SFDC calls + thin REST skills for Outreach/LeadIQ.
See MANIFEST.md.
