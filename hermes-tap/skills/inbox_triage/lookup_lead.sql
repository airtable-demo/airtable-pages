-- lookup_lead.sql — Databricks SQL template for matching an inbound prospect
-- email to the SFDC Lead table and returning the 5-bucket source category
-- alongside enrichment fields the agent uses for downstream classification.
--
-- The agent substitutes {{EMAILS}} with a comma-separated list of single-quoted
-- lowercased email addresses (e.g., 'jane@acme.com','bob@acme.com') and runs via
-- ExecuteDatabricksQuery. Batching one query per morning run keeps Databricks
-- load minimal.
--
-- The 5-bucket source category mirrors Luke's canonical taxonomy, priority
-- ordered (highest signal wins):
--   1. Handraiser     latest_handraiser_date_c IS NOT NULL
--   2. Moving Champion is_cr_champion_mover_c = true
--   3. PSU            product_sign_up_date_c IS NOT NULL
--   4. MQL            lead_source_category_c = 'MKTG-Generated' (and none of above)
--   5. Other          lead_source_category_c = 'Other' or null
--
-- Other returned fields:
--   title                            For classify_seniority.py input
--   first_name, last_name, company   For agent context / disambiguation
--   status, marketing_lifecycle_status_c   For downstream prioritization
--   owner_id                         Surface if not = current AE
--   created_date                     For freshness context
--
-- If the email is not in SFDC, the row is omitted from the result set — agent
-- treats unmatched senders as cold prospects (no source label applied).

SELECT
  LOWER(email)                        AS email,
  id                                  AS lead_id,
  first_name,
  last_name,
  title,
  company,
  status,
  owner_id,
  created_date,
  marketing_lifecycle_status_c,
  lead_source,
  lead_source_category_c,
  lead_source_detail_c,
  product_sign_up_date_c,
  latest_handraiser_date_c,
  is_cr_champion_mover_c,
  CASE
    WHEN latest_handraiser_date_c IS NOT NULL THEN 'Handraiser'
    WHEN is_cr_champion_mover_c                 THEN 'Moving Champion'
    WHEN product_sign_up_date_c   IS NOT NULL THEN 'PSU'
    WHEN lead_source_category_c   = 'MKTG-Generated' THEN 'MQL'
    ELSE 'Other'
  END                                 AS source_bucket
FROM hanalytics_production.salesforce.lead
WHERE LOWER(email) IN ({{EMAILS}})
;
