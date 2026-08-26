# PSU Sequencer — Live Mode Runbook

Autonomous PSU/inbound sequencer. Sends from Luke's Gmail (luke.sorensen@airtable.com),
4-email matrix sequences + 2-email top-10 customs, per-lead custom85 injection, absolute
stop-on-reply. Replaces the sunset LS-Leads Outreach automation. Send channel = Gmail-direct.

## State (Hyperagent Tables, persist across ticks in this agent's Live Mode thread)
- Leads ledger: one row per active lead (identity, classification, routing, custom85, Status,
  Current Step, Next Due, Gmail Thread ID, E1 Message ID, Replied). tableId cmqil72fp05ea07adl268px76
- Send Log: append-only per send (Date, Lead ID, Step, Status, Gmail Message ID). tableId cmqil72kp05eb07adq2qkhzwj
- State: key/value durable cursor + config. tableId cmqimqm8y076807ad8auqowmy
  Keys: intake_cursor (FALLBACK ONLY — max signup/handraiser date processed by the Databricks
  forward-cursor intake; used only while Airtable is unavailable, see step 1), daily_cap (=2000),
  backlog_total_since_may25, last_sweep_date (YYYY-MM-DD of the last nightly Databricks cross-check, step 1X),
  dashboard_artifact_id (PublishWebpage id the REPORT step republishes to each tick).
- On first run, create all three tables if absent.

## Intake source = LS-leads Airtable base (PRIMARY) + Databricks (nightly cross-check)
Luke 2026-06-17 (final): the LS-leads Airtable base is the SINGLE primary source of truth for intake —
it mirrors the SFDC "LS - Leads" report (Show Me=All leads, Last Source Date last-30d), catches ALL inbound
lead types (demo/content/contact-us/webinar/etc., not just PSU+handraiser), and carries the enrichment
(accurate ATL/BTL + title) raw SFDC lacks. Databricks is NOT retired — it runs once/day as a cross-check.
- The Airtable view is a ROLLING 30-DAY MEMBERSHIP SET, not a cursor stream. Consume it by FULL-VIEW SCAN +
  ledger dedupe every tick — NOT a Last-Source-Date cursor. A cursor would miss backdated attribution
  (LeanData can set Last Source Date to a past touch date on routing lag), which is the exact gap that the
  old Databricks daily sweep existed to close. Full-scan+dedupe is immune and gives same-day speed-to-lead.
  NOTE: the MCP reader cannot actually read the 30-day VIEW (view param ignored — see WARNING below); the
  scan reads the RAW FULL TABLE and applies the 30-day source_date filter client-side. The 30-day window IS
  the catch-all horizon; anything older that was never caught is out of scope for fresh sequencing anyway.
- PREFERRED READER (2026-06-25): read LS-leads DIRECTLY via the connected Airtable MCP — NO PAT needed.
  The agent already has the `airtable__list_records_for_table` action (the Airtable integration is
  connected at the agent level). This is the primary intake path now; airtable_intake.py (PAT-gated) is
  a fallback only. The PAT credential has repeatedly failed to propagate into RunWithCredentials, so do
  NOT depend on it.
  MCP CALL: airtable__list_records_for_table with baseId=applILm88NgiXbRFy, tableId=tbls70vRSwhThKCIs,
  pageSize=100, paging via nextCursor until exhausted. WARNING (verified 2026-06-29): the MCP SILENTLY
  IGNORES any `view` parameter — you ALWAYS get the RAW FULL TABLE (~10K rows, newest-created first),
  never the 30-day view viw8Tnmlg5saoLmFw. Do NOT pass view and do NOT assume rows are pre-filtered.
  You MUST (a) paginate the ENTIRE table to exhaustion — never stop after early pages just because they
  look already-sequenced (newest-first ordering front-loads recently-touched rows; net-new leads appear
  throughout the table), and (b) filter CLIENT-SIDE: source_date within last 30 days + contact_flag ==
  "Contact" + keep_decision_for + ledger/Send-Log dedupe. For cheap pre-counts use airtable__analyze_table
  (supports server-side filters). The response carries metadata.totalRecordCount and cellValuesByFieldId
  per record.
  FIELD MAP (by field id) — already confirmed live 2026-06-25:
    email        = fldpEQJKfCcGGsEL5
    first_name   = fldt6Fh1pjAlEUXVZ
    last_name    = flddarVFoL3w6ACN5
    account      = fldw8rwWkr9WmmoEz
    account_stage= fldIXBT8wAgGj9iU1   (ent_acct == "5. ENT Customer")
    ent_user     = fldhoPzuNS8LhW7Ah   (bool)
    tier         = fld1dWLZfCfKu9zd4   (ATL/BTL singleSelect — use .name directly)
    mql_type     = fldWj5CjT1s3TkOUn   (singleSelect; .name == "PSU" / "HR" / etc.)
    contact_flag = fldQa2ypRXED54spJ   (singleSelect; SEND ONLY where .name == "Contact"; skip "Do Not Contact")
    source_date  = fldu4tQJ7YbvPlhFw   (display only; not a cursor)
    outreach_pid = fldp47eohZkVruC5A
  CONTACT GATE (hard): drop any row whose contact_flag is not exactly "Contact" — this is in ADDITION
  to keep_decision (DNC/compliance). Both gates must pass.
- Optional legacy path: AIRTABLE_TOKEN (read-only PAT) + airtable_intake.py. If the PAT is ever set and
  propagating, that script works too — but the MCP path above is preferred and credential-free.

### AIRTABLE FIELD MAP (fill once via `airtable_intake.py schema` — gated on the PAT)
The base mirrors SFDC "LS - Leads"; confirm the exact column names before first Airtable-primary tick.
  lead_id      <- (Salesforce record id column, e.g. "Lead ID" / "Record ID")          TODO confirm
  email        <- "Email"                                                              TODO confirm
  first_name   <- "First Name"                                                          TODO confirm
  title        <- "Title"                                                               TODO confirm
  account      <- "Account Name" / "Company"                                            TODO confirm
  account_stage<- "Account Stage"                                                       TODO confirm
  ent_user     <- "Is Enterprise User" (bool)                                           TODO confirm
  tier         <- enriched "ATL/BTL" column (use directly; else tier_of(title))         TODO confirm
  is_handraiser<- "Latest Handraiser Date" set / "MQL Type"=HR                          TODO confirm
  source_date  <- "Last Source Date"                                                    TODO confirm (display only; not a cursor)

## Skill helpers (run via Bash in the skill dir)
- engine_core.py: classify(title,ent_user,stage), route(tier,ent_user,ent_acct,account,top10_map)
  -> matrix 21793-96 or top10 seq; dnc_status(account) hard/soft/ok;
  keep_decision(dnc,tier,is_handraiser) -> (keep,reason) [THE intake keep/drop gate; hard-DNC absolute];
  add_business_days.
- airtable_intake.py: PRIMARY intake reader. modes: `schema` (dump field names + a sample record — run
  this ONCE after the PAT is set to fill the AIRTABLE FIELD MAP below), `fetch` (page the full view ->
  airtable_leads.json), `count`. Auth: AIRTABLE_TOKEN via RunWithCredentials.
- injection.py: build_custom85(...) — DORMANT (custom85 paragraph cut 2026-06-17; not rendered).
- render.py: render_step(step,ctx) fills {first_name}{account}{company}{sender}{custom85}.
- optout.py: resolve(email) -> opted_out | clear | check_failed (FAIL-CLOSED). Powers build_send.py's
  opt-out guard; shells out to the Outreach Connector (outreach_connector.py), so any run of
  build_send.py (and optout.py/optout_sweep.py) must be under RunWithCredentials(skillName="Outreach
  Connector"). Standalone CLI: `python3 optout.py <email...>` or `--file emails.txt --out report.json`.
- optout_sweep.py: retroactive cross-check — resolve a list of already-contacted emails against
  Outreach opt-out, in <=25-email batches (respects the ~60s RunWithCredentials cap), report the
  opted-out ones, and mark them opted_out in the cache. `python3 optout_sweep.py --file emails.txt --out report.json`.
- DEPENDENCY: at tick start FetchSkillScripts('psu_sequencer_v1') AND FetchSkillScripts('Outreach
  Connector') so the connector script + OUTREACH_* creds are present for the step-3 opt-out lookup.
- templates: matrix_templates.json (4x4-email), top10_templates.json (9x2-email, custom85 in E1).

## TICK (Live Mode, every 30 min) — do in order
0. WINDOW/CAP GUARD. Sending only Mon-Fri 08:00-19:00 CT (extended to 7 PM per Luke 2026-06-25). Outside window: do intake + reply
   checks but DO NOT send. Count today's Send Log 'sent' rows; stop sending at the daily cap
   = 1500/day (Luke's Gmail limit, 2026-06-25). FULLY RAMPED as of 2026-06-17 — NO gradual ramp (deliverability already warmed
   via the prior Outreach Gmail-API volume; Luke confirmed). Safety throttle ONLY: if today's
   bounce rate >2%, pause sends and alert Luke.
   STRATEGY UPDATE (Luke, 2026-06-25 — OVERRIDES 2026-06-18 backlog-paused directive):
   IMMEDIATE PRIORITY TODAY: sequence ALL Meta, ALL EA (including studios: Criterion, DICE, Respawn,
   Frostbite — match "electronic arts" OR any EA-studio substring in top10_routing.json), and ALL Cisco
   leads. These are custom-account leads; they are in top10_routing.json and use top-account sequences.
   Per-tick send cap = 500 for custom-account leads (Meta/EA/Cisco), 150 for matrix leads. Do NOT wait
   for AIRTABLE_TOKEN — process whatever custom-account leads are reachable via Databricks today.
   BACKLOG IS NOW ACTIVE: lift backlog_hold for ALL custom-account leads (Priority 2) immediately.
   After today's Meta/EA/Cisco priority is satisfied, burn down ATL backlog (Priority 1), then matrix
   backlog NEWEST->OLDEST (Priority 3). Fresh daily inflow continues same-day in parallel.
   DAILY CAP = 1,500 (Luke's Gmail limit — NOT 2,000; the 2,000 figure was the ramped target but
   Luke's actual send limit is 1,500/day from luke.sorensen@airtable.com). Stop at 1,500.
   PSUs via GMAIL ONLY. Do NOT use Outreach for PSU sequencing — Outreach budget is reserved for
   Luke's other outbound (events, weekly plays, AutoBDR inbound follow-up).
1. INTAKE — PRIMARY (Airtable LS-leads full-table scan + dedupe). PREFERRED: read the table directly via
   the Airtable MCP (`airtable__list_records_for_table`, baseId/tableId + FIELD MAP above — NO view param,
   it is silently ignored; see WARNING) paging on nextCursor to EXHAUSTION, then filter client-side
   (30-day source_date + Contact gate) — NO PAT. FALLBACK only if the MCP is unavailable:
   `RunWithCredentials(psu_sequencer_v1, "python3 airtable_intake.py fetch")` -> airtable_leads.json.
   Either way you get ALL lead types, with enrichment. Then for each surviving row:
   a. MAP fields (email, first_name, title, account, account_stage, ENT-user, ATL/BTL, source date, record id)
      from the base's column names -> see AIRTABLE FIELD MAP (run `airtable_intake.py schema` once to fill it).
      Use the base's enriched ATL/BTL + title DIRECTLY (more accurate than the title regex); fall back to
      engine_core.tier_of(title) only if the base has no explicit tier for that row.
   b. classify -> tier (from base), ent_user, ent_acct; mql_type (handraiser if the base flags it).
   c. KEEP/DROP via engine_core.keep_decision_for(account, tier, is_handraiser,
      outreach_opted_out=<cache lookup>). keep_decision_for computes EVERY account gate from the name
      (dnc + compliance + pending_hold + psu_dnc) so none can be forgotten. Precedence is ABSOLUTE:
      Outreach opt-out, then pending_hold (Freshworks), then compliance_hold (Intuit), then psu_dnc
      (Sutter Health), then hard DNC (Apple/Roblox/Block) — all DROP even handraisers/ATL. soft DNC
      keeps only if ATL OR handraiser. ok keeps. Do NOT hand-roll this; call the helper.
      OPT-OUT AT INTAKE (cheap best-effort): if the lead's email is already marked "opted_out" in
      /tmp/psu_optout_cache.json (populated by the send chokepoint and the retroactive sweep), pass
      outreach_opted_out=True so it drops here and never enters the ledger. The AUTHORITATIVE opt-out
      gate is build_send.py at the send chokepoint (step 3), which does a live lookup for every send
      regardless — intake dropping is just an optimization, never the only layer.
   d. DEDUPE (this is the whole mechanism — no cursor): skip if Lead ID already in the Leads ledger, OR the
      email is already in Leads, OR the email appears in the Send Log within 30 days. Process only the rest.
   e. route -> bucket + sequence (top10_map = the 9 account substrings -> seq ids).
   f. custom85 is DORMANT (paragraph cut 2026-06-17). Leave custom85="" — do not run account_teams.
   g. upsert Leads row: Status=New, Current Step=0, Next Due=today, Created=now.
   NO cursor write on the Airtable path — the full-view scan + ledger dedupe is idempotent by construction;
   re-pulling the same rows every tick is expected and the dedupe in (d) drops everything already seen.
1-CURRENT (created_date coverage scan — ACTIVE MODEL as of 2026-06-18). The forward signup-cursor is
   DEPRECATED: it keyed on COALESCE(signup,handraiser) and missed ~79% of leads because LeanData creates
   leads in-book with BACKDATED signup dates. Trigger on BOOK-ARRIVAL instead. Each tick:
   - Databricks scan: in-book (Luke + 5 AE owners), current_lead_type_c='Product Signup',
     created_date >= '2026-06-18' (go_live_date), ORDER BY created_date ASC. (intake.sql CREATED-SCAN query.)
   - Export result -> GetTable saves to tool-results file -> load in python (avoids context bloat).
   - For each row: dedupe (skip if Lead ID in ledger OR email in ledger/30d Send Log OR in backlog_hold.json),
     keep_decision DNC, route. Net-new survivors = today's inflow to sequence.
   - SEND E1 (render.py, corrected copy) up to per-tick cap ~100; add sent leads to ledger as Sequencing.
   - Self-draining + idempotent: sent leads enter the ledger, so next tick's scan dedupes them; only un-sent
     net-new + fresh arrivals remain. NO cursor write.
   - Switch to direct Airtable base reads (step 1-PRIMARY) once the airtable_intake.py reader is built; the
     created_date Databricks scan is a verified proxy for the base "Filtered by Created" view (matched 264 vs 265).
1X. NIGHTLY DATABRICKS CROSS-CHECK (once/day; gate on State.last_sweep_date != today, then set it to today).
   Only meaningful once Airtable is the primary path (while on the 1-FALLBACK path it is redundant — skip it).
   Run intake.sql's SWEEP query (book filter, GREATEST(signup,handraiser) >= today-30d), dedupe against the
   Leads ledger (by Lead ID) AND 30-day Send Log (by email). For anything NEW the Airtable scan missed:
   (i) run steps 1b-1g to sequence it (coverage is the #1 goal), AND (ii) ALERT Luke with the list — a lead
   in Databricks but absent from the Airtable view signals an SFDC-report->Airtable sync gap worth knowing.
   Does NOT touch intake_cursor.
2. REPLY / OOO / BOUNCE. For each Leads row Status in {New,Sequencing} with a Gmail Thread ID:
   GmailGetThread(thread_id). If any message FROM the prospect (not Luke) -> Status=Replied,
   STOP (hand to reply->qualify->book flow). Auto-reply/OOO -> Next Due = return date +1 bday.
   mailer-daemon/bounce -> Status=Bounced (suppress). STOP-ON-REPLY IS ABSOLUTE, checked before any send.
3. SEND DUE. Select Leads with Status in {New,Sequencing} AND Next Due <= today, ordered ATL
   first then by Created, within remaining daily cap.
   3-PRE. SELF-SEND TRIPWIRE (run ONCE before the send loop):
     GmailSearchMessages(query="from:luke.sorensen@airtable.com to:luke.sorensen@airtable.com newer_than:1d").
     If it returns ANY message, a self-send loop has already happened -> DO NOT SEND this tick,
     alert Luke, stop. (Catches a regression at 1 message, never another flood.)
   SEND PATH IS DETERMINISTIC — NEVER hand-assemble a Gmail call and NEVER call GmailReplyToMessage
   yourself. For each due lead + its next unsent step:
     a. Write the lead send-spec to /tmp/psu_lead.json:
        {email, first_name, account, company, seq, step_index (0-based = Current Step),
         e1_message_id (the stored E1 Message ID; required once Current Step>0)}.
     b. RunWithCredentials(skillName="Outreach Connector") — build_send.py's opt-out guard shells
        out to the Outreach Connector, so it MUST run with the Outreach creds injected
        (FetchSkillScripts('Outreach Connector') once at tick start prepares the creds + the
        connector script). Run from the skill dir so `import render`/`engine_core`/`optout` resolve:
        `cd /agent/workspace/skills/psu_sequencer_v1 && python3 build_send.py /tmp/psu_lead.json`
        It renders the step, resolves `to` to the prospect email, runs the recipient / account-hold /
        OUTREACH-OPT-OUT / body guards, and writes /tmp/psu_send_params.json ONLY on allow.
        CRITICAL: running it WITHOUT Outreach creds makes every opt-out lookup fail-closed
        (optout_check_failed) and blocks ALL sends — always run it under the Outreach Connector.
     c. If it prints "allow": true -> ExecuteIntegration(action=<printed action>,
        paramsFile="/tmp/psu_send_params.json"). action is GmailSendMessage (E1 + new-thread steps,
        carries subject) or GmailReplyToMessage (reply steps, threads on E1). `to` is ALWAYS the
        prospect email, set by the script — you never choose or omit it.
     d. If it prints "allow": false (action "BLOCK") -> DO NOT SEND. BRANCH on block_class (printed
        in stdout and in /tmp/psu_send_packet.json) — do NOT blanket-halt the tick on every block:
        - systemic  -> a recipient/body/template regression (the 480-loop flood class). Mark the lead
          Status=Send-Error (record reasons), HALT the entire send phase for this tick, alert Luke.
          (Fail-closed flood guard: one stopped message, never a flood.)
        - opted_out -> the prospect OPTED OUT in Outreach. Set Status=opted_out (PERMANENT suppression,
          same as Bounced — never E1, never a follow-up again), Send Log += (step, opted_out), SKIP
          this lead, CONTINUE the tick. (Per-lead consent stop — never halts the tick.)
        - account_hold -> a frozen/DNC account (e.g. Freshworks pending_hold, Sutter psu_dnc, hard DNC).
          Suppress/skip this lead per the hold, CONTINUE the tick.
        - optout_check_failed -> the Outreach opt-out lookup could not complete (transient API/creds
          issue). Do NOT suppress and do NOT send: leave the lead DUE, SKIP this send, CONTINUE the
          tick, and increment a per-tick counter — if many leads hit this, alert Luke (Outreach API/
          creds problem, NOT a per-lead condition).
        The script fails closed: it emits no params for a recipient that is empty/malformed/Luke's own/
        any @airtable.com address, a body with an unrendered {token} or "!", a held/DNC account, or an
        Outreach opt-out.
     e. On a successful send, update state:
        - E1 (step_index 0): save Gmail Thread ID + E1 Message ID; Status=Sequencing; Current Step=1;
          Next Due=add_business_days(today,3); Last Send=today; Send Log += (E1, sent, msg id).
        - Ei (step_index i): Current Step++; Next Due=add_business_days(today,3);
          Send Log += (Ei, sent, msg id). After the last step -> Status=Finished.
   - NUDGE / BUMP / ANY AD-HOC REPLY: NEVER hand-build GmailReplyToMessage. To send a bump
     (e.g. "Re: {name}: Airtable" / "following up on the note below... brief introductions next
     week?"), write the lead spec with "raw_body": "<reply HTML>" (plus e1_message_id) to
     /tmp/psu_lead.json and run build_send.py exactly as in (b)/(c). RAW-REPLY MODE renders it
     through the SAME recipient / account-hold / OPT-OUT / token guards and emits GmailReplyToMessage.
     This is the fix for the 7/6-7/7 bypass where the hand-built nudge evaded the self-send tripwire,
     the account holds, AND (now) the opt-out guard. If it prints allow=false, branch on block_class
     exactly as in (d). There is NO send path that skips build_send.py.
   - IDEMPOTENT: never build/send a step already in the Send Log for that lead.
   - WHY DETERMINISTIC (2026-06-23): a prose "always pass to=email" rule added 2026-06-22 STILL
     failed on the next unattended tick — the agent hand-built GmailReplyToMessage, omitted `to`,
     and ~hundreds of E2s derived To=Luke (every prior thread message is From:Luke) and looped into
     Luke's own inbox, plus shipped an unrendered {sender}. build_send.py removes that judgment call:
     recipient + body are resolved and verified in code, fail-closed. Do NOT bypass it.
4. ARCHIVE. Move Finished/Replied/Bounced rows out of the active set periodically.
5. REPORT. Refresh the Live Ops dashboard so Luke can verify health at a glance. Export Leads ->
   leads.json and Send Log -> sendlog.json (ExportTable or GetTable), write State keys -> state.json,
   then: `python3 report.py leads.json sendlog.json state.json '<now CT YYYY-MM-DD HH:MM>' dashboard.html`
   and PublishWebpage(filePath=dashboard.html, title="PSU Sequencer — Live Ops Dashboard",
   artifactId=State.dashboard_artifact_id) so the URL stays stable. report.py computes sends-today,
   bounce rate vs the 2% throttle, reply count, status funnel, tier/sequence/account mix, backlog
   cursor, and health checks (dedupe=0, Apple-in-ledger=0, cap headroom). Cheap; run every tick.

## Guardrails
- COPY RULES (Luke, 2026-06-18, enforced in render.fill):
  * NEVER use exclamation marks anywhere in subject or body. render.fill strips "!"; templates also scrubbed.
  * Blank first name -> greet with just "Hi," (NOT "Hi, there!"). Subject drops the "{first_name}: " prefix
    (-> "Airtable"); CTA "next week, {first_name}?" -> "next week?". Blank-name leads STILL send (not skipped).
- BACKLOG EXECUTION (Luke, 2026-06-18): clear the full ~5,100-contactable backlog in PRIORITY ORDER:
  (1) ALL ATLs first (~45 in backlog), (2) top-11 accounts = 10 active custom sequences incl Cisco,
  (3) backfill the remainder (matrix) NEWEST->OLDEST at whatever rate until cleared. Fresh daily inflow
  continues same-day in parallel. Lift backlog_hold progressively in this order.
- TOP-11 CUSTOM SEQUENCES: routing in top10_routing.json (short substrings -> source seq). 8 ACTIVE:
  Adobe 23855, Blue Shield 23856, Cisco 23868, EA 23863, Meta 23862, Riot 23858, T-Mobile 23857,
  Williams-Sonoma 23860. Ford 23859 = PARKED (Jon Yates territory). Roblox 23861 + Block 23864 customs
  RETIRED 2026-06-18 — those accounts are now FULL DNC (see below). Cisco (23868) added 2026-06-18 from Outreach.
- Stop-on-reply absolute (step 2 before step 3). Daily cap 1500 (Luke's Gmail limit, 2026-06-25) + >2% bounce throttle.
- RECIPIENT INVARIANT (absolute, ENFORCED IN CODE — not a reminder): EVERY send — E1, cadence
  follow-up, AND any nudge/bump — goes through build_send.py (template mode via seq/step_index, or
  RAW-REPLY MODE via raw_body). It resolves `to` to the prospect email and FAILS CLOSED on any send
  to an empty/malformed address, Luke's own address, any @airtable.com address, any held/DNC account,
  an Outreach OPT-OUT, or a body with an unrendered {token} or "!". NEVER hand-assemble a Gmail send
  or call GmailReplyToMessage without the script's emitted params file — the 7/6-7/7 nudge bypass
  (hand-built "Re: {name}: Airtable" bump) is exactly what raw-reply mode now covers. A reply to a
  Luke-sent message with no `to` defaults To=Luke and loops into Luke's inbox — build_send.py makes
  that impossible. Step 3-PRE self-send tripwire (from:luke to:luke newer_than:1d) halts the tick if
  a loop ever recurs.
- OUTREACH OPT-OUT (absolute, ENFORCED IN CODE): build_send.py consults Outreach's optedOut flag
  (optout.py) before every send and BLOCKS opted-out prospects (block_class=opted_out -> permanent
  Status=opted_out, like Bounced). Fail-closed: if the lookup can't complete (optout_check_failed),
  the send is blocked and retried next tick, never sent blind. This is why build_send.py runs under
  the Outreach Connector's creds. A lead who opted out in Outreach must NEVER get a PSU email.
- HARD DNC (ABSOLUTE — never auto-contact, even ATL, even handraisers): Apple, Roblox, Block.
  * Apple = contractual no-contact. * Roblox + Block (Luke 2026-06-18) = full DNC; the ONE exception is
    HANDRAISERS, which Luke contacts MANUALLY — the sequencer still never auto-sends them (surface
    Roblox/Block handraisers to Luke rather than sending).
- SOFT DNC (ATL-or-handraiser only): Uber, Williams-Sonoma, IGT, S&B, Scopely, eBay. Handraisers are
  "always contacted" ONLY relative to SOFT-DNC, never overriding a HARD DNC.
- COMPLIANCE HOLD (NOT DNC — absolute drop until cleared): Intuit. Off the DNC list since 2026-06-17 but
  held pending Luke's explicit in-thread confirmation the Carie Moore / Tyler Stirnus account-team
  commitment is formally cleared. engine_core.COMPLIANCE_HOLD; clear by emptying that tuple once Luke OKs.
- Enforced by engine_core.keep_decision — always route intake through it.
- Catch-all = Airtable full-view scan + ledger dedupe every tick (step 1, primary) + nightly Databricks
  cross-check (step 1X). While the Airtable PAT is not yet configured, the Databricks forward cursor
  (step 1-FALLBACK) carries intake so nothing stalls in the interim.
- All sends Mon-Fri 8 AM-7 PM CT (extended 2026-06-25); daily cap 1500; idempotent state machine.

## Reply -> qualify -> book (downstream)
On Status=Replied, hand to the existing Prospect Reply Drafter + calendar-booking flow
(qualify-first rules, PT windows, Zoom, Meetings writeback). This closes the loop to booked meetings.

## REQUIRED for unattended sending
Live Mode blocks integration writes unless the per-agent toggle "let the agent make integration
writes on its own" is ON. Without it, zero emails send.

## Changelog — 2026-07-06 (Freshworks fail-closed hold, CODE-enforced)
INCIDENT: Luke's standing "hold Freshworks" instruction (since 7/2) existed only as prose in
orchestrator sweep briefs. Unattended Live Mode ticks get no brief, so they sent Freshworks E1s
on 7/3 (6 leads: sarthak.pattanaik, kevin.cheng, carey.spence, denise.gocke, uday.gandhi,
aravind.saba) and again on 7/6 (sharmila.prabhakaran).

FIX (durable, two layers — same philosophy as the 2026-06-23 recipient fix: enforcement in code,
never prose):
1. engine_core.PENDING_HOLD=("freshworks",) + on_pending_hold(); keep_decision now takes
   pending_hold and drops it ABSOLUTE-first (above compliance_hold and hard DNC). New
   keep_decision_for(account_name, tier, is_handraiser) convenience computes EVERY account gate
   from the name — ALWAYS use it at intake so no gate can be forgotten.
2. build_send.py account-hold guard at the send chokepoint: blocks ANY step (E1 or follow-up)
   whose account name OR recipient email domain matches PENDING_HOLD / DNC_HARD /
   COMPLIANCE_HOLD. Follow-ups to leads sequenced before a freeze bypass intake entirely —
   this chokepoint check is what actually stops them (e.g. the 6 breached 7/3 Freshworks leads
   have E2 due ~7/8; this blocks those).

STATUS: PENDING_HOLD is a temporary freeze, NOT a DNC classification. Luke still owes the
actual Freshworks decision (normal / soft-DNC / hard-DNC / compliance-hold). To release:
remove "freshworks" from PENDING_HOLD (and classify accordingly).

## Changelog — 2026-07-08 (Outreach OPT-OUT guard, CODE-enforced, fail-closed)
INCIDENT: a lead who had OPTED OUT in Outreach was still contacted by the Gmail PSU engine and
complained. The Gmail-direct engine never consulted Outreach's opt-out state, so a prospect who
unsubscribed via an Outreach-sent email still received PSU E1s/follow-ups.

FIX (durable — enforcement in code at the send chokepoint, same philosophy as the 2026-06-23
recipient fix and the 2026-07-06 Freshworks fix: never prose):
1. optout.py resolves each recipient's Outreach optedOut flag via the Outreach Connector
   (GET /api/v2/prospects filter[emails]=<email>, checking ALL returned records — duplicates exist).
   Returns opted_out | clear | check_failed and FAILS CLOSED (check_failed = BLOCK) on any
   connector/creds/HTTP/timeout/parse error, so a transient blip never sends blind. Within-tick cache
   /tmp/psu_optout_cache.json (only definitive statuses cached).
2. build_send.py runs the opt-out check for every send that passes the local guards, and emits a
   block_class so the runbook halts ONLY on the systemic/regression class and skips-and-continues on
   opted_out / account_hold / optout_check_failed (one opted-out lead no longer halts the whole tick).
   Because the check shells out to the Outreach Connector, build_send.py now runs under
   RunWithCredentials(skillName="Outreach Connector").
3. RAW-REPLY MODE (build_send.py "raw_body") routes the nudge/bump reply through the SAME chokepoint,
   closing the last bypass (the hand-built "Re: {name}: Airtable" bump that evaded the self-send
   tripwire and the account holds on 7/6-7/7). There is now NO send path that skips build_send.py.
4. engine_core.keep_decision(outreach_opted_out=...) drops a known-opted-out lead at intake too
   (highest precedence), when the status is cheaply known from the opt-out cache. Chokepoint remains
   authoritative.
5. optout_sweep.py provides a retroactive cross-check (last-N-days contacted emails vs Outreach opt-out).

SEMANTICS: opted_out = PERMANENT suppression (Status=opted_out, like Bounced).
optout_check_failed = TRANSIENT (retry next tick, do NOT suppress).

TESTED 2026-07-08: real opted-out prospect (carlh@americanphilanthropic.com) -> BLOCK opted_out, no
params file; contactable prospect -> ALLOW + params; self-send -> BLOCK systemic; Freshworks -> BLOCK
account_hold; raw-reply nudge -> opted-out BLOCK / contactable ALLOW GmailReplyToMessage; no-creds ->
BLOCK optout_check_failed (fail-closed).
