# Interest Classification — Agent Prompt Template

The interest classification step is LLM-driven (the agent reads the prospect's
reply body and assigns one of three buckets). This file is the canonical prompt
template the agent uses inline — no Anthropic API key is embedded in scripts.

This pattern keeps the skill **clone-not-share portable**: every cloned instance
runs interest classification using the recipient's own Hyperagent LLM (Sonnet
by default).

## Three buckets

| Bucket | Apply when |
|---|---|
| **1 Interested** | Explicit interest in meeting (asks for time, "happy to chat", "let's set up a call"), or qualified inbound use case (specific Airtable workflow described AND user count > 15 or 30+ editor implication). Source: Luke's HR qualification rule. |
| **1 Maybe** | Soft interest / asking for info but non-committal, "send me more info", "we may revisit later", "what's the pricing?", curious but not committing to a meeting. |
| **1 Not Interested** | Explicit decline ("no thanks", "not at this time", "remove me", "unsubscribe", "we're not looking"), wrong person ("you have the wrong person", "I don't work in this area"), or hostile / spam-flagged. |

## Inputs the agent uses

- The original outbound message (if available in thread) — gives context for whether the reply is to a sales pitch vs cold ask.
- The prospect's reply body (full text or first ~1500 chars).
- The subject line (sometimes contains "unsubscribe" / "stop").
- The prospect's seniority and source bucket (helps prioritize tie-breaks but
  does NOT change the interest label — interest is about the reply content
  only).

## Prompt the agent runs inline

> You are classifying a prospect's reply into one of three interest buckets:
> Interested, Maybe, or Not Interested.
>
> **Reply body:** <body>
> **Subject:** <subject>
> **Original outreach (if available):** <original>
>
> Rules:
> 1. **Interested** = explicit meeting request OR qualified use case (specific
>    Airtable workflow + 15+ users / 30+ editor implication).
> 2. **Maybe** = soft interest, "tell me more", non-committal, asks for info.
> 3. **Not Interested** = explicit decline, wrong person, unsubscribe-like
>    language.
>
> Return JSON: `{"label": "Interested" | "Maybe" | "Not Interested",
> "confidence": "high" | "medium" | "low", "reason": "<one sentence>"}`
>
> When confidence is low, default toward Maybe (the safer middle bucket).
> Never default to Interested or Not Interested under uncertainty — both
> trigger action / removal and a wrong call is costly.

## Edge cases

- **Auto-replies** that slipped past detect_archive_candidate.py
  (rare but possible) → classify as Maybe (the human will resurface when back).
  Do NOT classify as Not Interested just because the reply is automated.
- **Forwarded internal threads** ("FYI", "+jane") → classify as Maybe; the
  prospect is sharing internally, which is signal but not commitment.
- **Reply asks for time AND declines current ask** ("not for this week but
  reach out next quarter") → classify as Maybe (positive future intent).
- **Reply explicitly says "interested" but with no use case or scale** →
  classify as Maybe (HR rule: needs use case + scale to be true Interested).

## Cross-skill composability

The Prospect Reply Drafter agent's Step 0/Step 4 logic mirrors this taxonomy
(`interest_tag`: Interested / Maybe / Not interested). The Inbox Triage skill
should write the same three-bucket value into a Gmail label and into any
downstream Zapier webhook payload so the Drafter agent can route on
`interest_tag` directly without re-classification.
