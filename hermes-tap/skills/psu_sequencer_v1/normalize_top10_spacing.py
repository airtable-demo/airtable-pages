from __future__ import annotations
"""
Fix top10 email spacing: the cloned top10 templates used bare <p> tags + empty
<p><br></p> spacers (plus a stray <br/><br><br> before {custom85} on Adobe/T-Mobile),
which compounded with <p> browser margins into oversized paragraph gaps.

This normalizes EVERY top10 step to the SAME structure the proven matrix templates
use (single <div><br/></div> spacer between <div><span> paragraphs), so top10 emails
render with identical, clean single-line spacing. Text content is preserved verbatim —
only the HTML wrapper changes. {custom85} becomes its own paragraph.
"""
import json, re, html, os

SKILL = os.path.dirname(os.path.abspath(__file__))
FONT = "font-family: Helvetica Neue, Liberation Sans, Arial, sans serif; font-size: 13px"
PARA = '<div><span style="%s">{text}</span></div>' % FONT
SPACER = '<div style="%s"><br /></div>' % FONT

def to_paragraphs(h: str) -> list[str]:
    """Extract ordered, non-empty text paragraphs from messy block HTML.
    Treats every <p>/<div> close and every <br> as a line boundary, strips tags,
    drops blank lines. {custom85}/{merge} tokens are preserved as text."""
    t = h
    t = re.sub(r"</(p|div)\s*>", "\n", t, flags=re.I)   # block close -> newline
    t = re.sub(r"<br\s*/?>", "\n", t, flags=re.I)        # <br> -> newline
    t = re.sub(r"<[^>]+>", "", t)                         # strip remaining tags
    t = html.unescape(t)
    return [ln.strip() for ln in t.split("\n") if ln.strip()]

def build_html(paragraphs: list[str]) -> str:
    blocks = [PARA.format(text=p) for p in paragraphs]
    return SPACER.join(blocks)   # single spacer between paragraphs, no trailing

def main():
    path = os.path.join(SKILL, "top10_templates.json")
    data = json.load(open(path))
    for seq, v in data.items():
        if "steps" not in v:
            continue
        for step in v["steps"]:
            paras = to_paragraphs(step["body_html"])
            step["body_html"] = build_html(paras)
    json.dump(data, open(path, "w"), indent=2)

    # Report
    print("top10_templates.json re-spaced (matrix-consistent)\n" + "=" * 60)
    for seq, v in data.items():
        if "steps" not in v:
            continue
        e1 = v["steps"][0]["body_html"]
        n_para = e1.count("<div><span")
        has85 = "{custom85}" in e1
        print(f"{seq} {v['account']:24} E1 paras={n_para} custom85={has85}")

if __name__ == "__main__":
    main()
