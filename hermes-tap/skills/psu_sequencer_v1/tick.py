from __future__ import annotations
"""Live-test tick: render E1+E2 for one test lead (Luke @ Meta) and emit JSON
so we can send it via Gmail and prove the end-to-end path + threading."""
import json, os
import engine_core as E
import injection as INJ
import render as R

SKILL = os.path.dirname(os.path.abspath(__file__))
matrix = json.load(open(os.path.join(SKILL, "matrix_templates.json")))
top10 = json.load(open(os.path.join(SKILL, "top10_templates.json")))
# Canonical routing: short account substrings -> source seq id (matches route()'s
# substring match, so subsidiaries like "Cisco Systems GmbH" route correctly).
# Ford (23859) deliberately excluded — PARKED, Jon Yates territory.
top10_map = json.load(open(os.path.join(SKILL, "top10_routing.json")))

# TEST LEAD = Luke himself (safe recipient), Meta non-ENT-user to fire the injection
lead = dict(name="Luke Sorensen", email="luke.sorensen@airtable.com",
            title="Marketing Manager", ent_user=False, stage="5. ENT Customer",
            account="Meta", teams=["Product", "Brand"], sender="Luke")

c = E.classify(lead["title"], lead["ent_user"], lead["stage"])
bucket, seq = E.route(c["tier"], c["ent_user"], c["ent_acct"], lead["account"], top10_map)
tpl = top10[seq] if bucket.startswith("top10") else matrix[seq]
custom85 = INJ.build_custom85(lead["title"], lead["account"], c["ent_user"], c["ent_acct"], lead["teams"]) if bucket.startswith("top10") else ""
ctx = {"first_name": lead["name"].split()[0], "account": lead["account"],
       "company": lead["account"], "sender": lead["sender"], "custom85": custom85}

e1 = R.render_step(tpl["steps"][0], ctx)
e2 = R.render_step(tpl["steps"][1], ctx) if len(tpl["steps"]) > 1 else None

out = {"to": lead["email"], "route": f"{bucket}/{seq} ({tpl.get('account','matrix')})",
       "tier": c["tier"], "ent_user": c["ent_user"], "dnc": E.dnc_status(lead["account"]),
       "e1": {"subject": e1["subject"], "html": e1["body_html"]},
       "e2": {"is_reply": e2["is_reply"], "subject": e2["subject"], "html": e2["body_html"]} if e2 else None}
print(json.dumps(out, indent=2))
