#!/usr/bin/env python3
"""
Sequence Validator — checks a generated outbound sequence (emails + LinkedIn)
against the rules in the Sequence Generation skill.

Usage:
    python3 validate_sequence.py --file sequence.json [--strict] [--json]

Expected JSON shape: see the Sequence Generation skill documentation. At minimum:
    {
      "prospect": {"name": "...", "title": "...", "company": "..."},
      "config": {
        "sequence_length": 5,
        "email_delay_days": 3,
        "website_url": "https://... or null",
        "cta_mode": "website" | "chat_ask",
        "signoff_name": "Luke"          # the AE's first name used as the email sign-off
      },
      "emails": [
        {
          "step": 1,
          "role": "Observation + Proof Point",
          "subject": "...",
          "body": "...",
          "wait_days": 0,
          "word_count": 0,
          "proof_point_used": "Rivian" | null,
          "cta_present": true | false
        }, ...
      ],
      "linkedin": {
        "connect_message": "...",          # day-of-E1, ≤300 chars, no URL, no Airtable
        "followup_template": "...",        # post-acceptance text DM, references POV + URL?src=li
        "voice_note_script": "...",        # optional 5-beat voice DM script, eleven_v3 tags ok
        "stops_on_any_response": true
      }
    }

Exit codes:
    0 = pass (no errors, may have warnings)
    1 = fail (one or more errors)
    2 = bad input / file not found / malformed JSON

In --strict mode, warnings also fail.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Canonical banned-terms list (shared with POV Generation, LinkedIn Voice Note,
# and any future outbound-content skill).
# ---------------------------------------------------------------------------

BANNED_TERMS_BODY = [
    # Internal sales / intent data (never in prospect-facing content)
    ("6sense", "Internal intent data — never in prospect-facing copy"),
    ("gps score", "GPS scores are internal-only"),
    ("intent stage", "Intent stage is internal-only"),
    ("purchase stage", "Purchase stage is internal-only"),
    ("marketing touch", "Marketing touch counts are internal-only"),
    ("self-serve user", "Self-serve usage is internal-only"),
    ("self serve user", "Self-serve usage is internal-only"),
    ("prior deal", "Prior deal history is internal-only"),
    ("win-back", "Win-back framing is internal-only"),
    ("winback", "Win-back framing is internal-only"),
    ("churn", "Churn framing is internal-only"),
    ("high-intent", "Internal sales language"),
    ("high intent", "Internal sales language"),
    # Product-pitch language
    ("airtable", "Never name 'Airtable' in the email body — implicit, not explicit"),
    ("our platform", "Product pitch language"),
    ("our product", "Product pitch language"),
    ("exactly what", "Product pitch closer"),
    ("perfect for this", "Product pitch closer"),
    ("unlocks", "Product pitch language"),
    ("sticky", "Product pitch language"),
    ("makes tooling sticky", "Product pitch language"),
    # Sequence-specific banned phrases (from the spec)
    ("caught my attention", "Generic BDR opener — banned"),
    ("stood out to me", "Generic BDR opener — banned"),
    ("i was impressed by", "Generic BDR opener — banned"),
    ("leverage", "Banned filler verb — use a specific verb"),
    ("utilize", "Banned filler verb — use 'use'"),
    ("most teams assume", "Lecturing the prospect — banned"),
    ("the common mistake is", "Lecturing the prospect — banned"),
    ("i wanted to reach out because", "Generic BDR opener — banned"),
    ("hope this finds you well", "Generic BDR opener — banned"),
    ("as a leader in", "Generic BDR opener — banned"),
    ("circling back", "Lazy follow-up phrase — banned"),
    ("just checking in", "Lazy follow-up phrase — banned"),
    ("touching base", "Lazy follow-up phrase — banned"),
    ("i noticed your company is going through a transformation",
        "Vague and surveillance-y — banned"),
]

# Lecture-pattern regex (two-piece match that's hard to express as a literal)
LECTURE_REGEX = [
    (r"what most\s+[a-z]+\s+don'?t realize",
        "Lecturing the prospect ('what most X don't realize') — banned"),
    (r"the (real )?problem (with|for)\s+[a-z]+\s+is",
        "Lecturing the prospect — banned"),
]

# Surveillance phrases (warning level)
SURVEILLANCE_PATTERNS = [
    (r"i (saw|noticed|observed) (that )?you (posted|tweeted|shared)",
        "Surveillance tone — reframe to 'Given X is happening' or similar"),
    (r"i (saw|noticed) your company is",
        "Surveillance tone — reframe"),
]

# ---------------------------------------------------------------------------
# Role word caps (upper bound only — under is fine unless extremely short)
# ---------------------------------------------------------------------------

ROLE_WORD_CAPS = {
    "Observation + Proof Point": 100,
    "Observation → Problem → Proof → Ask": 100,
    "Casual bump": 60,
    "Trigger → Insight → Ask": 80,
    "Different angle": 80,
    "Insight → Resource Share": 80,
    "Industry observation": 80,
    "Reframe → Problem → Ask": 80,
    "Proof point quote": 80,
    "Peer reframe": 90,
    "Story → Bridge → Ask": 90,
    "Question → Value → Ask": 80,
    "Goal state vision": 80,
    "Specific use case": 80,
    "Pattern from a peer": 80,
    "Question reframe": 70,
    "Engagement-adaptive bump": 50,
    "Breakup": 60,
}

# Roles that have a soft floor (warn if shorter than this)
ROLE_WORD_FLOORS = {
    "Casual bump": 40,
    "Question reframe": 50,
}

# ---------------------------------------------------------------------------
# Length-to-role canonical mapping (from the spec). Used to detect a sequence
# that does not match its declared length.
# ---------------------------------------------------------------------------

CANONICAL_SHAPES = {
    3: ["Observation + Proof Point", "Casual bump", "Breakup"],
    4: ["Observation + Proof Point", "Casual bump", "Different angle", "Breakup"],
    5: ["Observation + Proof Point", "Casual bump", "Different angle",
        "Industry observation", "Breakup"],
    6: ["Observation + Proof Point", "Casual bump", "Different angle",
        "Industry observation", "Peer reframe", "Breakup"],
    7: ["Observation + Proof Point", "Casual bump", "Different angle",
        "Industry observation", "Proof point quote", "Peer reframe", "Breakup"],
    8: ["Observation + Proof Point", "Casual bump", "Different angle",
        "Industry observation", "Proof point quote", "Goal state vision",
        "Peer reframe", "Breakup"],
    9: ["Observation + Proof Point", "Casual bump", "Different angle",
        "Industry observation", "Proof point quote", "Goal state vision",
        "Specific use case", "Peer reframe", "Breakup"],
    10: ["Observation + Proof Point", "Casual bump", "Different angle",
         "Industry observation", "Proof point quote", "Goal state vision",
         "Specific use case", "Pattern from a peer", "Peer reframe", "Breakup"],
    11: ["Observation + Proof Point", "Casual bump", "Different angle",
         "Industry observation", "Proof point quote", "Goal state vision",
         "Specific use case", "Pattern from a peer", "Question reframe",
         "Peer reframe", "Breakup"],
    12: ["Observation + Proof Point", "Casual bump", "Different angle",
         "Industry observation", "Proof point quote", "Goal state vision",
         "Specific use case", "Pattern from a peer", "Question reframe",
         "Engagement-adaptive bump", "Peer reframe", "Breakup"],
}
# 13-15 extend the middle with additional Different angle / Pattern from a peer /
# Question reframe variants — checked structurally, not by exact match.

# ---------------------------------------------------------------------------
# Findings helpers
# ---------------------------------------------------------------------------

Finding = tuple[str, str, str]  # (severity, rule, message)

URL_RE = re.compile(r"https?://\S+", re.IGNORECASE)


def count_words(text: str) -> int:
    return len([w for w in text.strip().split() if w])


def strip_urls(text: str) -> str:
    """Remove URL substrings so banned-term checks don't false-positive on link text
    (e.g. 'airtable.com' in a CTA URL is not a brand mention in prose)."""
    return URL_RE.sub(" ", text)


GREETING_RE = re.compile(r"^(Hi|Hey|Hello|Hi there)\s+[A-Z][a-zA-Z'\-]+\s*,?\s*$", re.IGNORECASE)


def first_sentence(text: str) -> str:
    """Return the first content sentence (after greeting if present)."""
    text = text.strip()
    lines = text.splitlines()
    # Skip greeting line + leading blank lines
    while lines:
        first = lines[0].strip()
        if not first:
            lines = lines[1:]
            continue
        if GREETING_RE.match(first):
            lines = lines[1:]
            continue
        break
    if not lines:
        return ""
    rest = "\n".join(lines).strip()
    m = re.search(r"^(.+?[.!?])(\s|$)", rest, flags=re.DOTALL)
    if m:
        return m.group(1).strip()
    return rest.split("\n")[0]


def has_em_dash(text: str) -> bool:
    return "—" in text or "–" in text  # em dash, en dash


# ---------------------------------------------------------------------------
# Per-email checks
# ---------------------------------------------------------------------------

def check_banned_in_body(body: str, location: str) -> list[Finding]:
    findings: list[Finding] = []
    # Strip URLs first so 'airtable' inside a CTA link doesn't false-positive.
    lower = strip_urls(body).lower()
    for term, reason in BANNED_TERMS_BODY:
        # Word-boundary match for short terms, substring for long ones.
        if len(term) <= 8:
            if re.search(rf"\b{re.escape(term)}\b", lower):
                findings.append(("ERROR", f"banned:{term}", f"[{location}] {reason}"))
        else:
            if term in lower:
                findings.append(("ERROR", f"banned:{term}", f"[{location}] {reason}"))
    for pattern, reason in LECTURE_REGEX:
        if re.search(pattern, lower):
            findings.append(("ERROR", f"lecture:{pattern[:30]}", f"[{location}] {reason}"))
    for pattern, reason in SURVEILLANCE_PATTERNS:
        if re.search(pattern, lower):
            findings.append(("WARN", f"surveillance:{pattern[:30]}", f"[{location}] {reason}"))
    return findings


def check_subject(subject: str, step: int) -> list[Finding]:
    loc = f"email[{step}].subject"
    findings: list[Finding] = []
    if not subject or not subject.strip():
        return [("ERROR", "subject_missing", f"[{loc}] subject is empty")]
    s = subject.strip()
    wc = count_words(s)
    if wc < 2:
        findings.append(("ERROR", "subject_too_short", f"[{loc}] {wc} words — need 2-6 (2-4 sweet spot)"))
    elif wc > 6:
        findings.append(("ERROR", "subject_too_long", f"[{loc}] {wc} words — max 6"))
    # All lowercase
    if s != s.lower():
        findings.append(("ERROR", "subject_case", f"[{loc}] must be all lowercase"))
    # No punctuation (allow hyphens between words and middle-dot · which appears in spec examples)
    if re.search(r"[.!?,;:\"‘’“”\(\)\[\]]", s):
        findings.append(("ERROR", "subject_punct", f"[{loc}] no punctuation allowed"))
    # No prospect name / company name — we don't have the raw values here at
    # subject-check time, so this check is wired up at the sequence level.
    return findings


def check_first_sentence(body: str, step: int) -> list[Finding]:
    loc = f"email[{step}].body.first_sentence"
    fs = first_sentence(body)
    if len(fs) > 90:
        return [("ERROR", "first_sentence_long",
                 f"[{loc}] {len(fs)} chars — must be <90 (inbox preview rule)")]
    return []


VALID_CLOSERS = ("Best,", "Thanks,", "Cheers,")


def check_sign_off(body: str, step: int, signoff_name: str) -> list[Finding]:
    """Sign-off is JUST the AE first name on its own line.

    No 'Best,' / 'Thanks,' / 'Cheers,' closer is allowed above it or combined
    with it. This matches Luke's durable outbound rule.
    """
    loc = f"email[{step}].body.sign_off"
    findings: list[Finding] = []
    if not signoff_name:
        return [("ERROR", "sign_off_config_missing",
                 f"[{loc}] config.signoff_name not set — required for portable sign-off check")]
    lines = [ln.strip() for ln in body.strip().splitlines() if ln.strip()]
    if len(lines) < 2:
        return [("ERROR", "sign_off_missing",
                 f"[{loc}] body needs at least greeting, content, and a name-only sign-off")]
    last = lines[-1]
    second_last = lines[-2] if len(lines) >= 2 else ""
    if last != signoff_name:
        findings.append(("ERROR", "sign_off_name_wrong",
                         f"[{loc}] last line must be {signoff_name!r}, got: {last!r}"))
    if re.match(rf"^(Best|Thanks|Cheers|Regards)[\s,]+{re.escape(signoff_name)}\s*$",
                last, re.IGNORECASE):
        findings.append(("ERROR", "sign_off_one_line",
                         f"[{loc}] closer and name must not be combined; use only {signoff_name!r} on the final line"))
    if second_last in VALID_CLOSERS or second_last.rstrip(",") in ("Best", "Thanks", "Cheers", "Regards"):
        findings.append(("ERROR", "sign_off_decorated",
                         f"[{loc}] remove closer line {second_last!r}; sign-off is just {signoff_name!r}"))
    return findings


def check_greeting(body: str, prospect_first_name: str, step: int) -> list[Finding]:
    """First non-blank line of body must be `Hi {first_name},` (or Hey/Hello)."""
    loc = f"email[{step}].body.greeting"
    if not prospect_first_name:
        return [("ERROR", "greeting_no_name",
                 f"[{loc}] prospect first name not derivable from prospect.name")]
    lines = [ln for ln in body.strip().splitlines() if ln.strip()]
    if not lines:
        return [("ERROR", "greeting_missing", f"[{loc}] body has no content")]
    first = lines[0].strip()
    expected_re = rf"^(Hi|Hey|Hello)\s+{re.escape(prospect_first_name)}\s*,\s*$"
    if not re.match(expected_re, first):
        return [("ERROR", "greeting_wrong",
                 f"[{loc}] first line must be 'Hi {prospect_first_name},' (or Hey/Hello); got: {first!r}")]
    return []


def check_spacing(body: str, step: int) -> list[Finding]:
    """Body should have at least 2 blank-line separators to space greeting / paragraphs / sign-off."""
    if body.count("\n\n") < 2:
        return [("WARN", "spacing_tight",
                 f"[email[{step}].body] needs blank lines between greeting, paragraphs, and sign-off")]
    return []


def check_title_leakage(body: str, prospect_title: str, step: int) -> list[Finding]:
    """Detect 'As Director of X, you...' style title-mirroring."""
    if not prospect_title:
        return []
    loc = f"email[{step}].body"
    lower = body.lower()
    title_lower = prospect_title.lower().strip()
    # If the title appears immediately after "as a/an/the" or "as [name],"
    patterns = [
        rf"\bas (a |an |the )?{re.escape(title_lower)}\b",
        rf"\byou(?:'re| are), (?:a |an |the )?{re.escape(title_lower)}\b",
    ]
    for pattern in patterns:
        if re.search(pattern, lower):
            return [("ERROR", "title_leakage",
                     f"[{loc}] mirrors prospect title back to them: {prospect_title!r}")]
    return []


def check_word_cap(body: str, role: str, step: int) -> list[Finding]:
    loc = f"email[{step}].body"
    findings: list[Finding] = []
    wc = count_words(body)
    cap = ROLE_WORD_CAPS.get(role)
    floor = ROLE_WORD_FLOORS.get(role)
    if cap and wc > cap:
        findings.append(("ERROR", "word_cap",
                         f"[{loc}] role '{role}': {wc} words exceeds cap {cap}"))
    if floor and wc < floor:
        findings.append(("WARN", "word_floor",
                         f"[{loc}] role '{role}': {wc} words under floor {floor}"))
    if wc < 20 and role != "Casual bump":
        findings.append(("WARN", "very_short",
                         f"[{loc}] only {wc} words — verify role and content"))
    return findings


def check_cta(email: dict[str, Any], cta_mode: str, step: int, is_last: bool,
              website_url: str | None) -> list[Finding]:
    loc = f"email[{step}].cta"
    findings: list[Finding] = []
    cta_present = bool(email.get("cta_present"))
    body = email.get("body", "")

    if cta_mode == "website":
        if not website_url:
            findings.append(("ERROR", "cta_mode_mismatch",
                             f"[{loc}] cta_mode=website but config.website_url is empty"))
        # E1 must NEVER contain the link — soft text CTA only. The link starts at E2.
        if step == 1:
            if website_url and website_url in body:
                findings.append(("ERROR", "e1_has_url",
                                 f"[{loc}] E1 must not contain the website URL — use a soft text CTA like 'If this resonates, let me know.'"))
        else:
            if website_url and website_url not in body:
                findings.append(("ERROR", "cta_url_missing",
                                 f"[{loc}] website_url not present in body but cta_mode=website (E{step})"))
            if not cta_present:
                findings.append(("WARN", "cta_present_false",
                                 f"[{loc}] cta_present=false but cta_mode=website — expected link"))
    else:  # chat_ask
        # E1-E2 may have no CTA; E3+ should have a soft chat ask.
        soft_ask_patterns = [
            r"open for a (quick )?(chat|conversation)",
            r"worth (a quick )?(\d{1,2}\s*min(ute)?s?\s+)?(conversation|chat)",
            r"happy to walk through",
            r"let'?s connect for",
            r"if this is relevant, let'?s",
        ]
        has_soft_ask = any(re.search(p, body, re.IGNORECASE) for p in soft_ask_patterns)
        if step >= 3 and not is_last and not has_soft_ask:
            findings.append(("WARN", "soft_ask_missing",
                             f"[{loc}] E{step} (chat_ask mode) has no detectable soft meeting ask"))

    # Always-banned CTA escalation language
    escalation_patterns = [
        (r"book \d+\s*min(ute)?s? on (your|my) calendar", "presumptuous CTA — too aggressive"),
        (r"let me book (time|a meeting)", "presumptuous CTA — too aggressive"),
        (r"grab (?:a |some )?time on (your|my) calendar", "presumptuous CTA — too aggressive"),
    ]
    for pattern, reason in escalation_patterns:
        if re.search(pattern, body, re.IGNORECASE):
            findings.append(("ERROR", "cta_escalation", f"[{loc}] {reason}"))

    return findings


def check_email(email: dict[str, Any], prospect_title: str, cta_mode: str,
                website_url: str | None, is_last: bool,
                signoff_name: str, prospect_first_name: str) -> list[Finding]:
    findings: list[Finding] = []
    step = email.get("step", "?")
    role = email.get("role", "")
    body = email.get("body", "")
    subject = email.get("subject", "")

    if not body:
        return [("ERROR", "body_missing", f"[email[{step}]] body is empty")]

    if has_em_dash(body):
        findings.append(("ERROR", "em_dash",
                         f"[email[{step}].body] contains em or en dash — use periods/commas/semicolons"))
    if has_em_dash(subject):
        findings.append(("ERROR", "em_dash_subject",
                         f"[email[{step}].subject] contains em dash"))

    findings.extend(check_subject(subject, step))
    findings.extend(check_greeting(body, prospect_first_name, step))
    findings.extend(check_spacing(body, step))
    findings.extend(check_first_sentence(body, step))
    findings.extend(check_sign_off(body, step, signoff_name))
    findings.extend(check_title_leakage(body, prospect_title, step))
    findings.extend(check_word_cap(body, role, step))
    findings.extend(check_banned_in_body(body, f"email[{step}].body"))
    findings.extend(check_cta(email, cta_mode, step, is_last, website_url))

    # Last email should be Breakup role
    if is_last and role != "Breakup":
        findings.append(("ERROR", "final_not_breakup",
                         f"[email[{step}]] final email role is {role!r}, must be 'Breakup'"))

    return findings


# ---------------------------------------------------------------------------
# Sequence-level checks
# ---------------------------------------------------------------------------

def check_sequence_shape(emails: list[dict[str, Any]], length: int) -> list[Finding]:
    """Validate flexible Corey Haines role shapes.

    The old fixed length-to-role map is advisory only. Enforce the durable
    structural rules: length matches, E1 is an observation/trigger variant,
    final email is Breakup, and adjacent middle emails don't repeat the same
    framework.
    """
    findings: list[Finding] = []
    roles = [e.get("role", "") for e in emails]
    if length != len(emails):
        findings.append(("ERROR", "length_mismatch",
                         f"sequence_length={length} but {len(emails)} emails generated"))
    e1_allowed = {"Observation + Proof Point", "Observation → Problem → Proof → Ask", "Trigger → Insight → Ask"}
    if roles and roles[0] not in e1_allowed:
        findings.append(("ERROR", "first_not_observation",
                         f"E1 role is {roles[0]!r}; use an observation/trigger variant"))
    if roles and roles[-1] != "Breakup":
        findings.append(("ERROR", "last_not_breakup",
                         f"E{len(roles)} role is {roles[-1]!r}, must be 'Breakup'"))
    for idx in range(1, max(1, len(roles) - 1)):
        if roles[idx] and roles[idx] == roles[idx - 1]:
            findings.append(("WARN", "adjacent_shape_repeat",
                             f"E{idx} and E{idx+1} both use {roles[idx]!r}; vary the angle/framework"))
    return findings


def check_proof_points_unique(emails: list[dict[str, Any]]) -> list[Finding]:
    seen: dict[str, int] = {}
    findings: list[Finding] = []
    for e in emails:
        pp = (e.get("proof_point_used") or "").strip()
        if not pp:
            continue
        seen[pp] = seen.get(pp, 0) + 1
    for pp, count in seen.items():
        if count > 1:
            findings.append(("ERROR", "proof_point_repeat",
                             f"proof point {pp!r} used {count} times — must be unique per sequence"))
    return findings


def expected_wait_day(index: int) -> int:
    """Canonical non-uniform 3/5/7 cadence by email index.

    E1=0, E2=3, E3=8, E4=15, then every later email adds 7 days.
    This is independent of config.email_delay_days; that legacy config may be
    null for new generated sequences and is ignored for cadence validation.
    """
    if index <= 0:
        return 0
    if index == 1:
        return 3
    return 8 + 7 * (index - 2)


def check_wait_days(emails: list[dict[str, Any]]) -> list[Finding]:
    findings: list[Finding] = []
    for i, e in enumerate(emails):
        expected = expected_wait_day(i)
        actual = e.get("wait_days")
        if actual is None:
            findings.append(("ERROR", "wait_days_missing",
                             f"email[{e.get('step', i+1)}].wait_days is missing"))
        elif actual != expected:
            findings.append(("ERROR", "wait_days_mismatch",
                             f"email[{e.get('step', i+1)}].wait_days={actual}, expected canonical {expected}"))
    return findings


def check_subject_no_name(emails: list[dict[str, Any]], prospect_name: str,
                          company: str) -> list[Finding]:
    findings: list[Finding] = []
    name_parts = [p for p in re.split(r"\s+", (prospect_name or "").lower()) if len(p) > 2]
    company_lower = (company or "").lower().strip()
    for e in emails:
        subj = (e.get("subject") or "").lower()
        for part in name_parts:
            if re.search(rf"\b{re.escape(part)}\b", subj):
                findings.append(("ERROR", "subject_has_name",
                                 f"email[{e.get('step')}].subject contains prospect name part {part!r}"))
                break
        if company_lower and len(company_lower) > 2 and re.search(
                rf"\b{re.escape(company_lower)}\b", subj):
            findings.append(("ERROR", "subject_has_company",
                             f"email[{e.get('step')}].subject contains company name {company_lower!r}"))
    return findings


def check_linkedin(li: dict[str, Any]) -> list[Finding]:
    """Validate LinkedIn touches. Default is 3 touches:
      1. connect_message (300 char limit, no URL, no Airtable, sent day of E1)
      2. followup_template (post-acceptance DM, may include website_url with ?src=li)
      3. voice_note_script (optional but standard — feeds the LinkedIn Voice Note skill)
    """
    findings: list[Finding] = []
    if not li:
        return [("ERROR", "linkedin_missing", "linkedin object is missing")]

    # --- LI-1: connect_message ---
    connect = li.get("connect_message", "") or ""
    if not connect.strip():
        findings.append(("ERROR", "li_connect_missing", "linkedin.connect_message is empty"))
    if len(connect) > 300:
        findings.append(("ERROR", "li_connect_too_long",
                         f"linkedin.connect_message is {len(connect)} chars — must be ≤300"))
    if "airtable" in strip_urls(connect).lower():
        findings.append(("ERROR", "li_connect_has_airtable",
                         "linkedin.connect_message mentions Airtable — banned"))
    if re.search(r"https?://", connect):
        findings.append(("ERROR", "li_connect_has_url",
                         "linkedin.connect_message contains a URL — banned in the connect request"))
    if has_em_dash(connect):
        findings.append(("WARN", "li_connect_em_dash",
                         "linkedin.connect_message has em dash — prefer plain punctuation"))

    # --- LI-2: followup_template ---
    followup = li.get("followup_template", "") or ""
    if followup and "airtable" in strip_urls(followup).lower():
        findings.append(("ERROR", "li_followup_has_airtable",
                         "linkedin.followup_template mentions Airtable — banned"))
    if followup and has_em_dash(followup):
        findings.append(("WARN", "li_followup_em_dash",
                         "linkedin.followup_template has em dash"))

    # --- LI-3: voice_note_script (optional but standard for default LI = 3 touches) ---
    voice_script = li.get("voice_note_script", "") or ""
    if voice_script:
        # Word count — LinkedIn voice notes should be tight (~30-45 words / 30s).
        # Strip bracketed audio tags (e.g. [casual]) before counting words.
        words_only = re.sub(r"\[[a-zA-Z_-]+\]", " ", voice_script)
        wc = count_words(words_only)
        if wc > 45:
            findings.append(("ERROR", "li_voice_too_long",
                             f"linkedin.voice_note_script is {wc} words — LinkedIn voice note ceiling is ~45 words / ~30s"))
        elif wc < 15:
            findings.append(("WARN", "li_voice_short",
                             f"linkedin.voice_note_script is {wc} words — may feel abrupt"))
        if "airtable" in strip_urls(voice_script).lower():
            findings.append(("ERROR", "li_voice_has_airtable",
                             "linkedin.voice_note_script mentions Airtable — banned"))
        if has_em_dash(voice_script):
            findings.append(("WARN", "li_voice_em_dash",
                             "linkedin.voice_note_script has em dash — voice notes use ellipses for pauses, not em dashes"))
        # Sanity: catch product-pitch closers
        for term in ("exactly what", "perfect for this", "unlocks", "sticky"):
            if re.search(rf"\b{re.escape(term)}\b", voice_script.lower()):
                findings.append(("ERROR", f"li_voice_banned:{term}",
                                 f"linkedin.voice_note_script contains banned product-pitch language: {term!r}"))

    if li.get("stops_on_any_response") is not True:
        findings.append(("ERROR", "li_stop_rule",
                         "linkedin.stops_on_any_response must be true"))

    return findings


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------

def validate(data: dict[str, Any]) -> list[Finding]:
    findings: list[Finding] = []
    prospect = data.get("prospect", {}) or {}
    config = data.get("config", {}) or {}
    emails = data.get("emails", []) or []
    linkedin = data.get("linkedin", {}) or {}

    sequence_length = config.get("sequence_length")
    email_delay_days = config.get("email_delay_days")
    website_url = config.get("website_url")
    cta_mode = config.get("cta_mode", "chat_ask")
    signoff_name = (config.get("signoff_name") or "").strip()

    if not isinstance(sequence_length, int) or not (3 <= sequence_length <= 15):
        findings.append(("ERROR", "config_sequence_length",
                         f"config.sequence_length={sequence_length} — must be int 3-15"))

    if not signoff_name:
        findings.append(("ERROR", "config_signoff_missing",
                         "config.signoff_name is required for the portable sign-off check (e.g. 'Luke', 'Maria')"))

    if cta_mode not in ("website", "chat_ask"):
        findings.append(("ERROR", "config_cta_mode",
                         f"config.cta_mode={cta_mode!r} — must be 'website' or 'chat_ask'"))

    if cta_mode == "website" and not website_url:
        findings.append(("ERROR", "config_cta_url_missing",
                         "cta_mode=website but config.website_url is empty"))

    if not emails:
        findings.append(("ERROR", "no_emails", "emails array is empty"))
        return findings

    # Derive prospect first name from prospect.name (used for greeting check).
    prospect_full_name = (prospect.get("name") or "").strip()
    prospect_first_name = prospect_full_name.split()[0] if prospect_full_name else ""

    # Per-email checks
    for idx, email in enumerate(emails):
        is_last = (idx == len(emails) - 1)
        findings.extend(check_email(
            email,
            prospect_title=prospect.get("title", ""),
            cta_mode=cta_mode,
            website_url=website_url,
            is_last=is_last,
            signoff_name=signoff_name,
            prospect_first_name=prospect_first_name,
        ))

    # Sequence-level checks
    if isinstance(sequence_length, int):
        findings.extend(check_sequence_shape(emails, sequence_length))
    findings.extend(check_proof_points_unique(emails))
    # Cadence is canonical/non-uniform, not config-driven uniform multiplication.
    # Legacy config.email_delay_days is ignored; new callers may set it to null.
    findings.extend(check_wait_days(emails))
    findings.extend(check_subject_no_name(
        emails,
        prospect.get("name", ""),
        prospect.get("company", ""),
    ))

    # LinkedIn
    findings.extend(check_linkedin(linkedin))

    return findings


def render_report(findings: list[Finding]) -> str:
    if not findings:
        return "PASS — sequence validates clean."
    errors = [f for f in findings if f[0] == "ERROR"]
    warnings = [f for f in findings if f[0] == "WARN"]
    lines: list[str] = []
    if errors:
        lines.append(f"ERRORS ({len(errors)}):")
        for _, rule, msg in errors:
            lines.append(f"  [E] {rule}: {msg}")
    if warnings:
        lines.append(f"WARNINGS ({len(warnings)}):")
        for _, rule, msg in warnings:
            lines.append(f"  [W] {rule}: {msg}")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Validate a generated outbound sequence (emails + LinkedIn) against framework rules.",
    )
    ap.add_argument("--file", required=True, help="Path to JSON file with the sequence object")
    ap.add_argument("--strict", action="store_true", help="Treat warnings as failures")
    ap.add_argument("--json", action="store_true", help="Output JSON instead of human text")
    args = ap.parse_args()

    path = Path(args.file)
    if not path.exists():
        print(f"File not found: {args.file}", file=sys.stderr)
        return 2
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as e:
        print(f"Malformed JSON: {e}", file=sys.stderr)
        return 2

    findings = validate(data)
    has_error = any(f[0] == "ERROR" for f in findings)
    has_warn = any(f[0] == "WARN" for f in findings)

    if args.json:
        print(json.dumps({
            "pass": not has_error and (not args.strict or not has_warn),
            "error_count": sum(1 for f in findings if f[0] == "ERROR"),
            "warning_count": sum(1 for f in findings if f[0] == "WARN"),
            "findings": [{"severity": s, "rule": r, "message": m} for s, r, m in findings],
        }, indent=2))
    else:
        print(render_report(findings))

    if has_error or (args.strict and has_warn):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
