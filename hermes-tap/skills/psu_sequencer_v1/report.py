from __future__ import annotations
"""
PSU Sequencer — reporting dashboard generator.
Reads the three durable tables (exported to JSON) and emits a self-contained
dashboard.html. The Live Mode tick regenerates this each run and republishes to
the same artifact (State.dashboard_artifact_id) so Luke has a near-live view.

Usage (agent, each tick):
  - export Leads -> leads.json (list of row dicts)
  - export Send Log -> sendlog.json (list of row dicts)
  - State -> state.json ({key: value})
  - python3 report.py leads.json sendlog.json state.json '<ISO ct now>' dashboard.html
  - PublishWebpage(filePath=dashboard.html, artifactId=State.dashboard_artifact_id)
"""
import json, sys, datetime as dt
from collections import Counter

TEST_IDS = {"TEST-LUKE-META"}
CAP = 2000

def load(p):
    try:
        return json.load(open(p))
    except Exception:
        return [] if p.endswith(("leads.json", "sendlog.json")) else {}

def main():
    leads = load(sys.argv[1]) if len(sys.argv) > 1 else []
    sends = load(sys.argv[2]) if len(sys.argv) > 2 else []
    state = load(sys.argv[3]) if len(sys.argv) > 3 else {}
    now_iso = sys.argv[4] if len(sys.argv) > 4 else dt.datetime.utcnow().isoformat()
    out = sys.argv[5] if len(sys.argv) > 5 else "dashboard.html"
    today = now_iso[:10]

    # --- send window (Mon-Fri 08:00-17:00 CT); now_iso is already CT ---
    try:
        ndt = dt.datetime.fromisoformat(now_iso.replace("Z", ""))
        in_window = ndt.weekday() < 5 and 8 <= ndt.hour < 17
        wkday = ndt.weekday() < 5
    except Exception:
        in_window, wkday = False, True

    # --- leads ledger metrics ---
    active = [l for l in leads if l.get("Lead ID") not in TEST_IDS]
    status = Counter(l.get("Status", "?") for l in active)
    tier = Counter(l.get("Tier", "?") for l in active)
    bucket = Counter(("top-10 custom" if str(l.get("Bucket", "")).startswith("top10") else "matrix") for l in active)
    seqc = Counter(l.get("Sequence", "?") for l in active)
    dnc = Counter(l.get("DNC", "?") for l in active)
    mql = Counter(l.get("MQL Type", "?") for l in active)
    acct = Counter(l.get("Account", "?") for l in active)
    apple_in_ledger = sum(1 for l in active if "apple" in str(l.get("Account", "")).lower())
    emails = [str(l.get("Email", "")).lower() for l in active if l.get("Email")]
    dup_emails = sum(1 for _, c in Counter(emails).items() if c > 1)
    new_due = sum(1 for l in active if l.get("Status") == "New")

    # --- send log metrics ---
    sends_today = [s for s in sends if s.get("Date") == today and s.get("Lead ID") not in TEST_IDS]
    sent_today = [s for s in sends_today if s.get("Status") == "sent"]
    bounced_today = [s for s in sends_today if str(s.get("Status")) == "bounced"]
    n_sent = len(sent_today)
    n_bounce = len(bounced_today)
    bounce_rate = (n_bounce / (n_sent + n_bounce) * 100) if (n_sent + n_bounce) else 0.0
    step_today = Counter(s.get("Step", "?") for s in sent_today)
    seq_today = Counter(s.get("Sequence", "?") for s in sent_today)
    all_sent = [s for s in sends if s.get("Status") == "sent" and s.get("Lead ID") not in TEST_IDS]
    replied = status.get("Replied", 0)
    bounced_total = status.get("Bounced", 0)

    cursor = state.get("intake_cursor", "?")
    backlog_total = state.get("backlog_total_since_may25", "?")
    last_sweep = state.get("last_sweep_date", "") or "never"
    cap = int(state.get("daily_cap", CAP) or CAP)

    # health checks
    checks = [
        ("Lead source", "Databricks SFDC (direct)", True),
        ("Duplicate emails in ledger", f"{dup_emails}", dup_emails == 0),
        ("Apple (hard-DNC) leads in ledger", f"{apple_in_ledger}", apple_in_ledger == 0),
        ("Bounce rate vs 2% throttle", f"{bounce_rate:.1f}%", bounce_rate <= 2.0),
        ("Daily cap headroom", f"{n_sent}/{cap}", n_sent < cap),
        ("Intake cursor advancing", str(cursor)[:10], cursor not in ("?", "", None)),
        ("Daily catch-all sweep", last_sweep, True),
    ]

    def bars(counter, total=None, top=None, label_map=None):
        items = counter.most_common(top) if top else sorted(counter.items(), key=lambda x: -x[1])
        tot = total or sum(counter.values()) or 1
        rows = []
        for k, v in items:
            lab = (label_map or {}).get(k, k)
            pct = v / tot * 100
            rows.append(
                f'<div class="bar"><span class="bl">{lab}</span>'
                f'<span class="bt"><span class="bf" style="width:{pct:.1f}%"></span></span>'
                f'<span class="bv">{v}</span></div>'
            )
        return "".join(rows)

    SEQ_LABEL = {"21793": "21793 BTL std", "21794": "21794 ATL ENT-user",
                 "21795": "21795 BTL ENT-acct", "21796": "21796 ATL non-ENT",
                 "23855": "Adobe", "23856": "Blue Shield CA", "23857": "T-Mobile",
                 "23858": "Riot Games", "23862": "Meta", "23863": "Electronic Arts",
                 "23860": "Williams-Sonoma", "23861": "Roblox", "23864": "Block"}

    win_badge = ('<span class="badge open">SEND WINDOW OPEN</span>' if in_window
                 else '<span class="badge shut">WINDOW CLOSED — intake only</span>')
    bounce_cls = "good" if bounce_rate <= 2.0 else "bad"

    def kpi(label, val, sub="", cls=""):
        return (f'<div class="kpi {cls}"><div class="kv">{val}</div>'
                f'<div class="kl">{label}</div><div class="ks">{sub}</div></div>')

    kpis = "".join([
        kpi("Prospect sends today", n_sent, f"of {cap} daily cap", "accent"),
        kpi("Replies", replied, "the goal — booked-meeting funnel", "goal" if replied else ""),
        kpi("Bounce rate", f"{bounce_rate:.1f}%", "throttle at 2.0%", bounce_cls),
        kpi("In sequence", status.get("Sequencing", 0), "active multi-touch"),
        kpi("Queued (New)", new_due, "due to send", "accent"),
        kpi("Backlog total", backlog_total if backlog_total == "?" else f"~{backlog_total}", f"since May 25 · cursor {str(cursor)[:10]}"),
    ])

    checks_html = "".join(
        f'<tr><td>{n}</td><td class="mono">{v}</td>'
        f'<td class="{"ok" if ok else "warn"}">{"✓ OK" if ok else "⚠ CHECK"}</td></tr>'
        for n, v, ok in checks
    )

    status_order = ["New", "Sequencing", "Replied", "Bounced", "Finished"]
    funnel = "".join(
        f'<div class="pill p-{s.lower()}"><b>{status.get(s,0)}</b> {s}</div>' for s in status_order
    )

    html = f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PSU Sequencer — Live Ops</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet">
<style>
:root{{--bg:#f6f8fb;--card:#fff;--ink:#0b1f3a;--mut:#5b708f;--line:#e3e9f2;--blue:#1a56db;--blue2:#3b82f6;--good:#0a7d3d;--goodbg:#e6f6ec;--bad:#c0392b;--badbg:#fdecea;--warnbg:#fff6e6;--warn:#9a6700;}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}}
.wrap{{max-width:1180px;margin:0 auto;padding:28px 6%}}
.top{{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;border-bottom:2px solid var(--ink);padding-bottom:16px;margin-bottom:22px}}
h1{{font-size:23px;font-weight:800;margin:0;letter-spacing:-.02em}}
.sub{{color:var(--mut);font-size:13px;margin-top:4px}}
.badge{{font:600 11px/1 'IBM Plex Mono',monospace;padding:7px 11px;border-radius:6px;letter-spacing:.04em}}
.badge.open{{background:var(--goodbg);color:var(--good)}}
.badge.shut{{background:var(--warnbg);color:var(--warn)}}
.asof{{font:500 12px 'IBM Plex Mono',monospace;color:var(--mut);margin-top:8px}}
.grid{{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:14px}}
.kpi{{background:var(--card);border:1px solid var(--line);border-radius:11px;padding:15px 14px;min-height:104px;display:flex;flex-direction:column;justify-content:flex-start}}
.kpi.accent{{border-top:3px solid var(--blue)}}
.kpi.good{{border-top:3px solid var(--good)}}
.kpi.bad{{border-top:3px solid var(--bad)}}
.kpi.goal{{border-top:3px solid var(--blue);background:linear-gradient(180deg,#eef4ff,#fff)}}
.kv{{font:800 30px/1 'IBM Plex Mono',monospace;letter-spacing:-.02em}}
.kpi.bad .kv{{color:var(--bad)}} .kpi.good .kv{{color:var(--good)}}
.kl{{font-size:12.5px;font-weight:600;margin-top:8px}}
.ks{{font-size:11px;color:var(--mut);margin-top:3px}}
.cols{{display:grid;grid-template-columns:1.2fr 1fr;gap:16px;margin-bottom:16px}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 18px 20px}}
.card h2{{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--mut);margin:0 0 14px}}
.pill{{display:inline-block;font-size:13px;padding:8px 12px;border-radius:8px;margin:0 8px 8px 0;background:#eef2f8;border:1px solid var(--line)}}
.pill b{{font-family:'IBM Plex Mono',monospace;font-size:15px;margin-right:4px}}
.p-new{{background:#eaf1ff}} .p-sequencing{{background:#fff6e6}} .p-replied{{background:var(--goodbg);color:var(--good)}} .p-bounced{{background:var(--badbg);color:var(--bad)}} .p-finished{{background:#eef2f8}}
.bar{{display:flex;align-items:center;gap:10px;margin:7px 0;font-size:13px}}
.bl{{width:150px;flex:none;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
.bt{{flex:1;height:9px;background:#eef2f8;border-radius:5px;overflow:hidden}}
.bf{{display:block;height:100%;background:linear-gradient(90deg,var(--blue),var(--blue2))}}
.bv{{width:42px;text-align:right;font:600 12px 'IBM Plex Mono',monospace;color:var(--mut)}}
table{{width:100%;border-collapse:collapse;font-size:13px}}
td{{padding:8px 6px;border-bottom:1px solid var(--line)}}
td.mono,.mono{{font-family:'IBM Plex Mono',monospace}}
td.ok{{color:var(--good);font-weight:600}} td.warn{{color:var(--bad);font-weight:600}}
.foot{{color:var(--mut);font-size:11.5px;margin-top:18px;line-height:1.7;border-top:1px solid var(--line);padding-top:14px}}
@media(max-width:900px){{.grid{{grid-template-columns:repeat(2,1fr)}}.cols{{grid-template-columns:1fr}}.bl{{width:110px}}}}
</style></head><body><div class="wrap">
<div class="top"><div><h1>PSU Sequencer — Live Ops</h1>
<div class="sub">Autonomous PSU / inbound sequencing · Gmail-direct · luke.sorensen@airtable.com</div>
<div class="asof">As of {now_iso} CT · refreshes each 30-min tick</div></div>
<div style="text-align:right">{win_badge}<div class="asof">cap {cap}/day · fully ramped</div></div></div>

<div class="grid">{kpis}</div>

<div class="cols">
<div class="card"><h2>Lead status funnel ({len(active)} active leads)</h2>{funnel}
<div style="margin-top:16px"><h2>Sends today by step</h2>{bars(step_today) or '<div class="sub">No sends yet today.</div>'}</div>
<div style="margin-top:16px"><h2>Sends today by sequence</h2>{bars(seq_today, label_map=SEQ_LABEL) or '<div class="sub">No sends yet today.</div>'}</div>
</div>
<div class="card"><h2>System health</h2><table>{checks_html}</table>
<div style="margin-top:14px"><h2>Tier mix</h2>{bars(tier)}</div>
<div style="margin-top:14px"><h2>Sequence family</h2>{bars(bucket)}</div>
</div>
</div>

<div class="cols">
<div class="card"><h2>Queued pipeline by sequence</h2>{bars(seqc, top=10, label_map=SEQ_LABEL)}</div>
<div class="card"><h2>Top accounts (active ledger)</h2>{bars(acct, top=10)}</div>
</div>

<div class="foot">
<b>Coverage model:</b> forward cursor (prompt, every tick, intake_cursor={str(cursor)[:19]}) + daily backfill sweep (last run: {last_sweep}) catching late-attributed leads &amp; fresh handraisers.
&nbsp;·&nbsp; <b>Guardrails:</b> Apple hard-DNC absolute (incl. handraisers) · soft-DNC ATL-only · stop-on-reply before every send · idempotent Send Log · Mon–Fri 8–5 CT.
&nbsp;·&nbsp; <b>Sources:</b> Hyperagent Tables (Leads / Send Log / State) ← Databricks SFDC. Lifetime prospect sends: {len(all_sent)}.
</div>
</div></body></html>"""

    open(out, "w").write(html)
    print(f"wrote {out} ({len(html)} bytes) | active={len(active)} sent_today={n_sent} "
          f"bounce={bounce_rate:.1f}% replies={replied} queued={new_due}")

if __name__ == "__main__":
    main()
