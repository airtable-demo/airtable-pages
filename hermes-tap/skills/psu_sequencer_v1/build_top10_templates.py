from __future__ import annotations
"""
Clone the top-10 custom account sequences VERBATIM into the Gmail engine format,
convert Outreach merge tags -> engine fields, normalize cadence to 0/3/6/9 business
days, and insert the per-lead {custom85} injection point into E1 (top-10 only).
Ford (23859) intentionally skipped (parked - Jon Yates territory).
"""
import json, re, os
from collections import defaultdict

ACCOUNT_MAP = {
    "23855": "Adobe", "23856": "Blue Shield of California", "23857": "T-Mobile",
    "23858": "Riot Games", "23860": "Williams-Sonoma", "23861": "Roblox",
    "23862": "Meta", "23863": "Electronic Arts", "23864": "Block",
}
CADENCE_BDAYS = [0, 3, 6, 9, 12, 15]
SRC = "/tmp/top10.json"

def convert(s):
    if not s:
        return s
    s = re.sub(r"\{\{#if account\.custom6\}\}.*?\{\{/if\}\}", "{account}", s, flags=re.S)
    s = s.replace("{{account.custom6}}", "{account}").replace("{{account.name}}", "{account}")
    s = s.replace("{{company}}", "{company}").replace("{{sender.first_name}}", "{sender}")
    s = s.replace("{{first_name}}", "{first_name}")
    return s

def insert_custom85(html):
    """Insert the per-lead injection as its own block right AFTER the greeting line.
    Anchors on the first {first_name} (the greeting) then the next line break, so it
    works regardless of whether the body is <p>-wrapped or <br>-structured."""
    block = "<br><br>{custom85}<br><br>"
    if not html:
        return "<p>{custom85}</p>"
    gi = html.find("{first_name}")
    start = gi if gi != -1 else 0
    m = re.search(r"</p>|<br\s*/?>", html[start:], flags=re.I)
    if m:
        i = start + m.end()
        return html[:i] + block + html[i:]
    return html + block

def main():
    d = json.loads(open(SRC).read())
    b = d.get("body", d)
    data = b.get("data", [])
    inc = b.get("included", [])
    templates = {x["id"]: x for x in inc if x["type"] == "template"}
    steps = {x["id"]: x for x in inc if x["type"] == "sequenceStep"}
    g = defaultdict(lambda: defaultdict(list))
    for st in data:
        rel = st.get("relationships", {})
        tid = (rel.get("template", {}).get("data") or {}).get("id")
        sid = (rel.get("sequenceStep", {}).get("data") or {}).get("id")
        step = steps.get(sid, {})
        seq = (step.get("relationships", {}).get("sequence", {}).get("data") or {}).get("id")
        order = step.get("attributes", {}).get("order")
        tpl = templates.get(tid, {})
        g[str(seq)][order].append({
            "tid": tid,
            "is_reply": bool(st.get("attributes", {}).get("isReply")),
            "subject": convert(tpl.get("attributes", {}).get("subject")),
            "body_html": convert(tpl.get("attributes", {}).get("bodyHtml") or tpl.get("attributes", {}).get("body")),
        })

    out = {}
    for seq, account in ACCOUNT_MAP.items():
        if seq not in g:
            out[seq] = {"account": account, "error": "not found"}
            continue
        orders = sorted(g[seq].keys(), key=lambda o: (o is None, o))
        steps_out = []
        for i, order in enumerate(orders):
            v = sorted(g[seq][order], key=lambda x: x["tid"])[0]
            body = v["body_html"]
            if i == 0:  # E1 gets the per-lead injection point
                body = insert_custom85(body)
            steps_out.append({
                "step": f"E{i+1}",
                "wait_business_days": CADENCE_BDAYS[i] if i < len(CADENCE_BDAYS) else CADENCE_BDAYS[-1],
                "is_reply": v["is_reply"] if i > 0 else False,
                "subject": "" if (i > 0 and v["is_reply"]) else v["subject"],
                "body_html": body,
            })
        steps_out = steps_out[:4]  # standardize to 4 emails
        out[seq] = {"account": account, "n_emails": len(steps_out), "has_custom85": True, "steps": steps_out}

    with open("/agent/workspace/skills/psu_sequencer/top10_templates.json", "w") as f:
        json.dump(out, f, indent=2)
    print("top10_templates.json written\n" + "=" * 60)
    for seq, v in out.items():
        if "error" in v:
            print(f"{seq} {v['account']}: {v['error']}"); continue
        has85 = "{custom85}" in v["steps"][0]["body_html"]
        print(f"{seq} {v['account']:26} {v['n_emails']} emails | E1 custom85 inserted: {has85} | "
              f"subjects: {[s['subject'][:22] or '(reply)' for s in v['steps']]}")

if __name__ == "__main__":
    main()
