# Hermes Migration Manifest — Luke's Core 4

Export date: 2026-08-26. Source: Hyperagent workspace (Luke Sorensen).

## Tap layout (Hermes-consumable)
```
hermes-tap/
  agents/<name>/SOUL.md        # profile identity -> copy to ~/.hermes/profiles/<name>/SOUL.md
  skills/<name>/               # SKILL.md + scripts -> install via `hermes skills tap add <this-repo>`
  MANIFEST.md                  # this file
```

## The 4 agents
| Agent | Hyperagent ID | SOUL.md | Status |
|---|---|---|---|
| AutoBDR | cmpveyvg601b807ad4k7mwr5e | agents/autobdr/SOUL.md | ✅ skeleton (reconstructed from skills + canonical flow) |
| PSU Sequencer | cmqilpd1l20nk07add0837jw3 | agents/psu-sequencer/SOUL.md | ✅ skeleton + full portable engine |
| Prospect Reply Drafter | cmpe8edbt0q4006ad4ovms0im | agents/prospect-reply-drafter/SOUL.md | ✅ skeleton (rules from memory ledger) |
| Master Pipeline Agent | cmqs6tlf10ubz07ads57c56cy | agents/master-pipeline-agent/SOUL.md | ✅ skeleton (charter from memory ledger) |

NOTE: SOUL.md files are reconstructed from skill docs + the standing-rules memory ledger, NOT a
byte-for-byte dump of the live system prompts (GetAgentConfig only reads the current thread's
agent from inside a generalist thread). Pull the live prompts from each agent's own thread, or
the canonical_prompt.txt in the autobdr-config-sync artifacts, for a verbatim export.

## Skills exported (5 of ~15 core)
| Skill | Ports? | Why |
|---|---|---|
| psu_sequencer_v1 | 🟡 engine yes / IO no | engine_core, render, injection, build_send guards are pure Python. Intake (Airtable MCP), state (HA tables), send (Gmail integration) are Hyperagent-locked. |
| outbound_account_play | 🟡 helpers yes | score_candidates/merge_and_filter/assemble_play_csv pure Python. Orchestration calls Hyperagent skills/integrations. |
| sequence_generation | 🟢 mostly | validate_sequence.py is pure validator (fully portable). Generation prompts portable. |
| prospect_landing_page_generator | 🟢 mostly | build_landing_page.py pure script + canonical_template.html. Publish step was PublishWebpage/GitHub Pages (ports via GitHub API). |
| inbox_triage | 🟡 helpers yes | classify_*.py pure Python. Gmail read/label/archive was Hyperagent Gmail integration. |

## The three storage layers on Hermes (your real question)
1. **Agent brains (SOUL.md) + skills** -> THIS GIT REPO (free). Hermes reads files, not Postgres.
2. **Memories (2,458)** -> Honcho free tier (`memory.provider: honcho`). Built-in MEMORY.md caps ~2,200 chars — too small. Prune superseded duplicates first (many near-identical config-sync / POV-framework copies).
3. **Operational state (DNC ledger, send log, pacing checkpoints, leads ledger)** -> Postgres. **This is the durable fix for your known stale-Hyperagent-tables defect.** Airtable is NOT the right home for this — see below.

## What does NOT port (rebuild as Hermes skills / MCP)
Gmail send+read, Google Calendar, Zoom create, Airtable R/W, SFDC SOQL, Databricks SQL,
Outreach publish + opt-out, LeadIQ/Lusha reveal, Slack always-on. Suggested: Composio MCP
(one OAuth layer for Gmail/Calendar/SFDC) + a couple of thin REST skills for Outreach/LeadIQ.
