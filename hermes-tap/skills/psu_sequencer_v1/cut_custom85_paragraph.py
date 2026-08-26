from __future__ import annotations
"""
Cut the top {custom85} paragraph from all top-10 sequences (Luke 2026-06-17:
"cut the pg at the top, its redundant" — the injected social-proof paragraph
overlaps with the cloned body's "Teams across {account} already use Airtable").

Drops any paragraph whose text is exactly the {custom85} token, then re-emits in
the matrix <div><span> + single <br/> spacer structure so spacing stays consistent.
All other copy is preserved verbatim. Matrix sequences have no custom85 → untouched.
"""
import json, re, html, os

SKILL = os.path.dirname(os.path.abspath(__file__))
FONT = "font-family: Helvetica Neue, Liberation Sans, Arial, sans serif; font-size: 13px"
PARA = '<div><span style="%s">{text}</span></div>' % FONT
SPACER = '<div style="%s"><br /></div>' % FONT

def to_paragraphs(h: str) -> list[str]:
    t = re.sub(r"</(p|div)\s*>", "\n", h, flags=re.I)
    t = re.sub(r"<br\s*/?>", "\n", t, flags=re.I)
    t = re.sub(r"<[^>]+>", "", t)
    return [ln.strip() for ln in html.unescape(t).split("\n") if ln.strip()]

def build_html(paragraphs: list[str]) -> str:
    return SPACER.join(PARA.format(text=p) for p in paragraphs)

def main():
    path = os.path.join(SKILL, "top10_templates.json")
    data = json.load(open(path))
    cut = 0
    for seq, v in data.items():
        if "steps" not in v:
            continue
        for step in v["steps"]:
            paras = to_paragraphs(step["body_html"])
            kept = [p for p in paras if p.strip() != "{custom85}"]
            if len(kept) != len(paras):
                cut += 1
                step["body_html"] = build_html(kept)
    json.dump(data, open(path, "w"), indent=2)
    print(f"Cut {{custom85}} paragraph from {cut} steps\n" + "=" * 60)
    for seq, v in data.items():
        e1 = v["steps"][0]["body_html"]
        n = e1.count("<div><span")
        has85 = "{custom85}" in e1
        print(f"{seq} {v['account']:24} E1 paras={n} custom85_remaining={has85}")

if __name__ == "__main__":
    main()
