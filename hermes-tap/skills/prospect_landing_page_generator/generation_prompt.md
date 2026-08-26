# Content Generation Guide (Phase 3 LLM Inputs)

Since Phase 3 HTML generation is now executed by `build_landing_page.py` (script-based, ~1 second), the LLM's job is to produce the CONTENT fields that go into the script's input JSON. This file documents exactly what content the LLM must generate and the quality bar for each field.

## What you (the LLM) produce

After Phase 0 (intake), Phase 1 (brand colors), Phase 1.5 (profile pics), and Phase 2 (asset selection) are done, you have all the raw inputs. You then generate these CONTENT fields:

### `headline` (string, 6-10 words)

A tight, prospect-specific headline derived from the Prospect POV + Account POV. The first half of this string renders instantly on the page; only the back half types in (slow back-half typing animation). Quality bar:

- References a SPECIFIC observation from the POVs — never generic
- 6-10 words, punchy
- Good: "Staffing 13K consultants without chaos", "Turn 350 openings into one repeatable system", "Match every engagement to the right consultant"
- Bad: "Transform your business with Airtable", "Better workflows for your team"

### `hero_subhead` (string, 2-3 sentences)

Hero subtitle below the H1. Connects the POVs to a concrete Airtable outcome, ideally referencing the analogous customer story you're including below.

Quality bar:
- 2-3 sentences max, ~50-80 words
- Names what role/situation implies
- References the analogous customer outcome (e.g. "Given how Code & Theory saved 10,000 hours...")
- Connects to a specific number from the Account POV when available (350 restaurants, 13K consultants, $1B portfolio)

### `value_headline` (string, ~6 words)

The H2 of the "What this means for X" section. Specific to the account / use case.

Examples:
- "How Airtable replaces the staffing scaffolding"
- "How Airtable turns 350 launches into a repeatable system"
- "How Airtable powers your operating layer"

### `value_cards` (array of exactly 4 objects)

The 4 cards explaining the value prop for THIS account. Each card has:

```json
{
  "icon": "connect | grid | globe | spreadsheet | star | shield | chart",
  "title": "<3-6 word card title>",
  "body": "<35-65 word card body>"
}
```

**Icon keyword → SVG mapping** (script renders the SVG from the keyword):

- `connect` — nodes connected by lines (good for: matching, coordination, unification)
- `grid` — 4-square grid (good for: standardization, repeatable systems, modularity)
- `globe` — circle with cross (good for: geographies, multi-region, global reach)
- `spreadsheet` — grid + rows (good for: retiring Excel/Smartsheet, source of truth)
- `star` — 5-point star (good for: AI acceleration, transformation, premier outcome)
- `shield` — shield + check (good for: governance, compliance, trust, audit)
- `chart` — bar chart (good for: visibility, dashboards, metrics, reporting)

Quality bar for each card:
- Title: a concrete capability, not a generic benefit. "Match consultants to engagements in real time" not "Better matching."
- Body: 35-65 words. Names HOW Airtable does this for THIS account at THIS scale. Avoid Airtable's generic marketing language.
- All 4 cards cover distinct facets of the value prop (don't repeat the same idea four ways).

### `diagram_label` (string)

The label above the workflow diagram. Names the process, not just "Workflow."

Examples:
- "350-Restaurant Opening Orchestration in Airtable"
- "Engagement Matching Engine in Airtable"
- "Cross-Functional Product Launch Flow"

### `diagram_nodes` (array of 3-6 strings)

The boxes in the workflow diagram, left-to-right. Each is a discrete process step. The script renders them as connected rectangles with arrows.

Examples (Slalom resource matching):
```
["Engagement Intake", "Skill & Practice Matching", "Capacity Forecasting", "Staffing Approval", "Utilization & Insights"]
```

Examples (Chipotle restaurant opening):
```
["Site Selection & Permitting", "Construction & Equipment", "Hiring & Training", "Marketing & Regional Launch", "Grand Opening & Performance Review"]
```

Quality bar:
- 3-6 nodes (5 is the sweet spot)
- Each node 1-3 words
- The nodes describe THIS account's actual process, not generic steps

### For each of the 2 stories (`stories` array, 2 items)

```json
{
  "title": "<short asset name + tagline>",
  "csr": [
    "Challenge: <one sentence describing the problem>",
    "Solution: <one sentence describing what Airtable enabled>",
    "Result: <one sentence with a concrete outcome>"
  ],
  "modal_headline": "<asset name for the modal>",
  "modal_sections": [
    {"label": "Challenge", "body": "<full 1-2 sentence challenge>"},
    {"label": "Solution", "body": "<full 1-2 sentence solution>"},
    {"label": "Result", "body": "<full 1-2 sentence result>"},
    {"label": "Why it matters for <Account>", "body": "<2-3 sentence connection to THIS prospect's situation>"}
  ]
}
```

Quality bar:
- The Challenge/Solution/Result lines on the card are < 25 words each.
- The "Why it matters for <Account>" modal section is the agent's value-add — names the STRUCTURAL parallel between this customer story and the current prospect's situation. Specific, not generic.
- The asset description from Airtable is the source material — paraphrase it tightly, don't dump the raw paragraph.

### `proof_quote` (string, optional)

One short italicized pull-quote that anchors the customer-stories section. Pulled from the strongest story's outcome.

Example: `"Code & Theory saved 10,000 hours per year by replacing manual systems with Airtable — connecting 500+ people across 18 departments on shared engagement data."`

## What the script handles (you don't generate)

- All CSS (theme palette computed from `theme` + `brand_color`)
- HTML structure (nav, hero, sections, footer)
- Logo SVGs (Airtable wordmark, prospect favicon)
- Base64 inlining (favicon, video thumbnails, profile photos)
- Wistia mp4 URL extraction (from the bundle JSON)
- Video element rendering (native HTML5 `<video>`)
- Workflow diagram SVG layout
- Hero photos block (conditional on resolved photos)
- Typing animation JS, shimmer animation CSS

## After you've produced the JSON

Write it to `/tmp/input.json` and run:

```bash
python3 /agent/workspace/skills/prospect_landing_page_generator/build_landing_page.py /tmp/input.json /agent/workspace/landing_page.html
```

Then call `PublishWebpage` on the output. Done.
