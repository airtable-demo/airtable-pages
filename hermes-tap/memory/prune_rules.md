# Memory Prune Rules — before Honcho/Mem0 import

2,458 memories is too many to dump raw into a memory provider — a large share are
superseded near-duplicates (the same rule re-saved on each correction). Prune FIRST,
import the survivors. Target: a few hundred durable memories, not thousands.

## Pass 1 — dedupe clusters (keep newest, drop the rest)
These topics recur as 4-7 near-identical copies. Keep the newest (latest date in content),
drop older:
- AutoBDR config-sync baseline hash (≈8 copies; keep the single latest reconfirm)
- POV framework / 5-beat Chipotle rule (≈5 copies)
- Luke's outbound email rules / 8-rule set (≈4 copies)
- clone-not-share portability (≈6 copies)
- LeadIQ default behavior (≈3 copies; keep the one with CSV + obfuscation note)
- "Prose is NOT a guard" (≈6 copies)
- "Luke wants Master Pipeline Agent to act as active PM" (≈3 copies)
- Chelsey Monroe / Cisco CSM routing (2 copies)
- never-loop-a-1LL (2 copies)
- LS-Leads source-of-truth / Gmail-only 1,500 (≈5 copies)

## Pass 2 — drop stale operational snapshots (worthless on a new platform)
- PSU backfill day-status ("13 net-new went out today") — historical, not durable
- Individual pacing-checkpoint results — historical
- Heartbeat/no-flip incident logs — keep ONE memory documenting the no-flip failure mode, drop per-incident copies
- "current backlog" counts — change daily, meaningless after migration

## Pass 3 — drop platform-locked mechanics (Hermes won't have these systems)
Keep the RULE, drop the Hyperagent mechanism:
- KEEP: "guard rails must be in code, not prose" (durable principle)
- DROP: memories that are only about Hyperagent tool quirks being replaced
  (PublishWebpage thread-scoping, HA table staleness, InvokeNamedAgent @mention rule,
  config-sync no-flip mechanics) — EXCEPT one summary memory noting why the fleet moved
  to Neon (atomic claim) so the rationale survives.

## What MUST survive (importance 5 / load-bearing)
- All DNC/compliance rulings + the current hold ledger state
- Funnel definition (6 stages) + follow-up coverage rule
- Booking floor (30+ editors), qualify-first default, 12h rule, Zoom-only
- POV framework (newest copy), email rules (newest copy), sequence-count rule
- Credential-locked skill distribution pattern
- False-MSA gate, opt-out absolute suppression, never-contact-met-with rule
- boil-the-ocean standard, active-PM verification discipline

## Output
A pruned JSONL: {"content": ..., "category": ..., "importance": ..., "agent_scope": ...}
feeding import_memories.py.
