# The one prompt

Paste this into Hermes (after `hermes skills tap add airtable-demo/airtable-pages`). It wires
the operational DB and confirms the memory provider. Prereqs it will ask for if missing:
`DATABASE_URL` (Neon) and a configured memory provider (`hermes memory setup` → honcho/mem0).

---

```
Bootstrap Luke's agent fleet from the airtable-demo/airtable-pages tap.

1. SKILLS — confirm these loaded from the tap and are importable: psu_sequencer_v1,
   outbound_account_play, sequence_generation, prospect_landing_page_generator,
   inbox_triage. Report any that failed.

2. OPS DB — the shared operational state lives in hermes-tap/db/. The schema is ALREADY
   APPLIED to my Neon project (tables + seeded DNC ledger live, atomic claim verified).
   NOTE: this sandbox blocks raw Postgres on 5432 — use hermes-tap/db/neon_http.py (Neon's
   HTTPS serverless driver, stdlib-only, $1/$2 placeholders), NOT psycopg. If there's no
   DATABASE_URL, ops_db.py falls back to local SQLite at $HERMES_HOME/ops.db.
   Self-test against Neon (set DATABASE_URL first):
       from neon_http import NeonHTTP
       import os
       db = NeonHTTP(os.environ["DATABASE_URL"])
       print("claim A:", db.claim_send("luke.sorensen@airtable.com","smoke@acme.com","psu_e1","boot"))
       print("claim B (must be False):", db.claim_send("luke.sorensen@airtable.com","smoke@acme.com","psu_e1","boot"))
       print("apple:", db.is_blocked("j@apple.com","apple"))
       print("clean:", db.is_blocked("j@acme.com","acme"))
       db.release_claim("luke.sorensen@airtable.com","smoke@acme.com","psu_e1")
   Or the SQLite fallback self-test:
       from ops_db import OpsDB
       db = OpsDB()
       print("claim A:", db.claim_send("luke.sorensen@airtable.com","smoke@acme.com","psu_e1","boot"))
       print("claim B (must be False):", db.claim_send("luke.sorensen@airtable.com","smoke@acme.com","psu_e1","boot"))
       print("apple blocked:", db.is_blocked("j@apple.com","apple"))
       print("clean blocked:", db.is_blocked("j@acme.com","acme"))
       db.release_claim("luke.sorensen@airtable.com","smoke@acme.com","psu_e1")
       db.close()
   Expect: claim A True, claim B False, apple blocked, clean not blocked. claim B = the
   double-send mutex working.

3. MEMORY — confirm the external provider (honcho or mem0) is active via `hermes memory status`.
   If it's set up, bulk-load my durable rules:
       python3 hermes-tap/memory/import_memories.py --provider <honcho|mem0> --file hermes-tap/memory/pruned_memories.jsonl
   (needs HONCHO_API_KEY or MEM0_API_KEY in env). If no provider is configured, tell me to run
   `hermes memory setup` first, then re-run this step.

4. PROFILES — confirm a SOUL.md exists for each of: autobdr, psu-sequencer,
   prospect-reply-drafter, master-pipeline-agent (from hermes-tap/agents/<name>/SOUL.md).
   Create any missing Hermes profile and copy its SOUL.md into place.

Report a one-line status per step: SKILLS ok/fail, DB backend + self-test result, MEMORY
provider + import count, PROFILES present. Then tell me what's left that's human-only
(e.g. memory setup, OAuth for Gmail/Calendar/SFDC).
```

---

## What's deliberately NOT in the prompt (and why)
- **Integration OAuth** (Gmail, Google Calendar, SFDC, Zoom, Outreach, LeadIQ) — those are
  interactive logins. Do them once (Composio or per-service), not via a prompt. The bootstrap
  tells you they're outstanding rather than pretending to wire them.
- **Full 2,463-memory dump** — not portable without a Hyperagent export. The bootstrap loads the
  curated durable set (pruned_memories.jsonl). Swap in the full export later if you get one.
