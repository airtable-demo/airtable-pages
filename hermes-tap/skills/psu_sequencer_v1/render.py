from __future__ import annotations
"""
Render a sequence step into a final email for a specific lead.
Fills engine merge fields: {first_name} {account} {company} {sender} {custom85}.
Sender is the AE first name (Luke). Used by the Gmail-direct send engine.
"""
import re, html, json, os

SKILL_DIR = os.path.dirname(os.path.abspath(__file__))

NBSP = chr(0xa0)  # non-breaking space used in templates

_JUNK_NAME_RE = re.compile(r"^[^A-Za-z]*$")          # "-", ".", "123", "" etc.
_EMAILISH_RE = re.compile(r"[@]")                     # an email pasted into the name field

def _dedupe_name_tokens(f: str) -> str:
    """Collapse consecutive repeated name tokens (the 7/17 'Gopi Krishna Krishna Krishna'
    render defect) and drop a trailing truncated fragment that is a prefix of the prior
    token (e.g. 'Krishna Kri' -> 'Krishna'). Case-insensitive comparison."""
    toks = f.split()
    out = []
    for t in toks:
        if out and t.lower() == out[-1].lower():
            continue
        out.append(t)
    if len(out) >= 2 and len(out[-1]) >= 2 and out[-2].lower().startswith(out[-1].lower()) \
            and len(out[-1]) < len(out[-2]):
        out.pop()
    return " ".join(out)

def _clean_first_name(first: str) -> str:
    """Treat junk first names as blank so copy renders 'Hi,' not 'Hi -,'.
    Junk = no alphabetic chars, single char, an email address, or placeholder words."""
    f = (first or "").strip()
    if (not f or len(f) < 2 or _JUNK_NAME_RE.match(f) or _EMAILISH_RE.search(f)
            or f.lower() in {"test", "unknown", "n/a", "na", "none", "null", "user", "admin"}):
        return ""
    return _dedupe_name_tokens(f)

def fill(text, ctx):
    if not text:
        return text
    first = _clean_first_name(ctx.get("first_name") or "")
    ctx = dict(ctx)
    ctx["first_name"] = first  # normalized value feeds the merge loop below
    if not first:
        # No first name: collapse the name merge field so copy reads naturally.
        # Luke's rule: "just say Hi, if there is no name" (never "Hi, there!").
        # Subject:  "{first_name}: Airtable" -> "Airtable"
        text = text.replace("{first_name}: ", "").replace("{first_name}:", "")
        # CTA:  "next week, {first_name}?" -> "next week?"  (also . , !)
        text = re.sub(r",\s*\{first_name\}\s*([?.,!])", r"\1", text)
        # Greeting:  "Hi[,] <sp/nbsp> {first_name}[,]" -> "Hi,"
        text = re.sub(r"Hi,?(?:\s|&nbsp;|" + NBSP + r")\{first_name\},?", "Hi,", text)
        # Any leftover bare token -> empty
        text = text.replace("{first_name}", "")
    for k, v in ctx.items():
        text = text.replace("{" + k + "}", v if v is not None else "")
    # Hard rule from Luke (2026-06-18): never use exclamation marks.
    text = text.replace("!", "")
    return text

def render_step(step, ctx):
    return {
        "step": step["step"],
        "is_reply": step["is_reply"],
        "wait_business_days": step["wait_business_days"],
        "subject": fill(step.get("subject", ""), ctx),
        "body_html": fill(step.get("body_html", ""), ctx),
    }

def to_text(h):
    if not h: return ""
    t = re.sub(r"<br\s*/?>", "\n", h, flags=re.I)
    t = re.sub(r"</p>", "\n\n", t, flags=re.I)
    t = re.sub(r"<[^>]+>", "", t)
    return re.sub(r"\n{3,}", "\n\n", html.unescape(t)).strip()


if __name__ == "__main__":
    import engine_core as E
    import injection as INJ

    matrix = json.load(open(os.path.join(SKILL_DIR, "matrix_templates.json")))
    top10 = json.load(open(os.path.join(SKILL_DIR, "top10_templates.json")))
    # account substring -> top10 sequence id
    top10_map = {v["account"].lower(): seq for seq, v in top10.items()}
    top10_map.update({"blue shield": "23856", "t-mobile": "23857", "riot": "23858",
                      "williams-sonoma": "23860", "electronic arts": "23863"})

    SENDER = "Luke"
    # title, is_ent_user, account_stage, account, account_teams
    leads = [
        ("Jordan Lee",  "Marketing Manager",      False, "5. ENT Customer", "Meta",        ["Product", "Brand"]),
        ("Sam Rivera",  "Staff Software Engineer", True,  "5. ENT Customer", "T-Mobile",    ["Network Ops"]),
        ("Alex Chen",   "Data Analyst",            False, "3. PQA",          "Notion Labs", []),   # matrix B (non-top10)
        ("Pat Morgan",  "VP Product",              True,  "5. ENT Customer", "Datadog",     []),   # matrix ATL 21794
    ]

    for name, title, eu, stage, account, teams in leads:
        first = name.split()[0]
        c = E.classify(title, eu, stage)
        bucket, seq = E.route(c["tier"], c["ent_user"], c["ent_acct"], account, {k: v for k, v in top10_map.items()})
        if bucket.startswith("top10"):
            tpl = top10[seq]; src = "TOP-10"
            custom85 = INJ.build_custom85(title, account, c["ent_user"], c["ent_acct"], teams)
        else:
            tpl = matrix[seq]; src = "MATRIX"
            custom85 = ""
        ctx = {"first_name": first, "account": account, "company": account, "sender": SENDER, "custom85": custom85}
        e1 = render_step(tpl["steps"][0], ctx)
        print("\n" + "=" * 74)
        print(f"{name} | {title} | {account} | {c['tier']} eu={int(eu)} ea={int(c['ent_acct'])}")
        print(f"-> {src} seq {seq} ({tpl.get('account','matrix')}), {tpl['n_emails']} emails, dnc={E.dnc_status(account)}")
        print(f"\nSUBJECT: {e1['subject']}")
        print(to_text(e1["body_html"]))
