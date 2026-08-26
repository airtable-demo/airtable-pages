# Inbox Triage Skill

Daily morning agent run that pulls the last 24 hours of inbox mail, classifies
every message, applies an ordered Gmail label set, and auto-archives noise.

Built for Luke Sorensen (BDR for Enterprise at Airtable) but **clone-not-share
portable** — every cloned instance captures the AE's identity on first run and
operates on that AE's own Gmail, Salesforce/Databricks data, and Hyperagent
LLM. No hardcoded names, emails, IDs, or domains.

## What it does

For each inbound message in the last 24 hours:

1. Classify sender as **internal** (own company), **prospect** (external
   human), or **noise** (Gong/Zoom recording, bounce, OOO, platform digest).
2. **Noise** → apply `[ABDR Archived]`, remove `INBOX`. Done.
3. **Internal** → leave alone (Luke doesn't triage internal mail).
4. **Prospect**:
   - Match by email against `hanalytics_production.salesforce.lead` and assign
     a **source bucket**: Handraiser / Moving Champion / PSU / MQL / Other
     (or no source label if cold and not in SFDC).
   - Classify **seniority** from the prospect's title:
     ATL / ATL Possible / BTL.
   - Classify **interest** from the reply body:
     Interested / Maybe / Not Interested.
   - Apply three labels in canonical order:
     **1 interest → 2 seniority → 3 source**
     (Gmail's alphabetical render gives left-to-right inbox display.)

## Tag display order (the key UX detail)

Gmail renders labels on a message **alphabetically by name**. The skill uses
numeric prefixes so the canonical priority — interest first, then seniority,
then source — falls out naturally:

```
[1 Interested] [2 ATL] [3 Handraiser]   ← what the inbox row looks like
   ^ interest    ^ seniority  ^ source
```

The full canonical 12-label set (plus the existing `[ABDR Archived]`) lives in
`label_specs.json` with validated Gmail palette color pairs.

## Phases

### Phase 0 — AE Profile Discovery (idempotent, runs once per clone)

The agent searches its own memory for an `AE Profile` containing:

| Field | Purpose | Example |
|---|---|---|
| `internal_domain` | Sender classification (internal vs prospect) | `airtable.com` |
| `sfdc_user_id` | Surface ownership context on matched leads | `005Nx00000DgtVFIAZ` |
| `signoff_name` | (reused from other outbound skills) | `Luke` |

If any field is missing, the agent asks the AE conversationally and writes via
`CreateMemory`. Never hardcode these values in the skill or its scripts.

### Phase 1 — Label Setup (idempotent, runs once per clone)

1. `GMAIL_LIST_LABELS` → map existing names to label IDs.
2. For each canonical label in `label_specs.json` not present, call
   `GMAIL_CREATE_LABEL` with both `background_color` and `text_color` from the
   validated palette (Gmail rejects single-color calls with 400).
3. Cache the resulting label IDs in agent memory so subsequent triage runs
   skip Phase 1.

Known gotcha from prior work: `GMAIL_CREATE_LABEL` silently drops invalid
color hex values. The specs in `label_specs.json` use only validated palette
pairs from Luke's `gmail_labels_harness.md`.

### Phase 2 — Fetch Inbox

`GMAIL_FETCH_EMAILS` with query:

```
in:inbox newer_than:1d
```

Paginate via `page_token` until exhausted. Capture per message:
`id`, `threadId`, `from`, `subject`, snippet (first ~500 chars of body),
`labelIds`. Deduplicate by `threadId` — apply triage at thread level so
multi-message threads get one consistent label set.

### Phase 3 — Classify

For each message:

1. **`classify_sender.py`** with `--internal-domain {{INTERNAL_DOMAIN}}` →
   `internal` / `prospect` / `noise_candidate`.
2. If `noise_candidate`:
   - **`detect_archive_candidate.py`** with sender + subject + snippet →
     `archive` (with reason: `gong_recording` / `zoom_recording` / `bounce` /
     `ooo` / `platform_digest`) or `keep`.
   - If `archive`: queue the thread for `[ABDR Archived]` + INBOX removal.
   - If `keep`: re-classify as prospect (the sender pattern was a false
     positive, e.g., a real human at an unusual subdomain).
3. If `internal`: skip (no labels applied).
4. If `prospect`:
   - Run the **Databricks SQL** in `lookup_lead.sql` with the batch of
     prospect emails to get title + 5-bucket source.
   - **`classify_seniority.py`** with `--title "{lead.title}"` → ATL / ATL
     Possible / BTL. If no SFDC lead match (cold prospect), use an empty
     title → defaults to ATL Possible. (Optional: enrich via LeadIQ before
     classifying for a higher hit rate; see Composability below.)
   - **Agent LLM** reads the reply body and outputs interest bucket using the
     prompt in `classify_interest.md` →
     Interested / Maybe / Not Interested.

### Phase 4 — Apply Labels & Archive

Two batched `GMAIL_BATCH_MODIFY_MESSAGES` calls per run:

1. **Archive batch**: all noise threads → `add_label_ids=[ARCHIVED_ID]`,
   `remove_label_ids=["INBOX"]`. Max 1000 IDs per call (chunk if needed).
2. **Triage batch**: all prospect threads → add the three label IDs in the
   canonical order [interest_id, seniority_id, source_id]. Source label is
   omitted when the prospect didn't match SFDC.

Internal threads receive no API call.

### Phase 5 — Summary

Write a single-line summary to the conversation:

```
Triaged N messages | Archived: A (gong=X, zoom=Y, bounce=Z, ooo=W, digest=V)
| Internal skipped: I | Prospects tagged: P
  - Interest: Interested=a, Maybe=b, Not Interested=c
  - Seniority: ATL=x, ATL Possible=y, BTL=z
  - Source: Handraiser=h, MQL=m, Moving Champion=mc, PSU=p, Other=o, Cold=c
```

Optionally, write the full triage result list to `validate_triage.py` for
sanity-checking before declaring success.

## Files

| File | Purpose |
|---|---|
| `README.md` | This file — full workflow documentation |
| `label_specs.json` | Canonical 12 labels + colors |
| `classify_sender.py` | internal / prospect / noise_candidate (deterministic) |
| `detect_archive_candidate.py` | Gong/Zoom/bounce/OOO/digest detection |
| `classify_seniority.py` | ATL / ATL Possible / BTL from title regex |
| `lookup_lead.sql` | Databricks 5-bucket source category template |
| `classify_interest.md` | Agent prompt template for interest classification |
| `validate_triage.py` | Sanity-check end-to-end triage output |
| `sample_run.json` | Example triage output for testing the validator |

## Running

End-to-end agent execution looks like this (pseudocode the agent follows):

```
# Phase 0
ae = SearchKnowledge("AE Profile") or ask_user_and_save()

# Phase 1
labels = GMAIL_LIST_LABELS()
for spec in label_specs.json:
  if spec.name not in labels:
    GMAIL_CREATE_LABEL(spec.name, spec.background_color, spec.text_color)

# Phase 2
emails = []
page_token = None
while True:
  resp = GMAIL_FETCH_EMAILS(query="in:inbox newer_than:1d", page_token=page_token)
  emails.extend(resp.messages)
  page_token = resp.next_page_token
  if not page_token: break

# Phase 3 — deterministic classification (batched)
write emails to /tmp/inbox.json
run classify_sender.py --file /tmp/inbox.json --internal-domain {ae.internal_domain} --output /tmp/sender_class.json
run detect_archive_candidate.py --file <noise_candidates_only.json> --output /tmp/archive_decisions.json

# Databricks lookup for matched prospects
prospect_emails = [e for e in prospects]
sql = read('lookup_lead.sql').replace('{{EMAILS}}', "'" + "','".join(prospect_emails) + "'")
lead_data = ExecuteDatabricksQuery(sql)

# Seniority classification (deterministic)
run classify_seniority.py --file <titles.json> --output /tmp/seniority_class.json

# Interest classification (agent LLM, one per prospect — use sub-agents in parallel for >10 prospects)
for prospect_email:
  agent reads body, returns Interested/Maybe/Not Interested per classify_interest.md prompt

# Phase 4 — apply labels in two batches
GMAIL_BATCH_MODIFY_MESSAGES(archive_msg_ids, add=[archived_id], remove=["INBOX"])
for each prospect msg:
  GMAIL_MODIFY_THREAD_LABELS(thread_id, add=[interest_id, seniority_id, source_id])

# Phase 5
print summary
run validate_triage.py --file /tmp/triage_results.json
```

## Composability with other skills

- **Prospect Reply Drafter** (Zapier-triggered): reads the same three-bucket
  interest classification from a Gmail label. After Inbox Triage runs, the
  Drafter agent can skip its own Step 0 classification and route on the label
  directly.
- **AutoBDR Live Triage**: shares the canonical 5-bucket source taxonomy
  (PSU / MQL / Handraiser / Moving Champion / Other) sourced from the same
  Databricks/SFDC fields. The Live Triage skill writes the bucket to the
  Airtable Leads table; Inbox Triage writes it to a Gmail label.
- **LeadIQ Prospecting Toolkit**: optional enrichment fallback when SFDC has
  no record of the sender. Reveal email → title → seniority classification.
- **POV Generation / Sequence Generation**: downstream — Interested + ATL +
  PSU is a strong handoff signal to a personalized POV + sequence build.

## Known limitations

- **LinkedIn**: cannot be scraped from the Hyperagent sandbox (HTTP 999 anti-
  bot + sign-up wall). Title comes from the SFDC `lead.title` field
  (which is itself usually ZoomInfo/Clearbit-enriched). If no SFDC match, the
  seniority defaults to ATL Possible — the agent or AE can manually adjust.
- **Body snippet length**: Gmail's snippet field is ~200 chars by default. For
  more nuanced interest classification, fetch the full message body via
  `GMAIL_FETCH_MESSAGE_BY_THREAD_ID` and pass to the LLM. This costs an extra
  API call per prospect.
- **Thread-level vs message-level**: the skill applies labels at thread level
  via `GMAIL_MODIFY_THREAD_LABELS`. If a single thread contains both prospect
  and internal replies (e.g., the AE replied internally on a prospect chain),
  the thread is treated as prospect (the inbound prospect message drives
  triage). Adjust to message-level via `GMAIL_BATCH_MODIFY_MESSAGES` if this
  becomes a problem.
- **Gmail label color palette**: only 102 specific hex values accepted. The
  `label_specs.json` only uses validated pairs from the AutoBDR
  `gmail_labels_harness.md` known-good list.
- **OAuth scope**: triage requires `gmail.modify` for label changes. Read-only
  scopes block Phase 1 and Phase 4.

## Failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| `GMAIL_CREATE_LABEL` returns 400 | Invalid color hex (not in palette) | Use only pairs from `label_specs.json` |
| `GMAIL_CREATE_LABEL` returns 409 | Label already exists | Re-run `GMAIL_LIST_LABELS` to get its ID, skip create |
| All senders classified `internal` | `internal_domain` set wrong | Re-check AE Profile, must be bare domain (no @, no `https://`) |
| Many prospects with no source bucket | Email mismatch case-sensitivity | `lookup_lead.sql` already lowercases both sides — investigate if persistent |
| Archive batch missing labels | Some thread IDs invalid (deleted, archived already) | Gmail silently skips bad IDs — re-list inbox and retry |
| Validator reports "interest label applied AFTER seniority" | Label IDs passed in wrong order to `GMAIL_MODIFY_THREAD_LABELS` | Build the `add_label_ids` array as [interest, seniority, source] explicitly |

## Validator

`validate_triage.py` runs sanity checks on the final triage result list:
- Required fields present
- Categories are canonical
- Prospects have exactly 1 interest + 1 seniority label
- Source label count is 0 or 1 (never 2+)
- Application order recorded as interest → seniority → source
- No unrecognized labels matching the `[1-3] X` pattern

Run with `--strict` to fail on warnings (recommended for CI / scheduled runs):

```
python3 validate_triage.py --file triage_results.json --strict
```

Exit codes: 0 clean, 1 warnings (under `--strict`), 2 hard errors.
