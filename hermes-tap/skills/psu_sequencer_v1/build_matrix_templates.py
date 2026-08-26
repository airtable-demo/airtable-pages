from __future__ import annotations
"""
Clone the 4 matrix PSU sequences (21793-21796) VERBATIM from the Outreach fetch
into the Gmail engine template format. Only transforms applied:
  - Outreach merge tags -> engine merge fields ({first_name},{account},{company},{sender})
  - wait intervals normalized to 0/3/6/9 business days (Luke-approved cadence)
Copy/threading/subjects preserved exactly (control-variables: replicate last quarter).
"""
import json, re, os, glob

FILES = ["/tmp/seq21793.json", "/tmp/matrix2.json"]
CADENCE_BDAYS = [0, 3, 6, 9, 12, 15]  # supports up to 6 steps; matrix is 4 (21795 is 6 -> flagged)

# strongest E1 pick when a step has multiple variants (by judgment; swappable).
# value = case-insensitive substring that uniquely identifies the chosen variant body.
CHOSEN_E1 = {
    "21793": "brings together workflows like intake",   # variant A: concise, clear qualifier+CTA
    "21794": "brings together workflows like intake",   # concise variant (non AI-pitch)
}

def convert(s):
    if not s:
        return s
    # account friendly-name conditional -> {account}
    s = re.sub(r"\{\{#if account\.custom6\}\}.*?\{\{/if\}\}", "{account}", s, flags=re.S)
    s = s.replace("{{account.custom6}}", "{account}").replace("{{account.name}}", "{account}")
    s = s.replace("{{company}}", "{company}")
    s = s.replace("{{sender.first_name}}", "{sender}")
    s = s.replace("{{first_name}}", "{first_name}")
    return s

def load():
    data, inc = [], []
    for f in FILES:
        if not os.path.exists(f):
            continue
        d = json.loads(open(f).read())
        b = d.get("body", d)
        data += b.get("data", [])
        inc += b.get("included", [])
    return data, inc

def main():
    data, inc = load()
    templates = {x["id"]: x for x in inc if x["type"] == "template"}
    steps = {x["id"]: x for x in inc if x["type"] == "sequenceStep"}
    from collections import defaultdict
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
    for seq in ["21793", "21794", "21795", "21796"]:
        if seq not in g:
            out[seq] = {"error": "not found in fetch"}
            continue
        orders = sorted(g[seq].keys(), key=lambda o: (o is None, o))
        steps_out, extra_variants = [], {}
        for i, order in enumerate(orders):
            variants = sorted(g[seq][order], key=lambda v: v["tid"])
            chosen = variants[0]
            if order == 1 and len(variants) > 1 and seq in CHOSEN_E1:
                key = CHOSEN_E1[seq].lower()
                match = [v for v in variants if v["body_html"] and key in v["body_html"].lower()]
                if match:
                    chosen = match[0]
                extra_variants["E1_other"] = [v["subject"] for v in variants if v["tid"] != chosen["tid"]]
            steps_out.append({
                "step": f"E{i+1}",
                "wait_business_days": CADENCE_BDAYS[i] if i < len(CADENCE_BDAYS) else CADENCE_BDAYS[-1],
                "is_reply": chosen["is_reply"] if i > 0 else False,
                "subject": chosen["subject"] if not (i > 0 and chosen["is_reply"]) else "",
                "body_html": chosen["body_html"],
            })
        if seq == "21795":
            steps_out = steps_out[:4]  # Luke 2026-06-17: 6-email seq, cut last 2 -> keep first 4
        out[seq] = {"n_emails": len(steps_out), "steps": steps_out, "_e1_variants_held": extra_variants}

    with open("/agent/workspace/skills/psu_sequencer/matrix_templates.json", "w") as f:
        json.dump(out, f, indent=2)

    print("matrix_templates.json written\n" + "=" * 60)
    for seq, v in out.items():
        if "error" in v:
            print(f"{seq}: {v['error']}"); continue
        print(f"\nSEQ {seq}: {v['n_emails']} emails, cadence bdays={[s['wait_business_days'] for s in v['steps']]}")
        for s in v["steps"]:
            subj = s["subject"] if s["subject"] else "(reply - no subject)"
            print(f"   {s['step']}: reply={s['is_reply']} | {subj[:60]}")
        if v["_e1_variants_held"].get("E1_other"):
            print(f"   E1 variants held (not used): {v['_e1_variants_held']['E1_other']}")

if __name__ == "__main__":
    main()
