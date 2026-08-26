# Asset Selection Prompt

This is the verbatim prompt the agent uses when selecting 2 demo videos + 2 customer stories from the Airtable assets base, given the prospect/account context.

---

You are selecting marketing assets to embed in a prospect landing page and to cite as proof points in outbound emails. You will choose:
- Exactly 2 demo videos (Type = "Video")
- Exactly 2 customer stories (Type = "Customer story")

You will be given:
- ${assets_json}: every row from the Assets table (Asset name, Type, URL, Industries, Personas, Use cases, Description)
- ${prospect_pov}: the prospect's POV (their role, observed signals, why this person matters)
- ${account_pov}: the account's POV (their situation, expansion plans, observed signals, industry)
- ${account_name}: the company name
- ${prospect_title}: the prospect's title (may be empty)
- ${pov_function}: the POV's primary business function, when the caller already derived it (e.g. from the Databricks enrichment's function_lob). May be empty — if so, derive it in Step 0.

## Step 0 — Determine the POV's primary function (do this FIRST, before ranking anything)

Every asset is really about ONE business function, and so is every POV. A demo or story from the WRONG function is the single worst failure mode here (e.g. a marketing-campaign demo shown on a product-operations POV). Lock the function before you rank anything.

1. If ${pov_function} is provided, use it as the target function.
2. Otherwise read the prospect POV + account POV + prospect title and classify the target into exactly ONE primary bucket (mirrors the Databricks function_lob taxonomy):
   - Product & Design (roadmap, launches, product operations, design ops)
   - Marketing & Communications (campaigns, content, brand, creative ops, demand gen, events)
   - Sales & Account Management (pipeline, account/territory planning, deal desk, revops)
   - Software Development / Engineering (eng programs, dev workflows, release management)
   - Operations / Business Operations (program/PMO, capital projects, supply chain, vendor mgmt)
   - Finance / FP&A
   - Human Resources / People
   - IT & Support
   - Customer Service / Success
   - Legal / Compliance
3. State the target function explicitly. You will check every chosen asset against it.

For each asset, infer its function the same way from its Use cases + Personas + Description.

## Selection rules

1. Read every asset's name, description, industries, personas, use cases — and infer its function (Step 0 method).
2. **FUNCTION MATCH IS A HARD GATE for demo videos.** A demo video whose function differs from the target function is INELIGIBLE — do not select it. Only if ZERO same-function demo videos exist may you fall back to the closest adjacent-function video, and then you MUST say so in its rationale and set `"function_match": false`. Never silently ship a cross-function demo (a marketing demo on a product POV is the exact failure this rule exists to stop).
3. **FUNCTION MATCH IS A STRONG REQUIREMENT for customer stories.** Prefer same-function stories. A cross-function story is acceptable only when no same-function story exists AND it is a strong industry/scale analog; flag it the same way (`"function_match": false` with an explicit rationale).
4. Among the function-eligible assets, then rank by:
   - Same industry / vertical as the account
   - Same persona / role as the prospect title
   - Use cases that align with the specific outcomes in the POVs
   - Companies of similar scale or vertical to ${account_name}
   - A concrete, named, measurable outcome over a vague one
5. Avoid:
   - Assets with an empty URL or Description
   - Two videos covering identical use cases (diversify across the value prop, but stay in-function)
   - Two stories about identical industries (diversify if possible)
6. If fewer than 2 in-function videos or stories exist, choose the closest available, flag each fallback (`"function_match": false`), and note the gap in the AE-facing summary — never pad with a confidently-wrong cross-function pick.

## Output format
Return JSON ONLY, no prose:

```json
{
  "target_function": "Product & Design",
  "videos": [
    {
      "record_id": "rec...",
      "name": "...",
      "url": "...",
      "description": "...",
      "asset_function": "Product & Design",
      "function_match": true,
      "rationale": "one sentence on why this fits, naming the function alignment"
    },
    {"...": "..."}
  ],
  "stories": [
    {
      "record_id": "rec...",
      "name": "...",
      "description": "...",
      "asset_function": "Product & Design",
      "function_match": true,
      "rationale": "one sentence on why this fits, naming the function alignment"
    },
    {"...": "..."}
  ],
  "function_check": "Target function is Product & Design. video1=Product (match), video2=Product (match), story1=Product (match), story2=Operations (FALLBACK, no in-function story existed). No cross-function demo videos."
}
```

## Mandatory self-audit (before returning)
Restate the target function, then for EACH chosen asset state its inferred function and whether it matches. If any demo video is `function_match=false` while a same-function demo existed in the pool, you made an error — re-pick. The `function_check` string must reflect this audit. After producing this JSON, the caller runs `validate_asset_selection.py --strict` on it; a cross-function demo video fails that check and the selection is redone.
