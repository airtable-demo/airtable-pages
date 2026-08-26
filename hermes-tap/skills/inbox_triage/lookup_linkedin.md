# LinkedIn Lookup — Agent Prompt Template

When SFDC has no title for a prospect (cold sender or empty `lead.title`), the
agent does a **web search** for the prospect's LinkedIn profile rather than
trying to scrape linkedin.com directly (which is blocked by anti-bot from the
sandbox).

This file is the canonical prompt + workflow the agent runs inline. No
Anthropic API key is embedded — the agent uses its own Hyperagent LLM and the
ExaSearch (or equivalent web-search) tool available on the recipient's account.
Keeps the skill **clone-not-share portable**.

## Tool of choice: ExaSearch with `includeDomains: ["linkedin.com"]`

Verified pattern that returns direct linkedin.com/in/ URLs with structured
profile data (workHistory, location, title) embedded in the result `entities`
field:

```
ExaSearch({
  query: "{Full Name} {Company} {Title (if known)}",
  includeDomains: ["linkedin.com"],
  numResults: 5
})
```

Each result includes:
- `url` — typically `https://linkedin.com/in/<slug>` or
  `https://www.linkedin.com/in/<slug>` (or `/posts/` URLs which contain the
  slug but aren't the profile root)
- `title` — page title (often "Name | LinkedIn")
- `summary` — Exa-generated summary of the profile
- `entities` — structured workHistory with title, company, dates, location

## Workflow the agent runs

For each prospect (sender) needing a LinkedIn lookup:

1. **Inputs available:**
   - `full_name` (or first_name + last_name from SFDC if matched)
   - `company` (from sender email domain or SFDC lead.company)
   - `email_domain` (for disambiguation when name is common)

2. **Call ExaSearch** as above.

3. **Pick the best match** using these rules in order:
   - Skip results whose `url` doesn't contain `/in/` (posts, articles).
   - Among `/in/` results, prefer ones where the page title or `entities[].name`
     matches `full_name` (case-insensitive, allow nickname variations like
     Mike↔Michael, Bob↔Robert, Liz↔Elizabeth).
   - Among name-matching results, prefer the one whose **current** workHistory
     entry (no `to` date OR most recent `from`) has a `company.name` matching
     `company` (case-insensitive substring OK).
   - If multiple still tie, prefer the result whose location matches the
     expected office geography (e.g., "San Francisco" for SF-headquartered
     companies).

4. **Extract fields from the chosen result:**
   - `linkedin_url`: the `/in/<slug>` URL (normalize to
     `https://www.linkedin.com/in/<slug>`, lowercase, trim trailing slash).
   - `title`: the **current** workHistory title (entry with `to: null` or most
     recent `from` date). If only highlight text is available, extract the
     phrase before "at {company}" or after the name (e.g., "CEO, Airtable" →
     `title: "CEO"`).
   - `city` + `state`: parse from `entities[].location` or `workHistory[].location`
     — formats are usually `"City, State, Country"` (US) or
     `"City, Country"` (international). For non-US prospects, put the country
     name in `state`.

5. **Confidence levels:**
   - `high` — name match + current-company match + canonical `/in/<slug>` URL
   - `medium` — name match + company-in-summary OR company match but title
     unclear
   - `low` — name match only, can't verify company; or company match but name
     variant is uncertain
   - `none` — no profile found OR no `/in/<slug>` URL in results

6. **Return ONLY this JSON** (no narrative, no code fence):

```json
{
  "linkedin_url": "https://www.linkedin.com/in/slug",
  "title": "Current Job Title",
  "city": "City",
  "state": "ST",
  "match_confidence": "high"
}
```

If no match:

```json
{
  "linkedin_url": null,
  "title": null,
  "city": null,
  "state": null,
  "match_confidence": "none"
}
```

## Rules

- **Never fabricate URLs.** Only return URLs that came from the actual search
  results. If you can't find a real one, return null.
- **Current title only.** Use the workHistory entry with `to: null` or the
  latest `from` date. Past titles are useless for ATL/BTL classification.
- **Allow nickname variations:** Mike↔Michael, Bob↔Robert, Tom↔Thomas,
  Liz↔Elizabeth, Cathy↔Catherine, Bill↔William, Dick↔Richard, Beth↔Elizabeth,
  Jen/Jenny↔Jennifer.
- **Case-insensitive matching** everywhere.
- **Default to low confidence** when unsure — don't claim high confidence on
  weak signal. Low/none is honest; false high is misleading and pollutes the
  downstream seniority classification.
- **International locations:** put the country name (or appropriate region)
  in the `state` field. Example: `{"city": "London", "state": "United Kingdom"}`.

## Rate / cost considerations

- ExaSearch costs ~$0.01 per lookup. For a typical morning inbox with 20
  prospects (most matched in SFDC), only 2-5 lookups are needed → ~$0.05/day.
- No explicit rate limit needed — Hyperagent's tool call cadence handles it.
- Cache results by `(name, company)` pair in the agent's working memory for
  the duration of the triage run so re-classification doesn't re-search.

## Output handoff

The JSON output feeds directly into `classify_seniority.py`:

```bash
# Take the title from the lookup JSON
title=$(jq -r '.title // empty' linkedin_result.json)
python3 classify_seniority.py --title "$title" --json
```

If `match_confidence` is `none`, skip the seniority classification and apply
`2 ATL Possible` (the review-default label).

## Failure modes

| Symptom | Fix |
|---|---|
| ExaSearch returns 0 results | Try without title in query; try with just "{name} LinkedIn"; if still 0, return `match_confidence: "none"` |
| Multiple profiles with same name | Use email_domain ↔ company disambiguator; pick the one whose current company matches |
| Profile found but no current title parseable | Set `title: null`, `match_confidence: "low"`; let the agent see the snippet for manual judgment |
| Result URL is `/posts/` not `/in/` | Extract the `/in/<slug>` from the path (LinkedIn post URLs contain the author's slug as `/in/<slug>/posts/...`) or run a second search for `"{name}" site:linkedin.com/in` |
| 4xx/5xx from ExaSearch | Surface error and return `match_confidence: "none"` — don't block the rest of the triage |
